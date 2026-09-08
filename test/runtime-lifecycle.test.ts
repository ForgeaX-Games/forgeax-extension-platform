import { describe, expect, it } from 'bun:test';
import { createExtensionRuntime, type RuntimeExtensionDescriptor } from '../src/runtime';

const descriptor = (overrides: Partial<RuntimeExtensionDescriptor> = {}): RuntimeExtensionDescriptor => ({
  id: 'forgeax.editor.fixture', version: '1.0.0', required: true, permissions: ['project.read'],
  verify: async () => {}, install: async () => {}, requestPermissions: async () => true, activate: async () => () => {}, ...overrides,
});

describe('Extension Runtime lifecycle', () => {
  it('reports every phase and reaches product-ready only after verify, install, permission, and activate', async () => {
    const phases: string[] = [];
    const runtime = createExtensionRuntime({ extensions: [descriptor({ verify: async () => { phases.push('verify'); }, install: async () => { phases.push('install'); }, requestPermissions: async () => { phases.push('permission'); return true; }, activate: async () => { phases.push('activate'); return () => { phases.push('cleanup'); }; } })] });
    const report = await runtime.start();
    expect(report.status).toBe('ready');
    expect(phases).toEqual(['verify', 'install', 'permission', 'activate']);
    expect(report.diagnostics.map((item) => item.phase)).toEqual(['discovery', 'acquire', 'verify', 'install', 'permission', 'activate', 'product-ready']);
    await runtime.stop();
    expect(phases).toContain('cleanup');
  });

  it('never reports ready when a required phase fails', async () => {
    const report = await createExtensionRuntime({ extensions: [descriptor({ verify: async () => { throw new Error('missing digest'); } })] }).start();
    expect(report.status).toBe('failed');
    expect(report.diagnostics.some((item) => item.required && item.status === 'failed' && item.error?.code === 'FXE_RUNTIME_VERIFY_FAILED')).toBe(true);
    expect(report.diagnostics.some((item) => item.phase === 'product-ready')).toBe(false);
  });

  it('marks optional failures degraded and carries structured recovery fields', async () => {
    const report = await createExtensionRuntime({ extensions: [descriptor({ required: false, activate: async () => { throw new Error('activation failed'); } })] }).start();
    expect(report.status).toBe('degraded');
    const failed = report.diagnostics.find((item) => item.status === 'failed');
    expect(failed?.required).toBe(false);
    expect(failed?.error).toMatchObject({ code: 'FXE_RUNTIME_ACTIVATE_FAILED', hint: expect.any(String), retryable: true, recoveryActions: expect.any(Array) });
  });
});
