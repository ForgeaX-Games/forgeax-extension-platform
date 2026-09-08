import { ContractValidationError, type ContractIssue } from '../extension-manifest';

export type ExtensionCategory = 'agent' | 'engine' | 'editor' | 'other';
export type ExtensionEntrypointKind = 'runtime' | 'browser' | 'server';

export interface ExtensionEntrypoints {
  readonly runtime?: string;
  readonly browser?: string;
  readonly server?: string;
}

export interface ApiCompatibility {
  readonly platform: string;
  readonly protocol: '1';
}

export interface ExtensionManifestV2 {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly description?: string;
  readonly categories: readonly ExtensionCategory[];
  readonly entrypoints: ExtensionEntrypoints;
  readonly contributes?: readonly Record<string, unknown>[];
  readonly permissions?: readonly string[];
  readonly apiCompatibility: ApiCompatibility;
}

const CATEGORIES: readonly ExtensionCategory[] = ['agent', 'engine', 'editor', 'other'];
const ENTRYPOINTS: readonly ExtensionEntrypointKind[] = ['runtime', 'browser', 'server'];
const PROTOCOL = '1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function issue(code: string, path: string, hint: string): ContractIssue {
  return { code, path, hint };
}

function pathIsSafe(path: string): boolean {
  return path.startsWith('dist/') && !path.includes('..') && !path.includes('node_modules/');
}

export function parseExtensionManifestV2(input: unknown): ExtensionManifestV2 {
  const value = input as Record<string, unknown> | null;
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) {
    throw new ContractValidationError('Extension v2 manifest must be an object', [issue('manifest.not-object', '', 'Provide a JSON object with schemaVersion 2.')]);
  }
  if (value.schemaVersion !== 2) issues.push(issue('manifest.schema-version', 'schemaVersion', 'Use schemaVersion 2; legacy manifest compatibility is not part of the v2 Runtime.'));
  for (const field of ['id', 'version', 'displayName'] as const) {
    if (typeof value[field] !== 'string' || value[field].trim() === '') issues.push(issue('manifest.required', field, `Set a non-empty ${field}.`));
  }
  if (!Array.isArray(value.categories) || value.categories.length === 0) {
    issues.push(issue('manifest.categories', 'categories', 'Choose at least one category: agent, engine, editor, or other.'));
  } else {
    for (const [index, category] of value.categories.entries()) {
      if (!CATEGORIES.includes(category as ExtensionCategory)) issues.push(issue('manifest.category', `categories[${index}]`, 'Use agent, engine, editor, or other.'));
    }
  }
  if (!isRecord(value.entrypoints) || !Object.entries(value.entrypoints).some(([kind, path]) => ENTRYPOINTS.includes(kind as ExtensionEntrypointKind) && typeof path === 'string' && pathIsSafe(path))) {
    issues.push(issue('manifest.entrypoints', 'entrypoints', 'Provide at least one dist-relative runtime, browser, or server entrypoint.'));
  } else {
    for (const [kind, path] of Object.entries(value.entrypoints)) {
      if (!ENTRYPOINTS.includes(kind as ExtensionEntrypointKind) || typeof path !== 'string' || !pathIsSafe(path)) issues.push(issue('manifest.entrypoint', `entrypoints.${kind}`, 'Entrypoints must be known dist-relative paths without traversal or node_modules.'));
    }
  }
  if (value.permissions !== undefined && (!Array.isArray(value.permissions) || value.permissions.some((permission) => typeof permission !== 'string' || permission.trim() === ''))) {
    issues.push(issue('manifest.permissions', 'permissions', 'Permissions must be a list of non-empty capability identifiers.'));
  }
  if (!isRecord(value.apiCompatibility)) {
    issues.push(issue('manifest.compatibility', 'apiCompatibility', 'Declare platform and protocol compatibility.'));
  } else {
    if (typeof value.apiCompatibility.platform !== 'string' || value.apiCompatibility.platform.trim() === '') issues.push(issue('manifest.platform', 'apiCompatibility.platform', 'Declare the supported Extension Platform range.'));
    if (value.apiCompatibility.protocol !== PROTOCOL) issues.push(issue('manifest.protocol', 'apiCompatibility.protocol', 'Use Runtime protocol 1 for this v2 contract.'));
  }
  if (issues.length) throw new ContractValidationError('Invalid Extension v2 manifest', issues);
  return value as unknown as ExtensionManifestV2;
}

export const extensionManifestV2Schema = {
  type: 'object',
  required: ['schemaVersion', 'id', 'version', 'displayName', 'categories', 'entrypoints', 'apiCompatibility'],
  properties: { schemaVersion: { const: 2 }, categories: { items: { enum: CATEGORIES } }, apiCompatibility: { properties: { protocol: { const: PROTOCOL } } } },
  additionalProperties: false,
} as const;
