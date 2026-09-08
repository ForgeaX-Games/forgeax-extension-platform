#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const lockPath = join(root, 'release', 'registry-lock.json');

if (!existsSync(lockPath)) {
  console.error(JSON.stringify({ code: 'release.registry-evidence-missing', phase: 'registry-verify', component: 'extension-platform', hint: 'Publish from protected main and record the real registry resolution before claiming immutable promotion.', expected: 'release/registry-lock.json with exact package evidence', actual: 'registry lock is absent', retryable: true, recoveryActions: [{ command: 'bun run release:verify', description: 'Re-run after the publish workflow provides version, tarball digest, integrity, and provenance evidence.' }] }, null, 2));
  process.exit(1);
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
  schemaVersion?: number;
  registry?: string;
  packages?: Array<{ name?: string; version?: string; sha256?: string; integrity?: string; resolvedFrom?: string; immutable?: boolean; provenance?: { sourceCommit?: string; repository?: string } }>;
};
const expectedNames = new Set(['@forgeax/extension-platform']);
const errors: string[] = [];
if (lock.schemaVersion !== 1 || lock.registry !== 'https://registry.npmjs.org/') errors.push('registry lock schema or registry is invalid');
if (!Array.isArray(lock.packages) || lock.packages.length !== expectedNames.size) errors.push('registry lock must contain exactly the root Extension Platform package');
for (const entry of lock.packages ?? []) {
  if (!entry.name || !expectedNames.has(entry.name)) errors.push(`unexpected package ${entry.name ?? 'missing'}`);
  if (!entry.version || !/^\d+\.\d+\.\d+$/.test(entry.version)) errors.push(`${entry.name ?? 'package'} version is not exact`);
  if (!entry.sha256 || !/^sha256-[0-9a-f]{64}$/.test(entry.sha256)) errors.push(`${entry.name ?? 'package'} sha256 is missing or malformed`);
  if (!entry.integrity?.startsWith('sha512-')) errors.push(`${entry.name ?? 'package'} registry integrity is missing`);
  if (entry.resolvedFrom !== 'registry' || entry.immutable !== true) errors.push(`${entry.name ?? 'package'} is not immutable registry-resolved evidence`);
  if (!entry.provenance?.sourceCommit || !entry.provenance.repository) errors.push(`${entry.name ?? 'package'} provenance is incomplete`);
}
if (errors.length) {
  console.error(JSON.stringify({ code: 'release.registry-evidence-invalid', phase: 'registry-verify', component: 'extension-platform', hint: 'Use actual registry metadata and tarball bytes; do not fill this lock with placeholders.', expected: 'exact version, sha256, integrity, immutable registry resolution, and provenance for the root package', actual: errors, retryable: false, recoveryActions: [{ command: 'publish-from-protected-main', description: 'Publish the root package and record immutable registry evidence.' }] }, null, 2));
  process.exit(1);
}

for (const entry of lock.packages ?? []) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: string };
  if (manifest.version !== entry.version) errors.push(`${entry.name} lock version does not match its package manifest`);
  try {
    const metadataResponse = await fetch(`${lock.registry}/${encodeURIComponent(entry.name ?? '')}`);
    if (!metadataResponse.ok) {
      errors.push(`${entry.name} registry metadata returned HTTP ${metadataResponse.status}`);
      continue;
    }
    const metadata = await metadataResponse.json() as { versions?: Record<string, { dist?: { tarball?: string; integrity?: string } }> };
    const release = metadata.versions?.[entry.version ?? ''];
    const tarball = release?.dist?.tarball;
    const integrity = release?.dist?.integrity;
    if (!tarball || !integrity) {
      errors.push(`${entry.name} registry metadata lacks tarball or integrity`);
      continue;
    }
    if (integrity !== entry.integrity) errors.push(`${entry.name} registry integrity differs from the lock`);
    const tarballResponse = await fetch(tarball);
    if (!tarballResponse.ok) {
      errors.push(`${entry.name} tarball returned HTTP ${tarballResponse.status}`);
      continue;
    }
    const bytes = new Uint8Array(await tarballResponse.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (entry.sha256 !== `sha256-${digest}`) errors.push(`${entry.name} sha256 differs from the registry tarball bytes`);
  } catch (error) {
    errors.push(`${entry.name} registry query failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (errors.length) {
  console.error(JSON.stringify({ code: 'release.registry-lock-mismatch', phase: 'registry-verify', component: 'extension-platform', hint: 'Regenerate the lock from actual tarball bytes and manifest versions.', actual: errors, retryable: false }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'pass', phase: 'registry-verify', component: 'extension-platform', resolvedFrom: 'registry', immutable: true, packages: lock.packages }, null, 2));
