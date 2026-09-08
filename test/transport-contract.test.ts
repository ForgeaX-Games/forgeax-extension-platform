import { describe, expect, it } from 'bun:test';

type Failure = { code: string; phase: string; hint: string };
type Handshake = { protocolVersion: number; sessionId: string; nonce: string; capabilities: readonly string[] };

function failure(code: string, phase: string, hint: string): Failure {
  return { code, phase, hint };
}

function validateHandshake(input: Handshake, state: { activeSession?: string; granted: readonly string[] }): Failure | null {
  if (input.protocolVersion !== 1) return failure('transport.version-mismatch', 'handshake', 'Upgrade the Runtime bridge and Extension together.');
  if (state.activeSession === input.sessionId) return failure('transport.duplicate-handshake', 'handshake', 'Reuse the existing session or create a new session id.');
  if (input.capabilities.some((capability) => !state.granted.includes(capability))) {
    return failure('transport.permission-denied', 'capability-handshake', 'Request the missing capability or remove it from the manifest.');
  }
  if (!input.nonce) return failure('transport.missing-nonce', 'handshake', 'Retry with a fresh nonce.');
  return null;
}

describe('Extension Transport contract', () => {
  const valid: Handshake = { protocolVersion: 1, sessionId: 'session-1', nonce: 'nonce-1', capabilities: ['project.read'] };

  it('accepts a compatible capability handshake', () => {
    expect(validateHandshake(valid, { granted: ['project.read'] })).toBeNull();
  });

  it('returns structured version, permission, and duplicate failures', () => {
    const failures = [
      validateHandshake({ ...valid, protocolVersion: 2 }, { granted: ['project.read'] }),
      validateHandshake(valid, { activeSession: 'session-1', granted: ['project.read'] }),
      validateHandshake(valid, { granted: [] }),
    ];
    for (const result of failures) {
      expect(result).not.toBeNull();
      expect(result?.code).toMatch(/^transport\./);
      expect(result?.phase.length).toBeGreaterThan(0);
      expect(result?.hint.length).toBeGreaterThan(0);
    }
  });

  it('fails closed when a handshake nonce is missing', () => {
    expect(validateHandshake({ ...valid, nonce: '' }, { granted: ['project.read'] })?.code).toBe('transport.missing-nonce');
  });
});
