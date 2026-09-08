#!/usr/bin/env bun

import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const errors: string[] = [];
const reports: Array<Record<string, unknown>> = [];

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function checkVersion(value: unknown, label: string): value is string {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) {
    errors.push(`${label} must use an exact semantic version`);
    return false;
  }
  return true;
}

function checkSource(): void {
  const pending = [join(root, 'src')];
  const forbidden = /@forgeax\/host-sdk|workspace:|file:|link:/;
  while (pending.length > 0) {
    const path = pending.pop()!;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) pending.push(join(path, entry));
      continue;
    }
    if (forbidden.test(readFileSync(path, 'utf8'))) {
      errors.push('root source contains a retired package or local source reference');
      return;
    }
  }
}

{
  const packageRoot = root;
  const packagePath = join(root, 'package.json');
  const manifest = readJson(packagePath);
  const name = String(manifest.name ?? '@forgeax/extension-platform');
  const version = manifest.version;
  checkVersion(version, `${name}.version`);
  if (manifest.private !== false) errors.push(`${name} must be publishable`);
  if (!Array.isArray(manifest.files) || !manifest.files.includes('dist')) errors.push(`${name} files must include only the built dist contract`);
  if (typeof manifest.main !== 'string' || !manifest.main.startsWith('./dist/')) errors.push(`${name}.main must resolve inside dist`);
  if (typeof manifest.types !== 'string' || !manifest.types.startsWith('./dist/')) errors.push(`${name}.types must resolve inside dist`);
  const exports = manifest.exports as Record<string, Record<string, string>> | undefined;
  for (const subpath of ['.', './discovery', './transport']) {
    if (!exports?.[subpath] || Object.values(exports[subpath]).some((path) => !path.startsWith('./dist/'))) errors.push(`${name}.exports[${subpath}] must resolve only inside dist`);
  }
  const sections = [manifest.dependencies, manifest.optionalDependencies, manifest.peerDependencies] as Array<Record<string, string> | undefined>;
  for (const section of sections) {
    for (const [dependency, range] of Object.entries(section ?? {})) {
      if (/^(workspace:|file:|link:)/.test(range) || range.startsWith('/') || range.includes('node_modules/')) errors.push(`${name} dependency ${dependency} leaks a local source: ${range}`);
    }
  }
  for (const retired of ['packages/discovery/package.json', 'packages/transport/package.json']) {
    if (existsSync(join(root, retired))) errors.push(`${retired} must not exist as an independent publish unit`);
  }
  checkSource();
  const packed = Bun.spawnSync(['bun', 'pm', 'pack', '--dry-run'], { cwd: packageRoot });
  const output = new TextDecoder().decode(packed.stdout);
  if (packed.exitCode !== 0 || /workspace:|file:|link:|node_modules\//.test(output)) errors.push(`${name} dry-run pack is not registry-safe`);
  reports.push({ name, version, packed: packed.exitCode === 0, resolvedFrom: 'registry' });
}

if (errors.length) {
  console.error(JSON.stringify({ code: 'release.preflight-failed', phase: 'preflight', component: 'extension-platform', hint: 'Fix package metadata or source origins before publishing.', expected: 'registry-only package metadata', actual: errors, retryable: false, recoveryActions: [{ command: 'bun run release:preflight', description: 'Re-run after fixing the reported package contract.' }] }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'pass', phase: 'preflight', packages: reports }, null, 2));
