import { ContractValidationError, type ContractIssue } from '../extension-manifest';

export type ArtifactSourceKind = 'builtin' | 'user' | 'project' | 'marketplace' | 'private';

export interface SignerPolicy {
  readonly issuer: string;
  readonly subject: string;
  readonly keyId: string;
  readonly required: true;
}

export type ArtifactSource =
  | { readonly kind: 'marketplace'; readonly catalogId: string; readonly releaseTag: string }
  | { readonly kind: Exclude<ArtifactSourceKind, 'marketplace'>; readonly location: string };

export interface ArtifactLock {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly version: string;
  readonly variant: string;
  readonly sha256: `sha256-${string}`;
  readonly manifestDigest: `sha256-${string}`;
  readonly signerPolicy: SignerPolicy;
  readonly source: ArtifactSource;
}

const DIGEST = /^sha256-[0-9a-f]{64}$/;
const ISSUER = /^https:\/\//;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function add(issues: ContractIssue[], code: string, path: string, hint: string) {
  issues.push({ code, path, hint });
}

export function parseArtifactLock(input: unknown): ArtifactLock {
  const value = input as Record<string, unknown> | null;
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) throw new ContractValidationError('Artifact lock must be an object', [{ code: 'artifact.not-object', path: '', hint: 'Provide a JSON artifact lock.' }]);
  if (value.schemaVersion !== 2) add(issues, 'artifact.schema-version', 'schemaVersion', 'Use artifact lock schemaVersion 2.');
  for (const field of ['id', 'version', 'variant'] as const) if (typeof value[field] !== 'string' || value[field].trim() === '') add(issues, 'artifact.required', field, `Set a non-empty ${field}.`);
  for (const field of ['sha256', 'manifestDigest'] as const) if (typeof value[field] !== 'string' || !DIGEST.test(value[field])) add(issues, `artifact.${field}`, field, 'Use a lowercase sha256- digest with 64 hexadecimal characters.');
  if (!isRecord(value.signerPolicy) || value.signerPolicy.required !== true || typeof value.signerPolicy.issuer !== 'string' || !ISSUER.test(value.signerPolicy.issuer) || typeof value.signerPolicy.subject !== 'string' || value.signerPolicy.subject.trim() === '' || typeof value.signerPolicy.keyId !== 'string' || value.signerPolicy.keyId.trim() === '') add(issues, 'artifact.signer', 'signerPolicy', 'Require an HTTPS issuer, non-empty subject/keyId, and a mandatory signature.');
  if (!isRecord(value.source) || typeof value.source.kind !== 'string' || !['builtin', 'user', 'project', 'marketplace', 'private'].includes(value.source.kind)) {
    add(issues, 'artifact.source', 'source', 'Use a locked builtin, user, project, private, or Marketplace source; arbitrary URLs are forbidden.');
  } else if (value.source.kind === 'marketplace') {
    if (typeof value.source.catalogId !== 'string' || typeof value.source.releaseTag !== 'string') add(issues, 'artifact.source', 'source', 'Marketplace sources require catalogId and releaseTag.');
  } else if (typeof value.source.location !== 'string' || value.source.location.trim() === '') {
    add(issues, 'artifact.source', 'source.location', 'Named non-Marketplace sources require an explicit location.');
  }
  if (issues.length) throw new ContractValidationError('Invalid artifact lock', issues);
  return value as unknown as ArtifactLock;
}

export const artifactLockSchema = {
  type: 'object',
  required: ['schemaVersion', 'id', 'version', 'variant', 'sha256', 'manifestDigest', 'signerPolicy', 'source'],
  properties: { schemaVersion: { const: 2 }, sha256: { pattern: '^sha256-[0-9a-f]{64}$' }, manifestDigest: { pattern: '^sha256-[0-9a-f]{64}$' } },
  additionalProperties: false,
} as const;
