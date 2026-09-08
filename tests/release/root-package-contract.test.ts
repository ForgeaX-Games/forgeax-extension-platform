import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
  exports: Record<string, unknown>;
  workspaces?: string[];
};

describe('single Platform package release contract', () => {
  it('exports discovery and transport from the root version', () => {
    expect(packageJson.name).toBe('@forgeax/extension-platform');
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.exports['./discovery']).toBeDefined();
    expect(packageJson.exports['./transport']).toBeDefined();
    expect(existsSync(resolve(ROOT, 'src/discovery/index.ts'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'src/transport/index.ts'))).toBe(true);
  });

  it('does not restore independent discovery, transport, or host SDK publish units', () => {
    const workspaces = packageJson.workspaces ?? [];
    expect(workspaces.some((workspace) => workspace.includes('discovery'))).toBe(false);
    expect(workspaces.some((workspace) => workspace.includes('transport'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'packages/discovery/package.json'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'packages/transport/package.json'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'packages/host-sdk/package.json'))).toBe(false);
  });

  it('keeps release scripts bound to the root package', () => {
    const publish = readFileSync(resolve(ROOT, '.github/workflows/publish.yml'), 'utf8');
    expect(publish).toContain('extension-platform');
    expect(publish).not.toContain('extension-discovery');
    expect(publish).not.toContain('extension-transport');
  });
});
