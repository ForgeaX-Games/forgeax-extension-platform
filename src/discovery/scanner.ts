import { existsSync, renameSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { cwd } from 'node:process';
import {
  parseExtensionManifest,
  type ExtensionManifest,
} from '@forgeax/toolkit/contracts';

export type ExtensionOrigin = 'builtin' | 'user' | 'project' | 'npm';

export interface ScannedManifest {
  origin: ExtensionOrigin;
  originPath: string;
  manifest: ExtensionManifest;
  normalizedManifest: ExtensionManifest;
}

export interface ScanError {
  origin: ExtensionOrigin;
  originPath: string;
  reason: string;
  code: string;
  phase: 'discovery' | 'parse' | 'compatibility';
  component: 'extension-discovery';
  hint: string;
  expected?: string;
  actual?: string;
  retryable: boolean;
  recoveryActions: readonly { command: string; description: string }[];
}

export interface ScanResult {
  found: ScannedManifest[];
  errors: ScanError[];
}

const ORIGINS = ['builtin', 'user', 'project'] as const;

function defaultProjectRoot(): string {
  return resolve(process.env.FORGEAX_PROJECT_ROOT ?? cwd());
}

function assetRoot(): string {
  return resolve(process.env.FORGEAX_ASSET_ROOT ?? cwd());
}

function safeIsDir(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function migrateLegacyExtensionDir(base: string): void {
  const legacy = resolve(base, '.forgeax/plugins');
  const current = resolve(base, '.forgeax/extensions');
  try {
    if (safeIsDir(legacy) && !safeIsDir(current)) renameSync(legacy, current);
  } catch {
    // A read-only home must not make discovery fail before scanning starts.
  }
}

function makeError(
  origin: ExtensionOrigin,
  originPath: string,
  code: string,
  phase: ScanError['phase'],
  reason: string,
  hint: string,
  actual?: string,
): ScanError {
  return {
    origin,
    originPath,
    reason,
    code,
    phase,
    component: 'extension-discovery',
    hint,
    ...(actual ? { actual } : {}),
    retryable: false,
    recoveryActions: [{ command: 'inspect-extension-manifest', description: 'Fix the manifest and run discovery again.' }],
  };
}

function parseManifest(input: unknown): { manifest: ExtensionManifest; normalizedManifest: ExtensionManifest } | ScanError {
  try {
    const manifest = parseExtensionManifest(input);
    return { manifest, normalizedManifest: manifest };
  } catch (error) {
    return makeError(
      'builtin',
      '',
      'discovery.manifest-standard',
      'compatibility',
      error instanceof Error ? error.message : String(error),
      'Validate forgeax-extension.json with @forgeax/toolkit/contracts.',
    );
  }
}

function ingestManifest(origin: ExtensionOrigin, manifestPath: string, raw: string, output: ScanResult): void {
  try {
    const parsed = parseManifest(JSON.parse(raw));
    if ('code' in parsed) {
      output.errors.push({ ...parsed, origin, originPath: manifestPath });
      return;
    }
    output.found.push({ origin, originPath: manifestPath, ...parsed });
  } catch (error) {
    output.errors.push(makeError(origin, manifestPath, 'discovery.invalid-json', 'parse', error instanceof Error ? error.message : String(error), 'Provide valid JSON in forgeax-extension.json.'));
  }
}

async function scanDirectory(origin: ExtensionOrigin, root: string): Promise<ScanResult> {
  const output: ScanResult = { found: [], errors: [] };
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    output.errors.push(makeError(origin, root, 'discovery.readdir', 'discovery', error instanceof Error ? error.message : String(error), 'Check the extension root and permissions.'));
    return output;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const extensionDir = join(root, entry.name);
    if (!entry.isDirectory() && !(entry.isSymbolicLink() && safeIsDir(extensionDir))) continue;
    const manifestPath = join(extensionDir, 'forgeax-extension.json');
    try {
      ingestManifest(origin, manifestPath, await readFile(manifestPath, 'utf8'), output);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        output.errors.push(makeError(origin, manifestPath, 'discovery.read-manifest', 'discovery', error instanceof Error ? error.message : String(error), 'Check the manifest file and permissions.'));
      }
    }
  }
  return output;
}

async function scanNpmDirectory(directory: string): Promise<ScanResult> {
  const output: ScanResult = { found: [], errors: [] };
  const manifestPath = join(directory, 'forgeax-extension.json');
  try {
    ingestManifest('npm', manifestPath, await readFile(manifestPath, 'utf8'), output);
  } catch (error) {
    output.errors.push(makeError('npm', manifestPath, 'discovery.read-manifest', 'discovery', error instanceof Error ? error.message : String(error), 'Check the resolved package directory.'));
  }
  return output;
}

export function defaultExtensionRoots(opts?: { repoRoot?: string; projectRoot?: string }): Record<'builtin' | 'user' | 'project', string | null> {
  const repoRoot = opts?.repoRoot;
  const projectRoot = opts?.projectRoot ?? defaultProjectRoot();
  migrateLegacyExtensionDir(homedir());
  migrateLegacyExtensionDir(projectRoot);
  const firstDirectory = (paths: string[]) => paths.find(safeIsDir) ?? null;
  return {
    builtin: firstDirectory([
      resolve(assetRoot(), 'marketplace/extensions'),
      ...(repoRoot ? [resolve(repoRoot, 'packages/marketplace/extensions'), resolve(repoRoot, 'marketplace/extensions')] : []),
    ]),
    user: firstDirectory([resolve(homedir(), '.forgeax/extensions')]),
    project: firstDirectory([resolve(projectRoot, '.forgeax/extensions')]),
  };
}

export function isSafeBoot(env: NodeJS.ProcessEnv = process.env): boolean {
  return ['1', 'true', 'yes'].includes(env.FORGEAX_SAFE_BOOT ?? '');
}

export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.FORGEAX_NODE_ENV ?? env.NODE_ENV) === 'production';
}

export async function scanAllExtensionOrigins(
  roots?: Partial<Record<'builtin' | 'user' | 'project', string | null>>,
  npmExtensionDirs: readonly string[] = [],
): Promise<ScanResult> {
  const resolved = { ...defaultExtensionRoots(), ...(roots ?? {}) };
  const output: ScanResult = { found: [], errors: [] };
  const safeBoot = isSafeBoot();
  for (const origin of ORIGINS) {
    if (safeBoot && origin !== 'builtin') continue;
    const root = resolved[origin];
    if (!root) continue;
    const result = await scanDirectory(origin, root);
    output.found.push(...result.found);
    output.errors.push(...result.errors);
  }
  for (const directory of npmExtensionDirs) {
    const result = await scanNpmDirectory(directory);
    output.found.push(...result.found);
    output.errors.push(...result.errors);
  }
  return output;
}
