/**
 * Cross-domain extension manifest shared by all consuming shells.
 *
 * `C` is the capability union for that domain (e.g., chat's HostCapability,
 * app-shell's AppCapability). `Ctx` is the per-domain extension context.
 */
import type { Cleanup, SetupReturn } from '../base/lifecycle';

export interface ExtensionManifest<C extends string, Ctx = unknown> {
  /** Globally unique within the host system. Kebab-case. */
  readonly id: string;
  /** Semver of this extension's contributions. */
  readonly version: string;
  /** Capabilities the host MUST expose for this extension to activate. */
  readonly requires?: readonly C[];
  /** Capabilities this extension will add to the host once setup resolves. */
  readonly provides?: readonly C[];
  /**
   * Activation. May return a Cleanup callable (sync or async). Throwing or
   * a rejected Promise is forwarded to onError as ExtensionSetupError.
   */
  readonly setup: (ctx: Ctx) => SetupReturn | Promise<SetupReturn>;
}

export type { Cleanup, SetupReturn };
