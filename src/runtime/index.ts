import type { ProductRuntimeReportV1, RuntimeComponentReport } from '../contracts';
import { createPermissionPolicy, type PermissionPolicy } from '../permissions/policy';
import { runtimeDiagnostic } from '../diagnostics/error';

export type RuntimeCleanup = void | (() => void | Promise<void>);

export interface RuntimeExtensionDescriptor {
  readonly id: string;
  readonly version: string;
  readonly required: boolean;
  readonly permissions: readonly string[];
  readonly verify: () => void | Promise<void>;
  readonly install: () => void | Promise<void>;
  readonly requestPermissions: () => boolean | Promise<boolean>;
  readonly activate: () => RuntimeCleanup | Promise<RuntimeCleanup>;
}

export interface ExtensionRuntimeOptions {
  readonly extensions: readonly RuntimeExtensionDescriptor[];
  readonly permissionPolicy?: PermissionPolicy;
}

export interface ExtensionRuntime {
  start(): Promise<ProductRuntimeReportV1>;
  stop(): Promise<ProductRuntimeReportV1>;
  report(): ProductRuntimeReportV1;
}

function component(extension: RuntimeExtensionDescriptor, phase: RuntimeComponentReport['phase'], status: RuntimeComponentReport['status'], error?: RuntimeComponentReport['error']): RuntimeComponentReport {
  return { kind: 'extension', id: extension.id, version: extension.version, phase, status, required: extension.required, ...(error ? { error } : {}) };
}

export function createExtensionRuntime(options: ExtensionRuntimeOptions): ExtensionRuntime {
  const permissionPolicy = options.permissionPolicy ?? createPermissionPolicy({ granted: options.extensions.flatMap((extension) => extension.permissions) });
  const cleanups: Array<() => void | Promise<void>> = [];
  let current: ProductRuntimeReportV1 = { version: 1, status: 'starting', diagnostics: [] };

  const start = async (): Promise<ProductRuntimeReportV1> => {
    const diagnostics: RuntimeComponentReport[] = [];
    let requiredFailure = false; let optionalFailure = false;
    for (const extension of options.extensions) {
      diagnostics.push(component(extension, 'discovery', 'ready'), component(extension, 'acquire', 'ready'));
      const phases: Array<[RuntimeComponentReport['phase'], () => void | Promise<void>]> = [
        ['verify', extension.verify], ['install', extension.install],
        ['permission', async () => { const policyGranted = await permissionPolicy.request({ extensionId: extension.id, permissions: extension.permissions }); const requested = await extension.requestPermissions(); if (!policyGranted || !requested) throw new Error('Extension permission was denied'); }],
        ['activate', async () => { const cleanup = await extension.activate(); if (cleanup) cleanups.push(cleanup); }],
      ];
      let failed = false;
      for (const [phase, action] of phases) {
        if (failed) break;
        try { await action(); diagnostics.push(component(extension, phase, 'ready')); }
        catch (error) { failed = true; if (extension.required) requiredFailure = true; else optionalFailure = true; diagnostics.push(component(extension, phase, 'failed', runtimeDiagnostic(`FXE_RUNTIME_${phase.toUpperCase().replace('-', '_')}_FAILED`, phase, extension.id, error))); }
      }
    }
    const status: ProductRuntimeReportV1['status'] = requiredFailure ? 'failed' : optionalFailure ? 'degraded' : 'ready';
    if (!requiredFailure) diagnostics.push({ kind: 'product', id: 'forgeax-product', version: '1', phase: 'product-ready', status: status === 'ready' ? 'ready' : 'degraded', required: true });
    current = { version: 1, status, diagnostics };
    return current;
  };

  const stop = async (): Promise<ProductRuntimeReportV1> => {
    const errors: RuntimeComponentReport[] = [];
    while (cleanups.length) {
      const cleanup = cleanups.pop()!;
      try { await cleanup(); } catch (error) { errors.push({ kind: 'product', id: 'forgeax-product', version: '1', phase: 'cleanup', status: 'failed', required: true, error: runtimeDiagnostic('FXE_RUNTIME_CLEANUP_FAILED', 'cleanup', 'forgeax-product', error, false) }); }
    }
    if (errors.length) current = { version: 1, status: 'failed', diagnostics: [...current.diagnostics, ...errors] };
    return current;
  };

  return { start, stop, report: () => current };
}
