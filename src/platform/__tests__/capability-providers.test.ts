import { describe, expect, it, vi } from 'vitest';
import {
  CapabilityAmbiguousError,
  CapabilityUnavailableError,
  createCapabilityProviderRegistry,
} from '../capability-providers';
import { ExtensionConflictError } from '../errors';

const videoCapability = { id: 'media.video.generate', version: 1 } as const;

describe('CapabilityProviderRegistry', () => {
  it('registers and invokes a typed provider with host context', async () => {
    const registry = createCapabilityProviderRegistry<{ requestId: string }>();
    const invoke = vi.fn(async (input: { prompt: string }, context: { requestId: string }) => ({
      url: `https://cdn.example/${context.requestId}/${input.prompt}.mp4`,
    }));

    registry.register(
      {
        ref: videoCapability,
        providerId: 'arrival-kino',
        invoke,
      },
      'kino-extension',
    );

    await expect(
      registry.invoke<{ prompt: string }, { url: string }>(
        videoCapability,
        { prompt: 'intro' },
        { requestId: 'req-1' },
      ),
    ).resolves.toEqual({ url: 'https://cdn.example/req-1/intro.mp4' });
    expect(invoke).toHaveBeenCalledWith({ prompt: 'intro' }, { requestId: 'req-1' });
    expect(registry.list()).toEqual([
      {
        ref: videoCapability,
        providerId: 'arrival-kino',
        owner: 'kino-extension',
      },
    ]);
  });

  it('requires an explicit provider when a capability has multiple providers', async () => {
    const registry = createCapabilityProviderRegistry();
    registry.register(
      {
        ref: videoCapability,
        providerId: 'arrival-kino',
        invoke: () => ({ provider: 'arrival' }),
      },
      'arrival-extension',
    );
    registry.register(
      {
        ref: videoCapability,
        providerId: 'forgeax-kino',
        invoke: () => ({ provider: 'forgeax' }),
      },
      'forgeax-extension',
    );

    await expect(registry.invoke(videoCapability, {}, {})).rejects.toMatchObject({
      code: 'CAPABILITY_AMBIGUOUS',
      capability: videoCapability,
    } satisfies Partial<CapabilityAmbiguousError>);
    await expect(
      registry.invoke(videoCapability, {}, {}, 'forgeax-kino'),
    ).resolves.toEqual({ provider: 'forgeax' });
  });

  it('reports unavailable capability or provider with a stable error code', async () => {
    const registry = createCapabilityProviderRegistry();

    await expect(registry.invoke(videoCapability, {}, {})).rejects.toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
      capability: videoCapability,
    } satisfies Partial<CapabilityUnavailableError>);

    registry.register(
      {
        ref: videoCapability,
        providerId: 'arrival-kino',
        invoke: () => 'ok',
      },
      'arrival-extension',
    );
    await expect(
      registry.invoke(videoCapability, {}, {}, 'missing-provider'),
    ).rejects.toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
      providerId: 'missing-provider',
    } satisfies Partial<CapabilityUnavailableError>);
  });

  it('rejects duplicate provider identities and cleans up idempotently', () => {
    const registry = createCapabilityProviderRegistry();
    const provider = {
      ref: videoCapability,
      providerId: 'arrival-kino',
      invoke: () => 'ok',
    };
    const cleanup = registry.register(provider, 'arrival-extension');

    expect(() => registry.register(provider, 'another-extension')).toThrow(ExtensionConflictError);
    expect(registry.count()).toBe(1);
    cleanup();
    cleanup();
    expect(registry.count()).toBe(0);
    expect(registry.list()).toEqual([]);
  });

  it('emits add/remove events only for actual lifecycle changes', () => {
    const registry = createCapabilityProviderRegistry();
    const added = vi.fn();
    const removed = vi.fn();
    registry.on('added', added);
    registry.on('removed', removed);

    const cleanup = registry.register(
      {
        ref: videoCapability,
        providerId: 'arrival-kino',
        invoke: () => 'ok',
      },
      'arrival-extension',
    );
    expect(added).toHaveBeenCalledTimes(1);
    expect(added).toHaveBeenCalledWith({
      ref: videoCapability,
      providerId: 'arrival-kino',
      owner: 'arrival-extension',
    });
    cleanup();
    cleanup();
    expect(removed).toHaveBeenCalledTimes(1);
  });
});
