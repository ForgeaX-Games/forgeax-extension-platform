import { ArtifactError } from '../archive/error';

export interface MarketplaceReleaseMetadata {
  readonly catalogId: string;
  readonly releaseTag: string;
  readonly id: string;
  readonly version: string;
  readonly digest: `sha256-${string}`;
  readonly immutable: true;
  readonly assetName: string;
}

const DIGEST = /^sha256-[0-9a-f]{64}$/;

export function parseMarketplaceRelease(input: unknown): MarketplaceReleaseMetadata {
  const value = input as Partial<MarketplaceReleaseMetadata> | null;
  if (!value || typeof value !== 'object' || typeof value.catalogId !== 'string' || typeof value.releaseTag !== 'string' || typeof value.id !== 'string' || typeof value.version !== 'string' || typeof value.assetName !== 'string' || value.immutable !== true || typeof value.digest !== 'string' || !DIGEST.test(value.digest)) throw new ArtifactError({ code: 'FXE_RELEASE_METADATA_INVALID', phase: 'resolve', message: 'Marketplace release metadata is incomplete or mutable', hint: 'Publish one immutable Release asset with a sha256 digest and matching catalog identity.' });
  return value as MarketplaceReleaseMetadata;
}
