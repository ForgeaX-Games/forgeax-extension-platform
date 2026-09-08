/**
 * Two error types are intentionally the entire surface; finer grained errors
 * (e.g., owner-mismatch) are folded into ExtensionConflictError to keep upper
 * layers' catch blocks simple.
 *
 * Field surface is the superset of the two upstream foundations
 * (ADR 0026): flat diagnostic properties (arrival style) AND a grouped
 * `.info` view of the same fields (forgeax style). Same facts, two access
 * paths — both consumer bases keep their idioms.
 */

export interface ExtensionConflictErrorInit {
  readonly id: string;
  readonly subRegistryName: string;
  readonly existingOwner: string;
  readonly newOwner: string;
}

/** forgeax-side alias for the same shape. */
export type ExtensionConflictErrorInfo = ExtensionConflictErrorInit;

export class ExtensionConflictError extends Error {
  readonly id: string;
  readonly subRegistryName: string;
  readonly existingOwner: string;
  readonly newOwner: string;
  /** Grouped view of the flat fields above. */
  readonly info: ExtensionConflictErrorInit;

  constructor(init: ExtensionConflictErrorInit) {
    super(
      `[extension-platform] "${init.id}" in "${init.subRegistryName}" already owned by "${init.existingOwner}"; new owner "${init.newOwner}" rejected`,
    );
    this.name = 'ExtensionConflictError';
    this.id = init.id;
    this.subRegistryName = init.subRegistryName;
    this.existingOwner = init.existingOwner;
    this.newOwner = init.newOwner;
    this.info = init;
  }
}

export type ExtensionPhase = 'setup' | 'cleanup';

export interface ExtensionSetupErrorInit {
  readonly extensionId: string;
  readonly phase: ExtensionPhase;
  readonly cause: unknown;
}

/** forgeax-side alias for the same shape. */
export type ExtensionSetupErrorInfo = ExtensionSetupErrorInit;

export class ExtensionSetupError extends Error {
  readonly extensionId: string;
  readonly phase: ExtensionPhase;
  // ES2022 Error.cause; declared explicitly so the property is always
  // present regardless of compile target. Modern runtimes we ship to
  // (Chromium / Safari / Node 18+ / Bun) all honour this property.
  readonly cause: unknown;
  /** Grouped view of the flat fields above. */
  readonly info: ExtensionSetupErrorInit;

  constructor(init: ExtensionSetupErrorInit) {
    super(
      `[extension-platform] extension "${init.extensionId}" ${init.phase} threw: ${String(init.cause)}`,
    );
    this.name = 'ExtensionSetupError';
    this.extensionId = init.extensionId;
    this.phase = init.phase;
    this.cause = init.cause;
    this.info = init;
  }
}
