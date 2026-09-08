import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const root = resolve(import.meta.dir, '..');

describe('standalone app-shell ownership', () => {
  test('does not retain or build a nested app-shell workspace package', () => {
    const manifest = readFileSync(resolve(root, 'package.json'), 'utf8');
    const activeReleaseInventory = [
      'release/m2-versions.json',
      'release/provenance.json',
      'release/registry-release-evidence.json',
      'release/versions.json',
    ].map((path) => readFileSync(resolve(root, path), 'utf8'));

    expect(existsSync(resolve(root, 'packages/app-shell/package.json'))).toBe(false);
    expect(manifest).not.toContain('@forgeax/app-shell');
    for (const inventory of activeReleaseInventory) {
      expect(inventory).not.toContain('@forgeax/app-shell');
      expect(inventory).not.toContain('packages/app-shell');
    }
  });
});
