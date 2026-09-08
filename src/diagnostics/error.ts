import type { RuntimeDiagnostic } from '../contracts';

export class RuntimeDiagnosticError extends Error {
  readonly diagnostic: RuntimeDiagnostic;

  constructor(diagnostic: RuntimeDiagnostic) {
    super(diagnostic.message);
    this.name = 'RuntimeDiagnosticError';
    this.diagnostic = diagnostic;
  }
}

export function runtimeDiagnostic(code: string, phase: string, extensionId: string, cause: unknown, retryable = true): RuntimeDiagnostic {
  const message = cause instanceof Error ? cause.message : String(cause);
  return {
    code,
    message,
    hint: `Inspect ${phase} for Extension ${extensionId} and retry the lifecycle phase.`,
    retryable,
    recoveryActions: [{ command: `bun run diagnostics:retry -- --extension ${extensionId} --phase ${phase}` }],
  };
}
