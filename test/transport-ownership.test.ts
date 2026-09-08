import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(import.meta.dir, '../src/transport/index.ts'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(import.meta.dir, '../package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
};

describe('extension transport ownership contract', () => {
  it('exports one transport ownership chain', () => {
    for (const symbol of [
      'Transport',
      'RpcChannel',
      'createHost',
      'createExtensionPort',
      'createMockTransportPair',
      'createWindowTransport',
      'installExtensionDiagnosticsBridge',
    ]) {
      expect(source).toContain(symbol);
    }
    expect(source).not.toMatch(/HostSdk|host-sdk/);
    expect(manifest.dependencies?.['@forgeax/types']).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(manifest.dependencies?.zod).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(manifest.exports?.['./transport']).toBeDefined();
  });

  it('keeps the complete RPC and window transport behavior under one subpath', () => {
    for (const file of ['rpc.ts', 'transport.ts', 'transport-window.ts', 'extension-side.ts', 'host-side.ts', 'extension-diagnostics.ts']) {
      expect(readFileSync(resolve(import.meta.dir, `../src/transport/${file}`), 'utf8').length).toBeGreaterThan(0);
    }
  });

  it('does not expose a duplicate transport contract', () => {
    expect(source).toContain('createWindowTransport');
    expect(source).toContain('Transport');
  });

  it('uses extension transport vocabulary throughout the implementation', () => {
    const transportSource = ['rpc.ts', 'transport.ts', 'transport-mock.ts', 'extension-side.ts', 'host-side.ts']
      .map((file) => readFileSync(resolve(import.meta.dir, `../src/transport/${file}`), 'utf8'))
      .join('\n');
    expect(transportSource).not.toMatch(/HostSdk|host-sdk/);
    expect(transportSource).toContain('ExtensionTransportEnvelope');
  });
});
