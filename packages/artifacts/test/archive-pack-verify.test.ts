import { describe, expect, it } from 'bun:test';
import { packExtension, verifyExtensionArtifact, type ExtensionArtifactInput } from '../src/pack';

const manifest = {
  schemaVersion: 2 as const,
  id: 'forgeax.editor.fixture',
  version: '1.0.0',
  displayName: 'Fixture editor',
  categories: ['editor' as const],
  entrypoints: { runtime: 'dist/runtime.js' },
  permissions: ['project.read'],
  apiCompatibility: { platform: '>=0.1.0 <1.0.0', protocol: '1' as const },
};

const signer = { issuer: 'https://token.actions.githubusercontent.com', subject: 'repo:ForgeaX-Games/forgeax-marketplace:ref:refs/heads/main', keyId: 'sigstore', signature: 'fixture-signature' };
const input: ExtensionArtifactInput = {
  manifest,
  files: [{ path: 'dist/runtime.js', data: new TextEncoder().encode('export const extensionRuntime = "fixture";') }],
  signer,
};

function expectCode(action: () => unknown, code: string) {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('deterministic FXE pack and verify', () => {
  it('packs the same input to the same sha256 and verifies its manifest', () => {
    const first = packExtension(input);
    const second = packExtension(input);
    expect(first.sha256).toBe(second.sha256);
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
    const verified = verifyExtensionArtifact(first.bytes, { expectedSha256: first.sha256, signer });
    expect(verified.manifest.id).toBe(manifest.id);
    expect(verified.manifestDigest).toBe(first.manifestDigest);
  });

  it('rejects duplicate, traversal, node_modules, and install-script entries', () => {
    for (const files of [
      [{ path: 'dist/a.js', data: 'a' }, { path: 'dist/a.js', data: 'b' }],
      [{ path: '../secret', data: 'x' }],
      [{ path: 'node_modules/x.js', data: 'x' }],
      [{ path: 'install.js', data: 'x' }],
    ]) {
      expectCode(() => packExtension({ ...input, files }), 'FXE_ARCHIVE_ENTRY_INVALID');
    }
  });

  it('returns structured errors for digest mismatch and wrong signer', () => {
    const packed = packExtension(input);
    const damaged = new Uint8Array(packed.bytes);
    damaged[damaged.length - 1] ^= 1;
    expectCode(() => verifyExtensionArtifact(damaged, { expectedSha256: packed.sha256, signer }), 'FXE_DIGEST_MISMATCH');
    expectCode(() => verifyExtensionArtifact(packed.bytes, { expectedSha256: packed.sha256, signer: { ...signer, subject: 'repo:untrusted/project' } }), 'FXE_SIGNER_INVALID');
  });
});
