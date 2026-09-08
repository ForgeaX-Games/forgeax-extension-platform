import type { ArtifactLock } from '../../../src/contracts';
import { ArtifactError } from './archive/error';
import { verifyExtensionArtifact } from './pack';
import { ContentAddressedStore } from './store/content-addressed';

export interface ArtifactInstallResult {
  readonly status: 'installed' | 'failed';
  readonly digest?: string;
  readonly error?: ArtifactError;
}

export class ArtifactManager {
  constructor(readonly store: ContentAddressedStore) {}

  async installVerified(bytes: Uint8Array, lock: ArtifactLock): Promise<ArtifactInstallResult> {
    try {
      const verified = verifyExtensionArtifact(bytes, { expectedSha256: lock.sha256, signer: { ...lock.signerPolicy, signature: 'lock-policy' } });
      if (verified.manifestDigest !== lock.manifestDigest || verified.manifest.id !== lock.id || verified.manifest.version !== lock.version) throw new ArtifactError({ code: 'FXE_LOCK_METADATA_MISMATCH', phase: 'install', message: 'Verified manifest does not match the artifact lock', hint: 'Restore the exact lock-compatible artifact before activation.' });
      await this.store.install(bytes, lock.sha256); await this.store.markLastKnownGood(lock.sha256);
      return { status: 'installed', digest: lock.sha256 };
    } catch (error) {
      const artifactError = error instanceof ArtifactError ? error : new ArtifactError({ code: 'FXE_INSTALL_FAILED', phase: 'install', message: 'Artifact installation failed', hint: 'Inspect the structured diagnostic and retry after recovery.' });
      return { status: 'failed', error: artifactError };
    }
  }
}
