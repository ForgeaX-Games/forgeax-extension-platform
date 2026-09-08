import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ContractValidationError,
  parseArtifactLock,
  parseExtensionManifestV2,
  parseProductRuntimeReport,
  parseServiceHealth,
} from '../src/contracts';

const fixturePath = join(import.meta.dir, 'fixtures/v2-schema/baseline.json');
const baseline = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>;
const invalid = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures/v2-schema/invalid.json'), 'utf8')) as Record<string, unknown>;

function expectInvalid(action: () => unknown, code: string) {
  try {
    action();
    throw new Error('expected schema validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ContractValidationError);
    expect((error as ContractValidationError).issues.some((issue) => issue.code === code)).toBe(true);
  }
}

describe('v2 Extension artifact contracts', () => {
  it('accepts the baseline manifest, lock, runtime report, and service health', () => {
    expect(parseExtensionManifestV2(baseline.manifest).schemaVersion).toBe(2);
    expect(parseArtifactLock(baseline.lock).source.kind).toBe('marketplace');
    expect(parseProductRuntimeReport(baseline.report).status).toBe('ready');
    expect(parseServiceHealth(baseline.health).ready).toBe(true);
  });

  it('rejects legacy manifests and unknown v2 categories', () => {
    expect(Object.keys(invalid)).toContain('legacyManifest');
    expectInvalid(() => parseExtensionManifestV2(invalid.incompatibleManifest), 'manifest.category');
    expectInvalid(() => parseExtensionManifestV2(invalid.legacyManifest), 'manifest.schema-version');
  });

  it('rejects malformed digest, signer policy, and arbitrary URL sources', () => {
    expectInvalid(() => parseArtifactLock(invalid.badDigestLock), 'artifact.sha256');
    expectInvalid(() => parseArtifactLock(invalid.badDigestLock), 'artifact.source');
    const lock = { ...(baseline.lock as Record<string, unknown>), sha256: 'sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', manifestDigest: 'sha256-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', signerPolicy: { issuer: 'issuer', subject: 'subject', required: false } };
    expectInvalid(() => parseArtifactLock(lock), 'artifact.signer');
  });

  it('rejects incompatible API protocol and invalid runtime state', () => {
    const manifest = { ...(baseline.manifest as Record<string, unknown>), apiCompatibility: { platform: '>=0.1.0', protocol: '2' } };
    expectInvalid(() => parseExtensionManifestV2(manifest), 'manifest.protocol');
    expectInvalid(() => parseProductRuntimeReport({ version: 1, status: 'ready', diagnostics: [{ kind: 'extension', id: 'forgeax.bad', version: '1.0.0', phase: 'verify', status: 'failed', required: true }] }), 'report.ready');
    expectInvalid(() => parseServiceHealth({ version: 1, serviceId: 'bad', serviceVersion: '1.0.0', status: 'ready', protocol: { min: '2', max: '1' }, ready: true, restartable: false }), 'health.protocol');
  });
});
