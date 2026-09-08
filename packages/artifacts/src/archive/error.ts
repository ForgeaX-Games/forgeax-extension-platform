export interface ArtifactRecoveryAction {
  readonly command: string;
  readonly description?: string;
}

export class ArtifactError extends Error {
  readonly phase: string;
  readonly component: string;
  readonly hint: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly retryable: boolean;
  readonly recoveryActions: readonly ArtifactRecoveryAction[];

  constructor(options: {
    code: string;
    phase: string;
    component?: string;
    message: string;
    hint: string;
    expected?: string;
    actual?: string;
    retryable?: boolean;
    recoveryActions?: readonly ArtifactRecoveryAction[];
  }) {
    super(options.message);
    this.name = 'ArtifactError';
    this.code = options.code;
    this.phase = options.phase;
    this.component = options.component ?? 'extension-artifact';
    this.hint = options.hint;
    this.expected = options.expected;
    this.actual = options.actual;
    this.retryable = options.retryable ?? false;
    this.recoveryActions = options.recoveryActions ?? [];
  }

  readonly code: string;
}
