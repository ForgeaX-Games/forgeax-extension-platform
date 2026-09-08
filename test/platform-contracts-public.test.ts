import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseExtensionManifestV2 } from '../src/contracts';

const packageManifest = JSON.parse(
  readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'),
) as {
  exports: Record<string, unknown>;
  dependencies?: Record<string, string>;
};

const privatePackagePaths = ['artifacts', 'sdk'];

describe('public Extension Platform contracts', () => {
  it('exports contracts from the root package and contracts subpath', () => {
    expect(packageManifest.exports['.']).toBeDefined();
    expect(packageManifest.exports['./contracts']).toEqual({
      types: './dist/contracts/index.d.ts',
      import: './dist/contracts/index.js',
    });
    expect(Object.keys(packageManifest.dependencies ?? {}).some((name) => name.includes('contracts'))).toBe(false);
    expect(parseExtensionManifestV2({
      schemaVersion: 2,
      id: 'forgeax.editor.baseline',
      version: '1.0.0',
      displayName: 'Editor baseline',
      categories: ['editor'],
      entrypoints: { browser: 'dist/index.js' },
      apiCompatibility: { platform: '>=0.1.0', protocol: '1' },
    }).id).toBe('forgeax.editor.baseline');
  });

  it('publishes discovery and transport from the root package only', () => {
    expect(packageManifest.exports['./discovery']).toEqual({
      types: './dist/discovery/index.d.ts',
      import: './dist/discovery/index.js',
    });
    expect(packageManifest.exports['./transport']).toEqual({
      types: './dist/transport/index.d.ts',
      import: './dist/transport/index.js',
    });

    for (const packageName of ['discovery', 'transport']) {
      expect(() => readFileSync(join(import.meta.dir, '..', 'packages', packageName, 'package.json'), 'utf8')).toThrow();
    }
  });

  it('keeps private build satellites free of root self-dependencies', () => {
    for (const packageName of privatePackagePaths) {
      const manifest = JSON.parse(
        readFileSync(join(import.meta.dir, '..', 'packages', packageName, 'package.json'), 'utf8'),
      ) as {
        private?: boolean;
        dependencies?: Record<string, string>;
      };
      expect(manifest.private, packageName).toBe(true);
      expect(manifest.dependencies?.['@forgeax/extension-platform'], packageName).toBeUndefined();
    }

    const sdkManifest = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'packages', 'sdk', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    expect(sdkManifest.dependencies?.['@forgeax/extension-artifacts']).toBe('workspace:*');

  });
});
