#!/usr/bin/env bun

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const packageDir = join(root, 'packages');
const packageEntries = existsSync(packageDir) ? readdirSync(packageDir, { withFileTypes: true }) : [];
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  workspaces?: string[];
};
const errors: string[] = [];

if (!rootPackage.workspaces?.includes('packages/*')) {
  errors.push('root package.json must declare the packages/* workspace');
}
if (!existsSync(join(root, 'bun.lock'))) errors.push('bun.lock is required at the workspace root');

for (const name of packageEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
  const packageJsonPath = join(packageDir, name, 'package.json');
  if (!existsSync(packageJsonPath)) {
    errors.push(`workspace directory ${name} has no package.json`);
    continue;
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    name?: string;
    private?: boolean;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  if (!packageJson.name) errors.push(`${packageJsonPath} has no package name`);
  for (const [section, dependencies] of Object.entries({
    dependencies: packageJson.dependencies,
    devDependencies: packageJson.devDependencies,
    peerDependencies: packageJson.peerDependencies,
  })) {
    for (const [dependency, version] of Object.entries(dependencies ?? {})) {
      if (packageJson.private !== true && /^(workspace:|link:|file:)/.test(version)) {
        errors.push(`${name} ${section}.${dependency} uses a local source: ${version}`);
      }
    }
  }
}

for (const retired of ['discovery', 'transport']) {
  if (existsSync(join(packageDir, retired, 'package.json'))) errors.push(`${retired} must be a root package subpath, not an independent workspace package`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`workspace is registry-ready (${packageEntries.length} package directories)`);
