import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { packExtension, type PackedExtensionArtifact, type SignatureBundle } from '@forgeax/extension-artifacts';
import { parseExtensionManifestV2, type ExtensionManifestV2 } from '../../../src/contracts';

export function packExtensionDirectory(directory: string, signer: SignatureBundle): PackedExtensionArtifact {
  const manifest = parseExtensionManifestV2(JSON.parse(readFileSync(join(directory, 'forgeax-extension.json'), 'utf8')) as ExtensionManifestV2);
  const files: { path: string; data: Uint8Array }[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry); const rel = relative(directory, path).split('\\').join('/');
      if (entry === 'node_modules' || entry === '.git' || rel === 'forgeax-extension.json') continue;
      if (statSync(path).isDirectory()) visit(path); else files.push({ path: rel, data: readFileSync(path) });
    }
  };
  visit(directory);
  return packExtension({ manifest, files, signer });
}
