import { parseExtensionManifestV2, type ExtensionManifestV2 } from '../../../src/contracts';
import { ArtifactError } from './archive/error';
import { createDeterministicZip, readDeterministicZip, type ArchiveEntry } from './archive/zip';
import { canonicalJson, digestJson, sha256 } from './integrity/digest';
import { verifySignature, type SignatureBundle } from './integrity/signature';

export interface ExtensionArtifactInput {
  readonly manifest: ExtensionManifestV2;
  readonly files: readonly { readonly path: string; readonly data: Uint8Array | string }[];
  readonly signer: SignatureBundle;
}

export interface PackedExtensionArtifact {
  readonly bytes: Uint8Array;
  readonly sha256: `sha256-${string}`;
  readonly manifestDigest: `sha256-${string}`;
  readonly signer: SignatureBundle;
}

export interface VerifyArtifactOptions {
  readonly expectedSha256?: string;
  readonly signer: SignatureBundle;
}

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

export function packExtension(input: ExtensionArtifactInput): PackedExtensionArtifact {
  const manifest = parseExtensionManifestV2(input.manifest);
  if (!input.signer.issuer.startsWith('https://') || !input.signer.subject || !input.signer.keyId || !input.signer.signature) throw new ArtifactError({ code: 'FXE_SIGNER_INVALID', phase: 'pack', message: 'A complete signature bundle is required', hint: 'Provide issuer, subject, keyId, and signature from the release signer.' });
  const entries: ArchiveEntry[] = [{ path: 'forgeax-extension.json', data: canonicalJson(manifest) }, { path: 'META-INF/forgeax-signature.json', data: canonicalJson(input.signer) }, ...input.files.map((file) => ({ path: file.path, data: toBytes(file.data) }))];
  const bytes = createDeterministicZip(entries);
  return { bytes, sha256: sha256(bytes), manifestDigest: digestJson(manifest), signer: input.signer };
}

export function verifyExtensionArtifact(bytes: Uint8Array, options: VerifyArtifactOptions): { manifest: ExtensionManifestV2; manifestDigest: `sha256-${string}`; sha256: `sha256-${string}` } {
  const actualSha = sha256(bytes);
  if (options.expectedSha256 && options.expectedSha256 !== actualSha) throw new ArtifactError({ code: 'FXE_DIGEST_MISMATCH', phase: 'verify', message: 'FXE bytes do not match the locked sha256 digest', hint: 'Restore the locked artifact and retry verification.', expected: options.expectedSha256, actual: actualSha });
  const entries = readDeterministicZip(bytes);
  const manifestEntry = entries.find((entry) => entry.path === 'forgeax-extension.json'); const signatureEntry = entries.find((entry) => entry.path === 'META-INF/forgeax-signature.json');
  if (!manifestEntry || !signatureEntry) throw new ArtifactError({ code: 'FXE_METADATA_MISSING', phase: 'verify', message: 'FXE metadata is incomplete', hint: 'Rebuild the artifact with forgeax-extension.json and its signature bundle.' });
  let manifest: ExtensionManifestV2; let signer: SignatureBundle;
  try { manifest = parseExtensionManifestV2(JSON.parse(new TextDecoder().decode(manifestEntry.data))); signer = JSON.parse(new TextDecoder().decode(signatureEntry.data)) as SignatureBundle; } catch (error) { if (error instanceof ArtifactError) throw error; throw new ArtifactError({ code: 'FXE_METADATA_INVALID', phase: 'verify', message: 'FXE metadata could not be decoded', hint: 'Rebuild the artifact with the Extension SDK.' }); }
  verifySignature(signer, { issuer: options.signer.issuer, subject: options.signer.subject, keyId: options.signer.keyId, required: true });
  return { manifest, manifestDigest: digestJson(manifest), sha256: actualSha };
}
