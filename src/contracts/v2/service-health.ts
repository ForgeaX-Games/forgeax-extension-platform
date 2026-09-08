import { ContractValidationError, type ContractIssue } from '../extension-manifest';

export interface ServiceHealthV1 {
  readonly version: 1;
  readonly serviceId: string;
  readonly serviceVersion: string;
  readonly status: 'starting' | 'ready' | 'degraded' | 'failed' | 'stopped';
  readonly protocol: { readonly min: string; readonly max: string };
  readonly ready: boolean;
  readonly restartable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseServiceHealth(input: unknown): ServiceHealthV1 {
  const value = input as Record<string, unknown> | null;
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) throw new ContractValidationError('Service health must be an object', [{ code: 'health.not-object', path: '', hint: 'Provide a ServiceHealthV1 object.' }]);
  if (value.version !== 1) issues.push({ code: 'health.version', path: 'version', hint: 'Use ServiceHealthV1.' });
  if (typeof value.serviceId !== 'string' || value.serviceId.trim() === '') issues.push({ code: 'health.service-id', path: 'serviceId', hint: 'Identify the supervised service.' });
  if (typeof value.serviceVersion !== 'string' || value.serviceVersion.trim() === '') issues.push({ code: 'health.service-version', path: 'serviceVersion', hint: 'Report the running service version.' });
  if (!['starting', 'ready', 'degraded', 'failed', 'stopped'].includes(value.status as string)) issues.push({ code: 'health.status', path: 'status', hint: 'Use starting, ready, degraded, failed, or stopped.' });
  if (!isRecord(value.protocol) || typeof value.protocol.min !== 'string' || typeof value.protocol.max !== 'string' || Number(value.protocol.min) > Number(value.protocol.max)) issues.push({ code: 'health.protocol', path: 'protocol', hint: 'Declare an ordered supported protocol range.' });
  if (typeof value.ready !== 'boolean' || (value.status === 'ready' && value.ready !== true) || (value.status !== 'ready' && value.ready === true)) issues.push({ code: 'health.ready', path: 'ready', hint: 'The ready flag must agree with the service status.' });
  if (typeof value.restartable !== 'boolean') issues.push({ code: 'health.restartable', path: 'restartable', hint: 'Declare whether the supervisor may restart this service.' });
  if (issues.length) throw new ContractValidationError('Invalid ServiceHealthV1', issues);
  return value as unknown as ServiceHealthV1;
}

export const serviceHealthV1Schema = {
  type: 'object',
  required: ['version', 'serviceId', 'serviceVersion', 'status', 'protocol', 'ready', 'restartable'],
  properties: { version: { const: 1 }, status: { enum: ['starting', 'ready', 'degraded', 'failed', 'stopped'] } },
  additionalProperties: false,
} as const;
