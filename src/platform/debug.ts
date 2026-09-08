import type { EventBus } from '../base/bus';
import type { Registry } from './registry';
import type { ExtensionLoader } from '../extensions/loader';

/**
 * Dev-only debug hook. Mounts onto `globalThis.__VAG_DEBUG__.extensionPlatform`
 * so DevTools / inspectors can dump every registered sub-registry, bus, and
 * loader across the consuming shells. Production builds MUST pass
 * `devMode: false` so the global stays undefined.
 */

interface RegistrySnapshot {
  readonly id: string;
  readonly owner: string;
}

interface BusSnapshot {
  readonly totalListeners: number;
}

interface LoaderSnapshot {
  readonly pendingIds: ReadonlyArray<string>;
  readonly activeIds: ReadonlyArray<string>;
}

export interface DebugSnapshot {
  readonly registries: Record<string, ReadonlyArray<RegistrySnapshot>>;
  readonly buses: Record<string, BusSnapshot>;
  readonly loaders: Record<string, LoaderSnapshot>;
}

type AnyRegistry = Registry<string, { id: string }>;
type AnyBus = EventBus<Record<string, unknown>>;
type AnyLoader = ExtensionLoader<unknown, string>;

export interface ExtensionPlatformDebug {
  register(name: string, target: AnyRegistry | AnyBus | AnyLoader): void;
  unregister(name: string): void;
  snapshot(): DebugSnapshot;
}

interface VagDebugGlobal {
  extensionPlatform?: ExtensionPlatformDebug;
  [key: string]: unknown;
}

interface GlobalShape {
  __VAG_DEBUG__?: VagDebugGlobal;
}

export interface InstallDebugHookOptions {
  readonly devMode?: boolean;
}

export function installDebugHook(opts: InstallDebugHookOptions = {}): void {
  const isDev = opts.devMode ?? defaultDevMode();
  if (!isDev) return;

  const registries = new Map<string, AnyRegistry>();
  const buses = new Map<string, AnyBus>();
  const loaders = new Map<string, AnyLoader>();

  const hook: ExtensionPlatformDebug = {
    register(name, target) {
      if (isRegistry(target)) registries.set(name, target);
      else if (isLoader(target)) loaders.set(name, target);
      else if (isBus(target)) buses.set(name, target);
    },
    unregister(name) {
      registries.delete(name);
      buses.delete(name);
      loaders.delete(name);
    },
    snapshot() {
      return {
        registries: Object.fromEntries(
          [...registries].map(([k, r]) => [k, r.snapshot()]),
        ),
        buses: Object.fromEntries(
          [...buses].map(([k, b]) => [k, { totalListeners: b.listenerCount() }]),
        ),
        loaders: Object.fromEntries(
          [...loaders].map(([k, l]) => [
            k,
            {
              pendingIds: l.getPending().map((m) => m.id),
              activeIds: l.getActive().map((m) => m.id),
            },
          ]),
        ),
      };
    },
  };

  const g = globalThis as unknown as GlobalShape;
  if (!g.__VAG_DEBUG__) g.__VAG_DEBUG__ = {};
  g.__VAG_DEBUG__.extensionPlatform = hook;
}

export function uninstallDebugHook(): void {
  const g = globalThis as unknown as GlobalShape;
  if (g.__VAG_DEBUG__?.extensionPlatform) delete g.__VAG_DEBUG__.extensionPlatform;
}

// --- duck-typing helpers ---------------------------------------------------

function isRegistry(t: unknown): t is AnyRegistry {
  return typeof (t as { snapshot?: unknown }).snapshot === 'function' &&
    typeof (t as { register?: unknown }).register === 'function' &&
    typeof (t as { unregisterByOwner?: unknown }).unregisterByOwner === 'function';
}

function isBus(t: unknown): t is AnyBus {
  return typeof (t as { listenerCount?: unknown }).listenerCount === 'function' &&
    typeof (t as { use?: unknown }).use === 'function';
}

function isLoader(t: unknown): t is AnyLoader {
  return typeof (t as { getPending?: unknown }).getPending === 'function' &&
    typeof (t as { getActive?: unknown }).getActive === 'function';
}

function defaultDevMode(): boolean {
  const env = (import.meta as { env?: { DEV?: unknown } }).env;
  return env?.DEV === true;
}
