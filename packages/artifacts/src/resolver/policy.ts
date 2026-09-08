import type { ArtifactLock } from '../../../../src/contracts';
import { ArtifactError } from '../archive/error';
import { assertTrustedArtifact, validateLockTrust } from '../trust/policy';

export type ResolutionMode = 'production' | 'development';

export interface ArtifactCandidate {
  readonly kind: 'builtin' | 'user' | 'project' | 'marketplace' | 'private' | 'development';
  readonly location: string;
  readonly digest: string;
  readonly variant: string;
  readonly available: boolean;
  readonly signed: boolean;
  readonly issuer?: string;
  readonly subject?: string;
  readonly keyId?: string;
  readonly revoked?: boolean;
  readonly expiresAt?: string;
}

export interface ResolveOptions {
  readonly mode: ResolutionMode;
  readonly now?: Date;
}

function failure(code: string, message: string, hint: string, retryable = false): never {
  throw new ArtifactError({ code, phase: 'resolve', message, hint, retryable, recoveryActions: [{ command: 'bun run diagnostics:restore', description: 'Restore the last-known-good locked artifact.' }] });
}

export function resolveArtifactSource(lock: ArtifactLock, candidates: readonly ArtifactCandidate[], options: ResolveOptions): ArtifactCandidate {
  validateLockTrust(lock);
  const development = candidates.find((candidate) => candidate.kind === 'development');
  if (options.mode === 'production' && development) failure('FXE_SOURCE_FORBIDDEN', 'A development source adapter was found in production resolution', 'Remove the source adapter and rebuild from published artifacts.');
  const expectedKind = lock.source.kind;
  const candidate = candidates.find((entry) => entry.kind === expectedKind);
  if (!candidate) failure('FXE_LOCK_SOURCE_MISMATCH', `No candidate matches locked source kind ${expectedKind}`, 'Acquire the exact locked source or update the lock through a release promotion.');
  if (!candidate.available) failure('FXE_SOURCE_UNAVAILABLE', `Locked source is unavailable: ${candidate.location}`, 'Retry the source acquisition or use an embedded last-known-good artifact.', true);
  if (candidate.variant !== lock.variant) failure('FXE_VARIANT_MISMATCH', `Artifact variant ${candidate.variant} does not match ${lock.variant}`, 'Select the platform variant recorded in the lock.');
  if (candidate.digest !== lock.sha256) failure('FXE_DIGEST_MISMATCH', 'Candidate digest does not match the artifact lock', 'Restore the exact immutable Release asset recorded in the lock.');
  assertTrustedArtifact({
    signed: candidate.signed,
    issuer: candidate.issuer,
    subject: candidate.subject,
    keyId: candidate.keyId,
    revoked: candidate.revoked,
    expiresAt: candidate.expiresAt,
  }, lock.signerPolicy, options.now);
  return candidate;
}
