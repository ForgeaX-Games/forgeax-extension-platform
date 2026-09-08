import { describe, expect, it } from 'bun:test';
import { MemoryPreferenceStore, MemoryResourceStore, PlatformIoError, ResourceApi, type ResourceId } from './index';

describe('platform IO abstractions', () => {
  it('keeps resource and preference storage browser-safe', async () => {
    const resources = new MemoryResourceStore();
    const id = 'project://main' as ResourceId;
    await resources.write({ id, contentType: 'text/plain', bytes: new Uint8Array([1, 2]), revision: 'r1' });
    expect((await resources.read(id))?.bytes).toEqual(new Uint8Array([1, 2]));
    const preferences = new MemoryPreferenceStore();
    preferences.set('theme', 'dark');
    expect(preferences.get<string>('theme')).toBe('dark');
  });

  it('returns structured failures from an injected requester', async () => {
    const api = new ResourceApi(async () => ({ status: 403 }));
    try {
      await api.read('/project/main');
      throw new Error('expected request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformIoError);
      expect((error as PlatformIoError).failure.code).toBe('platform-io.request-failed');
      expect((error as PlatformIoError).failure.hint.length).toBeGreaterThan(0);
    }
  });
});
