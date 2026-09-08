import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const packageJsonPath = resolve(root, 'package.json');
const sourceRoot = resolve(root, 'src/discovery');

describe('extension discovery subpath contract', () => {
  it('is exported by the public root package', () => {
    expect(existsSync(packageJsonPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      name?: string;
      private?: boolean;
      dependencies?: Record<string, string>;
      exports?: Record<string, unknown>;
    };
    expect(manifest.name).toBe('@forgeax/extension-platform');
    expect(manifest.private).toBe(false);
    expect(manifest.dependencies?.['@forgeax/platform-io']).toBeUndefined();
    expect(manifest.dependencies?.['@forgeax/types']).toBe('^0.3.0');
    expect(manifest.dependencies?.['@forgeax/toolkit']).toBe('0.1.2');
    expect(manifest.exports?.['./discovery']).toBeDefined();
  });

  it('exposes the three discovery origins and structured scan results', () => {
    const source = readFileSync(resolve(sourceRoot, 'index.ts'), 'utf8');
    const scanner = readFileSync(resolve(sourceRoot, 'scanner.ts'), 'utf8');
    for (const symbol of ['ExtensionOrigin', 'ScannedManifest', 'ScanError', 'ScanResult', 'scanAllExtensionOrigins']) {
      expect(source).toContain(symbol);
    }
    for (const origin of ['builtin', 'user', 'project', 'npm']) {
      expect(scanner).toContain(`'${origin}'`);
    }
    for (const field of ['origin', 'originPath', 'reason', 'found', 'errors']) {
      expect(scanner).toContain(`${field}:`);
    }
    expect(scanner).toContain("from '@forgeax/toolkit/contracts'");
    expect(scanner).not.toContain('@forgeax/types');
    expect(scanner).not.toContain('packages/extension-discovery');
  });

  it('does not retain retired package ownership boundaries', () => {
    const source = readFileSync(resolve(sourceRoot, 'scanner.ts'), 'utf8');
    expect(source).not.toMatch(/@forgeax\/host-sdk|@forgeax\/extension-discovery/);
  });
});
