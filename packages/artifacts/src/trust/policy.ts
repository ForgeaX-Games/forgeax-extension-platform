import type { ArtifactLock, SignerPolicy } from '../../../../src/contracts';
import { ArtifactError } from '../archive/error';

export interface TrustEvidence {
  readonly signed: boolean;
  readonly issuer?: string;
  readonly subject?: string;
  readonly keyId?: string;
  readonly revoked?: boolean;
  readonly expiresAt?: string;
}

export function assertTrustedArtifact(evidence: TrustEvidence, policy: SignerPolicy, now = new Date()): void {
  if (!evidence.signed || evidence.issuer !== policy.issuer || evidence.subject !== policy.subject || evidence.keyId !== policy.keyId) throw new ArtifactError({ code: 'FXE_SIGNER_INVALID', phase: 'resolve', message: 'Artifact signature does not satisfy the locked signer policy', hint: 'Use a signed artifact from the trusted Marketplace release or configured private source.' });
  if (evidence.revoked === true) throw new ArtifactError({ code: 'FXE_ARTIFACT_REVOKED', phase: 'resolve', message: 'Artifact has been revoked by its trust policy', hint: 'Restore the last-known-good artifact or update the product lock.' });
  if (evidence.expiresAt && new Date(evidence.expiresAt).getTime() <= now.getTime()) throw new ArtifactError({ code: 'FXE_POLICY_EXPIRED', phase: 'resolve', message: 'Artifact trust evidence has expired', hint: 'Refresh the signed release metadata and lock.' });
}

export function validateLockTrust(lock: ArtifactLock): void {
  if (lock.signerPolicy.required !== true) throw new ArtifactError({ code: 'FXE_SIGNER_INVALID', phase: 'resolve', message: 'Production artifact locks must require a signer', hint: 'Regenerate the lock with a required signer policy.' });
}
