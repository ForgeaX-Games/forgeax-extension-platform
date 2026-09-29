import { describe, expect, it } from 'bun:test';
import { createCapabilityRegistry } from '../src/platform/capabilities';
import { createExtensionLoader, ExtensionCleanupDeferredError, ExtensionUnloadDeferredError } from '../src/extensions';

function harness() {
  const capabilities = createCapabilityRegistry<'ready'>();
  const errors: unknown[] = [];
  const loader = createExtensionLoader({
    capabilities, contextFactory: () => ({}), devMode: false,
    onError: (error) => { errors.push(error.cause); },
  });
  return { capabilities, loader, errors };
}

describe('explicit cleanup deferral', () => {
  it('reports incomplete unload and retries only retained records in original reverse order', async () => {
    const { loader, errors } = harness();
    const calls: string[] = [];
    let blocked = true;
    await loader.load(['first', 'barrier', 'last'].map((id) => ({
      id, version: '1', setup: () => async () => {
        calls.push(id);
        if (id === 'barrier' && blocked) throw new ExtensionCleanupDeferredError('not ready');
      },
    })));
    await expect(loader.unload()).rejects.toBeInstanceOf(ExtensionUnloadDeferredError);
    await loader.flush(); // A rejected unload must not poison the lifecycle queue.
    expect(calls).toEqual(['last', 'barrier']);
    expect(loader.getActive().map(({ id }) => id)).toEqual(['first', 'barrier']);
    expect(errors[0]).toBeInstanceOf(ExtensionCleanupDeferredError);
    blocked = false;
    await loader.unload();
    expect(calls).toEqual(['last', 'barrier', 'barrier', 'first']);
    expect(loader.getActive()).toEqual([]);
    await loader.unload();
    expect(calls).toHaveLength(4);
  });

  it('retains the exact active instance across removal/re-add without duplicate setup', async () => {
    const { capabilities, loader } = harness();
    capabilities.add('ready');
    let setups = 0;
    let cleanups = 0;
    let blocked = true;
    const manifest = {
      id: 'dependent', version: '1', requires: ['ready' as const],
      setup: () => { setups++; return () => {
        cleanups++;
        if (blocked) throw new ExtensionCleanupDeferredError();
      }; },
    };
    await loader.load([manifest]);
    capabilities.remove('ready');
    await loader.flush();
    expect(loader.getActive()).toEqual([manifest]);
    expect(loader.getPending()).toEqual([]);
    capabilities.add('ready');
    await loader.load([manifest]);
    await loader.flush();
    expect(setups).toBe(1);
    expect(cleanups).toBe(1);
    blocked = false;
    capabilities.remove('ready');
    await loader.flush();
    expect(loader.getActive()).toEqual([]);
    expect(loader.getPending()).toEqual([manifest]);
    capabilities.add('ready');
    await loader.flush();
    expect(setups).toBe(2);
    await loader.unload();
  });

  it('does not retry ordinary partially destructive cleanup failures or spoofed names', async () => {
    const { loader, errors } = harness();
    let calls = 0;
    await loader.load([{
      id: 'ordinary', version: '1', setup: () => () => {
        calls++;
        const error = new Error('already partially destroyed');
        error.name = 'ExtensionCleanupDeferredError';
        throw error;
      },
    }]);
    await loader.unload();
    await loader.unload();
    expect(calls).toBe(1);
    expect(errors).toHaveLength(1);
    expect(loader.getActive()).toEqual([]);
  });

  it('preserves pending declarations and capability subscriptions until final unload', async () => {
    const { capabilities, loader } = harness();
    let pendingSetups = 0;
    let blocked = true;
    const pending = {
      id: 'pending', version: '1', requires: ['ready' as const],
      setup: () => { pendingSetups++; },
    };
    await loader.load([
      pending,
      { id: 'barrier', version: '1', setup: () => () => {
        if (blocked) throw new ExtensionCleanupDeferredError();
      } },
    ]);
    await expect(loader.unload()).rejects.toMatchObject({ extensionId: 'barrier' });
    expect(loader.getPending()).toEqual([pending]);
    capabilities.add('ready');
    await loader.flush();
    expect(pendingSetups).toBe(1);
    blocked = false;
    await loader.unload();
    capabilities.remove('ready');
    capabilities.add('ready');
    await loader.flush();
    expect(loader.getPending()).toEqual([]);
    expect(loader.getActive()).toEqual([]);
    expect(pendingSetups).toBe(1);
    await loader.load([pending]);
    expect(pendingSetups).toBe(2);
    await loader.unload();
  });

  it('does not cross a reverse capability-cleanup barrier even when error reporting throws', async () => {
    const capabilities = createCapabilityRegistry<'ready'>();
    capabilities.add('ready');
    const loader = createExtensionLoader({
      capabilities, contextFactory: () => ({}), devMode: false,
      onError: () => { throw new Error('sink failed'); },
    });
    const calls: string[] = [];
    let blocked = true;
    await loader.load(['first', 'barrier', 'last'].map((id) => ({
      id, version: '1', requires: ['ready' as const], setup: () => () => {
        calls.push(id);
        if (id === 'barrier' && blocked) throw new ExtensionCleanupDeferredError();
      },
    })));
    capabilities.remove('ready');
    await loader.flush();
    expect(calls).toEqual(['last', 'barrier']);
    expect(loader.getActive().map(({ id }) => id)).toEqual(['first', 'barrier']);
    expect(loader.getPending().map(({ id }) => id)).toEqual(['last']);
    blocked = false;
    await loader.unload();
    expect(calls).toEqual(['last', 'barrier', 'barrier', 'first']);
    expect(loader.getPending()).toEqual([]);
  });

  it('serializes concurrent unload attempts and rejects only the deferred attempt', async () => {
    const { loader } = harness();
    let attempts = 0;
    await loader.load([{
      id: 'barrier', version: '1', setup: () => async () => {
        if (++attempts === 1) throw new ExtensionCleanupDeferredError();
      },
    }]);
    const results = await Promise.allSettled([loader.unload(), loader.unload()]);
    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');
    expect(attempts).toBe(2);
    expect(loader.getActive()).toEqual([]);
  });
});
