import type { CapabilityRegistry } from '../platform/capabilities';
import { ExtensionSetupError } from '../platform/errors';
import type { Cleanup } from '../base/lifecycle';
import type { ExtensionManifest } from './manifest';

/**
 * Generic extension loader. Owns the lifecycle of a set of
 * `ExtensionManifest`s:
 *
 * - Activates extensions in declared order, awaiting async `setup` serially.
 * - Extensions whose `requires` are not met go into `pending`; they activate
 *   automatically when capabilities later appear.
 * - On capability removal, dependent extensions are cleaned up and pushed
 *   back into `pending`.
 * - `unload()` cleans up all active extensions in reverse activation order.
 *
 * Merged superset of the two upstream foundations (2026-07-20, ADR 0026):
 * arrival's class body (error-sink isolation, devMode default from
 * import.meta.env.DEV, pending-warn timers) + forgeax's full state reset on
 * unload (`nextOrder`) and factory idiom (`createExtensionLoader`).
 */

const PENDING_WARN_DELAY_MS = 30_000;

export interface ExtensionLoaderOptions<Ctx, C extends string> {
  readonly capabilities: CapabilityRegistry<C>;
  readonly contextFactory: (manifest: ExtensionManifest<C, Ctx>) => Ctx;
  readonly onError?: (
    err: ExtensionSetupError,
    manifest: ExtensionManifest<C, Ctx>,
    phase: 'setup' | 'cleanup',
  ) => void;
  /**
   * When true, extensions that remain pending for >30s emit a console.warn.
   * Defaults to `import.meta.env.DEV === true` at construction time.
   */
  readonly devMode?: boolean;
}

interface ActiveRecord<Ctx, C extends string> {
  readonly manifest: ExtensionManifest<C, Ctx>;
  readonly cleanup: Cleanup | undefined;
  readonly order: number;
}

export class ExtensionLoader<Ctx, C extends string> {
  private readonly capabilities: CapabilityRegistry<C>;
  private readonly contextFactory: (manifest: ExtensionManifest<C, Ctx>) => Ctx;
  private readonly onError: ExtensionLoaderOptions<Ctx, C>['onError'];
  private readonly devMode: boolean;

  private readonly pending = new Map<string, ExtensionManifest<C, Ctx>>();
  private readonly active = new Map<string, ActiveRecord<Ctx, C>>();
  private readonly activeOrder: string[] = [];
  private readonly declarationOrder = new Map<string, number>();
  private readonly pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * All async lifecycle work (load drain, capability-removed cleanup) is
   * serialized onto this chain so external callers' `flush()` always
   * observes a consistent state.
   */
  private opChain: Promise<void> = Promise.resolve();

  private capAddedUnsub: (() => void) | undefined;
  private capRemovedUnsub: (() => void) | undefined;
  private nextOrder = 0;

  constructor(opts: ExtensionLoaderOptions<Ctx, C>) {
    this.capabilities = opts.capabilities;
    this.contextFactory = opts.contextFactory;
    this.onError = opts.onError;
    this.devMode = opts.devMode ?? defaultDevMode();
  }

  load(manifests: ReadonlyArray<ExtensionManifest<C, Ctx>>): Promise<void> {
    if (!this.capAddedUnsub) {
      this.capAddedUnsub = this.capabilities.on('added', () => {
        this.enqueue(() => this.scanAndActivate());
      });
      this.capRemovedUnsub = this.capabilities.on('removed', (cap) => {
        this.enqueue(() => this.handleCapabilityRemoved(cap));
      });
    }

    for (const m of manifests) {
      if (this.declarationOrder.has(m.id) || this.active.has(m.id)) continue;
      this.declarationOrder.set(m.id, this.declarationOrder.size);
      this.pending.set(m.id, m);
      this.startPendingTimer(m);
    }

    return this.enqueue(() => this.scanAndActivate());
  }

  unload(): Promise<void> {
    return this.enqueue(async () => {
      for (const id of this.pending.keys()) this.clearPendingTimer(id);
      this.pending.clear();

      const order = [...this.activeOrder].reverse();
      for (const id of order) {
        const rec = this.active.get(id);
        if (!rec) continue;
        await this.runCleanup(rec);
        this.active.delete(id);
      }
      this.activeOrder.length = 0;
      this.declarationOrder.clear();
      this.nextOrder = 0;

      this.capAddedUnsub?.();
      this.capRemovedUnsub?.();
      this.capAddedUnsub = undefined;
      this.capRemovedUnsub = undefined;
    });
  }

  getPending(): ReadonlyArray<ExtensionManifest<C, Ctx>> {
    return [...this.pending.values()];
  }

  getActive(): ReadonlyArray<ExtensionManifest<C, Ctx>> {
    return this.activeOrder
      .map((id) => this.active.get(id)?.manifest)
      .filter((m): m is ExtensionManifest<C, Ctx> => m !== undefined);
  }

  /**
   * Resolves once all queued lifecycle work (initial load drain + any
   * capability-driven re-activation / cleanup) has completed. Tests and
   * callers that toggle capabilities externally await this.
   */
  flush(): Promise<void> {
    return this.opChain;
  }

