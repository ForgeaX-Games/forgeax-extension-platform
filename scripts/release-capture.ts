#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const registry = 'https://registry.npmjs.org/';
const outputPath = process.env.RELEASE_REGISTRY_LOCK ?? join(root, 'release', 'registry-lock.json');
const sourceCommit = process.env.GITHUB_SHA;
const repository = process.env.GITHUB_REPOSITORY;
const packageNames = [['@forgeax/extension-platform', '.']] as const;

function fail(code: string, hint: string, actual: unknown): never {
  console.error(JSON.stringify({
    code,
    phase: 'registry-capture',
    component: 'extension-platform',
    hint,
    expected: 'real npm metadata and tarball bytes with workflow provenance',
    actual,
    retryable: true,
    recoveryActions: [{ command: 'bun run release:capture', description: 'Re-run after the immutable root package is published.' }],
  }, null, 2));
  process.exit(1);
}

if (!sourceCommit || !repository) {
  fail('release.capture-context-missing', 'Capture must run in the publish workflow with GitHub provenance context.', {
    sourceCommit: sourceCommit ?? null,
    repository: repository ?? null,
  });
}

const packages: Array<Record<string, unknown>> = [];
for (const [name, directory] of packageNames) {
  const packagePath = join(root, directory, 'package.json');
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: string };
  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    fail('release.capture-manifest-invalid', 'Capture requires an exact package version.', { name, version: manifest.version ?? null });
  }
  try {
    const metadataResponse = await fetch(`${registry}${encodeURIComponent(name)}`);
    if (!metadataResponse.ok) fail('release.registry-capture-failed', 'Registry metadata must be reachable after publish.', { name, status: metadataResponse.status });
    const metadata = await metadataResponse.json() as { versions?: Record<string, { dist?: { tarball?: string; integrity?: string } }> };
    const release = metadata.versions?.[manifest.version];
    const tarball = release?.dist?.tarball;
    const integrity = release?.dist?.integrity;
    if (!tarball || !integrity) fail('release.registry-capture-failed', 'Published metadata must contain tarball and integrity.', { name, version: manifest.version });
    const tarballResponse = await fetch(tarball);
    if (!tarballResponse.ok) fail('release.registry-capture-failed', 'Published tarball must be reachable.', { name, status: tarballResponse.status });
    const bytes = new Uint8Array(await tarballResponse.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    packages.push({
      name,
      version: manifest.version,
      sha256: `sha256-${sha256}`,
      integrity,
      resolvedFrom: 'registry',
      immutable: true,
      provenance: { sourceCommit, repository },
    });
  } catch (error) {
    fail('release.registry-capture-failed', 'Registry metadata and tarball capture failed.', { name, error: error instanceof Error ? error.message : String(error) });
  }
}

mkdirSync(join(root, 'release'), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, registry, packages }, null, 2)}\n`);
console.log(JSON.stringify({ status: 'pass', phase: 'registry-capture', component: 'extension-platform', output: outputPath, resolvedFrom: 'registry', immutable: true, packages }, null, 2));
