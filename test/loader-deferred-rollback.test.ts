import { describe, expect, it } from 'bun:test';
import { createCapabilityRegistry } from '../src/platform/capabilities';
import { createExtensionLoader, ExtensionCleanupDeferredError, ExtensionSetupRollbackDeferredError } from '../src/extensions';

describe('deferred failed-setup rollback ownership', () => {
  it('retains reverse-order rollback without claiming activation or publishing capabilities', async () => {
    const capabilities = createCapabilityRegistry<'provided'>();
    const errors: unknown[] = [];
    const loader = createExtensionLoader({ capabilities, contextFactory: () => ({}), devMode: false,
      onError: (error) => { errors.push(error.cause); },
    });
    const calls: string[] = [];
    let blocked = true;
    const cause = new Error('setup failed');
    const failed = { id: 'failed', version: '1', provides: ['provided' as const], setup: () => {
      throw new ExtensionSetupRollbackDeferredError({ cause, rollback: () => {
        calls.push('rollback');
        if (blocked) throw new ExtensionCleanupDeferredError();
      } });
    } };
    await loader.load([
      { id: 'first', version: '1', setup: () => () => { calls.push('first'); } },
      failed,
      { id: 'last', version: '1', setup: () => () => { calls.push('last'); } },
    ]);
    expect(errors).toEqual([cause]);
    expect(loader.getActive().map(({ id }) => id)).toEqual(['first', 'last']);
    expect(loader.getPending()).toEqual([]);
    expect(capabilities.has('provided')).toBe(false);
    await expect(loader.unload()).rejects.toMatchObject({ extensionId: 'failed' });
    expect(calls).toEqual(['last', 'rollback']);
    expect(loader.getActive().map(({ id }) => id)).toEqual(['first']);
    blocked = false;
    await loader.unload();
    expect(calls).toEqual(['last', 'rollback', 'rollback', 'first']);
    await loader.unload();
    expect(calls).toHaveLength(4);
  });

  it('never reactivates a failed setup on repeated load or capability bounce', async () => {
    const capabilities = createCapabilityRegistry<'ready'>();
    capabilities.add('ready');
    const loader = createExtensionLoader({ capabilities, contextFactory: () => ({}), devMode: false, onError: () => {} });
    let setups = 0;
    let rollbackCalls = 0;
    let blocked = true;
    const failed = { id: 'failed', version: '1', requires: ['ready' as const], setup: () => {
      setups++;
      throw new ExtensionSetupRollbackDeferredError({ cause: new Error('failed'), rollback: () => {
        rollbackCalls++;
        if (blocked) throw new ExtensionCleanupDeferredError();
      } });
    } };
    await loader.load([failed]);
    await loader.load([failed]);
    capabilities.remove('ready');
    await loader.flush();
    capabilities.add('ready');
    await loader.flush();
    expect(setups).toBe(1);
    expect(rollbackCalls).toBe(1);
    expect(loader.getActive()).toEqual([]);
    expect(loader.getPending()).toEqual([]);
    blocked = false;
    capabilities.remove('ready');
    await loader.flush();
    capabilities.add('ready');
    await loader.load([failed]);
    expect(setups).toBe(1);
    expect(rollbackCalls).toBe(2);
    await loader.unload();
    expect(rollbackCalls).toBe(2);
  });

  it('retires ordinary rollback failures once and isolates a throwing error sink', async () => {
    const capabilities = createCapabilityRegistry<'ready'>();
    const loader = createExtensionLoader({ capabilities, contextFactory: () => ({}), devMode: false,
      onError: () => { throw new Error('sink failed'); },
    });
    let rollbackCalls = 0;
    await loader.load([{ id: 'failed', version: '1', setup: async () => {
      throw new ExtensionSetupRollbackDeferredError({ cause: new Error('setup'), rollback: async () => {
        rollbackCalls++;
        throw new Error('partial teardown failed');
      } });
    } }]);
    await loader.unload();
    await loader.unload();
    expect(rollbackCalls).toBe(1);
    expect(loader.getActive()).toEqual([]);
  });
});
