export type ExtensionFamily = 'agent' | 'engine' | 'editor';

export interface ExtensionManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  displayName: string;
  description?: string;
  family: ExtensionFamily;
  entrypoint: string;
  capabilities?: readonly string[];
  contributions?: readonly string[];
}

export interface ContractIssue {
  code: string;
  path: string;
  hint: string;
}

export class ContractValidationError extends Error {
  readonly issues: readonly ContractIssue[];

  constructor(message: string, issues: readonly ContractIssue[]) {
    super(message);
    this.name = 'ContractValidationError';
    this.issues = issues;
  }
}

const FAMILIES: readonly ExtensionFamily[] = ['agent', 'engine', 'editor'];

export function parseExtensionManifest(input: unknown): ExtensionManifest {
  const value = input as Partial<ExtensionManifest> | null;
  const issues: ContractIssue[] = [];
  if (!value || typeof value !== 'object') {
    throw new ContractValidationError('Extension manifest must be an object', [
      { code: 'manifest.not-object', path: '', hint: 'Provide a JSON object with schemaVersion and entrypoint.' },
    ]);
  }
  for (const field of ['id', 'version', 'displayName', 'entrypoint'] as const) {
    if (typeof value[field] !== 'string' || value[field].trim() === '') {
      issues.push({ code: 'manifest.required', path: field, hint: `Set a non-empty ${field}.` });
    }
  }
  if (value.schemaVersion !== 1) {
    issues.push({ code: 'manifest.schema-version', path: 'schemaVersion', hint: 'Use schemaVersion 1 for this contract.' });
  }
  if (!FAMILIES.includes(value.family as ExtensionFamily)) {
    issues.push({ code: 'manifest.family', path: 'family', hint: 'Choose agent, engine, or editor.' });
  }
  if (issues.length) throw new ContractValidationError('Invalid Extension manifest', issues);
  return value as ExtensionManifest;
}