  // --- private -------------------------------------------------------------

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.opChain.then(work).catch(() => {
      // Errors inside lifecycle work are reported via onError; we never
      // surface them on the chain so a single failure doesn't poison
      // subsequent operations.
    });
    this.opChain = next;
    return next;
  }

  private async scanAndActivate(): Promise<void> {
    // Repeatedly find the lowest-declarationOrder pending extension whose
    // requires are now satisfied, activate it, restart the scan. Restart is
    // necessary because activation may add capabilities that unblock
    // earlier-declared pending extensions.
    while (true) {
      const candidate = this.firstReadyPending();
      if (!candidate) return;
      this.pending.delete(candidate.id);
      this.clearPendingTimer(candidate.id);
      await this.activateOne(candidate);
    }
  }

  private firstReadyPending(): ExtensionManifest<C, Ctx> | undefined {
    let best: ExtensionManifest<C, Ctx> | undefined;
    let bestOrder = Infinity;
    for (const m of this.pending.values()) {
      if (!this.requiresSatisfied(m)) continue;
      const o = this.declarationOrder.get(m.id) ?? Infinity;
      if (o < bestOrder) {
        best = m;
        bestOrder = o;
      }
    }
    return best;
  }

  private requiresSatisfied(m: ExtensionManifest<C, Ctx>): boolean {
    if (!m.requires || m.requires.length === 0) return true;
    for (const r of m.requires) if (!this.capabilities.has(r)) return false;
    return true;
  }

  private async activateOne(m: ExtensionManifest<C, Ctx>): Promise<void> {
    let cleanup: Cleanup | undefined;
    try {
      const ctx = this.contextFactory(m);
      const result = await m.setup(ctx);
      if (typeof result === 'function') cleanup = result as Cleanup;
    } catch (cause) {
      const err = new ExtensionSetupError({ extensionId: m.id, phase: 'setup', cause });
      this.reportError(err, m, 'setup');
      return;
    }

    const order = this.nextOrder++;
    this.active.set(m.id, { manifest: m, cleanup, order });
    this.activeOrder.push(m.id);

    if (m.provides) {
      for (const c of m.provides) this.capabilities.add(c);
    }
  }

  private async handleCapabilityRemoved(cap: C): Promise<void> {
    const victims: ActiveRecord<Ctx, C>[] = [];
    for (const id of this.activeOrder) {
      const rec = this.active.get(id);
      if (!rec) continue;
      if (rec.manifest.requires?.includes(cap)) victims.push(rec);
    }
    if (victims.length === 0) return;
    // Cleanup in reverse activation order, then push back into pending.
    for (const rec of victims.slice().sort((a, b) => b.order - a.order)) {
      await this.runCleanup(rec);
      this.active.delete(rec.manifest.id);
      const idx = this.activeOrder.indexOf(rec.manifest.id);
      if (idx >= 0) this.activeOrder.splice(idx, 1);
      this.pending.set(rec.manifest.id, rec.manifest);
      this.startPendingTimer(rec.manifest);
    }
  }

  private async runCleanup(rec: ActiveRecord<Ctx, C>): Promise<void> {
    if (!rec.cleanup) return;
    try {
      await rec.cleanup();
    } catch (cause) {
      const err = new ExtensionSetupError({
        extensionId: rec.manifest.id,
        phase: 'cleanup',
        cause,
      });
      this.reportError(err, rec.manifest, 'cleanup');
    }
  }

  private reportError(
    err: ExtensionSetupError,
    manifest: ExtensionManifest<C, Ctx>,
    phase: 'setup' | 'cleanup',
  ): void {
    if (this.onError) {
      try {
        this.onError(err, manifest, phase);
      } catch {
        // Don't allow the error sink itself to crash the loader.
      }
    } else {
      console.error(err);
    }
  }

  private startPendingTimer(m: ExtensionManifest<C, Ctx>): void {
    if (!this.devMode) return;
    if (this.pendingTimers.has(m.id)) return;
    const timer = setTimeout(() => {
      const missing = (m.requires ?? []).filter((c) => !this.capabilities.has(c));
      console.warn(
        `[extension-platform] extension "${m.id}" has been pending for >${PENDING_WARN_DELAY_MS}ms; missing capabilities: ${JSON.stringify(missing)}`,
      );
      this.pendingTimers.delete(m.id);
    }, PENDING_WARN_DELAY_MS);
    this.pendingTimers.set(m.id, timer);
  }

  private clearPendingTimer(id: string): void {
    const t = this.pendingTimers.get(id);
    if (!t) return;
    clearTimeout(t);
    this.pendingTimers.delete(id);
  }
}

/** forgeax-side factory idiom for the same class. */
export function createExtensionLoader<Ctx, C extends string>(
  opts: ExtensionLoaderOptions<Ctx, C>,
): ExtensionLoader<Ctx, C> {
  return new ExtensionLoader<Ctx, C>(opts);
}

function defaultDevMode(): boolean {
  // Vite injects import.meta.env.DEV; in tests with a different module's
  // import.meta this is not mutable cross-module. Callers that need
  // deterministic behavior should pass `devMode` explicitly.
  const env = (import.meta as { env?: { DEV?: unknown } }).env;
  return env?.DEV === true;
}
