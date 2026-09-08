import { describe, expect, it } from 'bun:test';
import { packExtensionDirectory } from '../src/pack';

describe('Extension SDK', () => {
  it('exposes the directory pack entrypoint', () => {
    expect(typeof packExtensionDirectory).toBe('function');
  });
});
