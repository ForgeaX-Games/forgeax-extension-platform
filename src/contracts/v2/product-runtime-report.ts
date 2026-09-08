import { ContractValidationError, type ContractIssue } from '../extension-manifest';

export type RuntimePhase = 'discovery' | 'acquire' | 'verify' | 'install' | 'permission' | 'activate' | 'service-ready' | 'product-ready' | 'cleanup';
export type RuntimeStatus = 'pending' | 'running' | 'ready' | 'degraded' | 'failed' | 'skipped';

export interface RuntimeComponentReport {
  readonly kind: 'extension' | 'service' | 'product';
  readonly id: string;
  readonly version: string;
  readonly phase: RuntimePhase;
  readonly status: RuntimeStatus;
  readonly required: boolean;
  readonly error?: RuntimeDiagnostic;
}

export interface RuntimeDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly hint: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly retryable: boolean;
  readonly recoveryActions: readonly { readonly command: string; readonly description?: string }[];
}

export interface ProductRuntimeReportV1 {
  readonly version: 1;
  readonly status: 'starting' | 'ready' | 'degraded' | 'failed';
  readonly diagnostics: readonly RuntimeComponentReport[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseProductRuntimeReport(input: unknown): ProductRuntimeReportV1 {
  const value = input as Record<string, unknown> | null;
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) throw new ContractValidationError('Runtime report must be an object', [{ code: 'report.not-object', path: '', hint: 'Provide a ProductRuntimeReportV1 object.' }]);
  if (value.version !== 1) issues.push({ code: 'report.version', path: 'version', hint: 'Use ProductRuntimeReportV1.' });
  if (!['starting', 'ready', 'degraded', 'failed'].includes(value.status as string)) issues.push({ code: 'report.status', path: 'status', hint: 'Use starting, ready, degraded, or failed.' });
  if (!Array.isArray(value.diagnostics)) issues.push({ code: 'report.diagnostics', path: 'diagnostics', hint: 'Report every component and lifecycle phase.' });
  const diagnostics = Array.isArray(value.diagnostics) ? value.diagnostics : [];
  for (const [index, item] of diagnostics.entries()) {
    if (!isRecord(item) || !['extension', 'service', 'product'].includes(item.kind as string) || typeof item.id !== 'string' || typeof item.version !== 'string' || !['discovery', 'acquire', 'verify', 'install', 'permission', 'activate', 'service-ready', 'product-ready', 'cleanup'].includes(item.phase as string) || !['pending', 'running', 'ready', 'degraded', 'failed', 'skipped'].includes(item.status as string) || typeof item.required !== 'boolean') {
      issues.push({ code: 'report.component', path: `diagnostics[${index}]`, hint: 'Provide kind, id, version, phase, status, and required for every component.' });
    }
  }
  if (value.status === 'ready' && diagnostics.some((item) => isRecord(item) && item.required === true && item.status === 'failed')) issues.push({ code: 'report.ready', path: 'status', hint: 'A required failed component prevents product-ready status.' });
  if (issues.length) throw new ContractValidationError('Invalid ProductRuntimeReportV1', issues);
  return value as unknown as ProductRuntimeReportV1;
}

export const productRuntimeReportV1Schema = {
  type: 'object',
  required: ['version', 'status', 'diagnostics'],
  properties: { version: { const: 1 }, status: { enum: ['starting', 'ready', 'degraded', 'failed'] } },
  additionalProperties: false,
} as const;
