import { describe, expect, it } from 'bun:test';
import { resolveArtifactSource, type ArtifactCandidate } from '../src/resolver/policy';
import type { ArtifactLock } from '../../../src/contracts';

const digest = 'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const lock: ArtifactLock = {
  schemaVersion: 2,
  id: 'forgeax.editor.fixture',
  version: '1.0.0',
  variant: 'universal',
  sha256: digest,
  manifestDigest: 'sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  signerPolicy: { issuer: 'https://token.actions.githubusercontent.com', subject: 'repo:ForgeaX-Games/forgeax-marketplace:ref:refs/heads/main', keyId: 'sigstore', required: true },
  source: { kind: 'marketplace', catalogId: 'forgeax.editor.fixture', releaseTag: 'forgeax.editor.fixture@1.0.0' },
};

const candidate = (overrides: Partial<ArtifactCandidate> = {}): ArtifactCandidate => ({
  kind: 'marketplace', location: 'release://forgeax.editor.fixture@1.0.0', digest, variant: 'universal', available: true, signed: true, issuer: lock.signerPolicy.issuer, subject: lock.signerPolicy.subject, keyId: lock.signerPolicy.keyId, ...overrides,
});

function expectCode(action: () => unknown, code: string) {
  try { action(); throw new Error(`expected ${code}`); } catch (error) { expect(error).toMatchObject({ code }); }
}

describe('artifact source precedence and trust policy', () => {
  it('selects the locked source kind regardless of candidate directory order', () => {
    const result = resolveArtifactSource(lock, [candidate({ kind: 'user', location: 'user-cache' }), candidate({ kind: 'marketplace' })], { mode: 'production' });
    expect(result.kind).toBe('marketplace');
    expect(result.location).toContain('release://');
  });

  it('requires explicit development mode for source adapters', () => {
    const development = candidate({ kind: 'development', location: '/workspace/extension', signed: false });
    expectCode(() => resolveArtifactSource(lock, [development], { mode: 'production' }), 'FXE_SOURCE_FORBIDDEN');
    expectCode(() => resolveArtifactSource(lock, [development], { mode: 'development' }), 'FXE_LOCK_SOURCE_MISMATCH');
  });

  it('returns recovery-bearing failures for unavailable Marketplace, variant, revoke, and expiry', () => {
    expectCode(() => resolveArtifactSource(lock, [candidate({ available: false })], { mode: 'production' }), 'FXE_SOURCE_UNAVAILABLE');
    expectCode(() => resolveArtifactSource(lock, [candidate({ variant: 'darwin-arm64' })], { mode: 'production' }), 'FXE_VARIANT_MISMATCH');
    expectCode(() => resolveArtifactSource(lock, [candidate({ revoked: true })], { mode: 'production' }), 'FXE_ARTIFACT_REVOKED');
    expectCode(() => resolveArtifactSource(lock, [candidate({ expiresAt: '2020-01-01T00:00:00Z' })], { mode: 'production', now: new Date('2026-01-01T00:00:00Z') }), 'FXE_POLICY_EXPIRED');
  });

  it('rejects unsigned candidates and digest disagreement', () => {
    expectCode(() => resolveArtifactSource(lock, [candidate({ signed: false })], { mode: 'production' }), 'FXE_SIGNER_INVALID');
    expectCode(() => resolveArtifactSource(lock, [candidate({ digest: 'sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' })], { mode: 'production' }), 'FXE_DIGEST_MISMATCH');
  });
});
