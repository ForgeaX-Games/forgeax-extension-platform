// Ordered, owner-tagged contribution store — the SSOT for what extensions
// contribute to a shell. Domain-agnostic: T is opaque here; the shell layer
// folds entries() into a derived snapshot.
//
// Removal semantics: a contribution's Cleanup deletes its entry and bumps the
// version — consumers re-fold from entries(). This replaces prev-value
// undo-closure approaches, whose restore was order-sensitive; re-folding is
// not.
import type { Cleanup } from '../base/lifecycle';

export interface ContributionEntry<T> {
  readonly owner: string;
  readonly item: T;
}

export interface ContributionRegistrySnapshot<T> {
  /** Shared generation for the last published write. Registries changed by one
   * transaction publish the same generation before any listener runs. */
  readonly generation: number;
  readonly version: number;
  readonly entries: ReadonlyArray<ContributionEntry<T>>;
}

export interface ContributionRegistry<T> {
  /** Append an owner-tagged entry (declaration order preserved). Returns an
   *  idempotent Cleanup that removes exactly this entry. */
  contribute(owner: string, item: T): Cleanup;
  /** Live entries in contribution order. Fresh array per call. */
  entries(): ReadonlyArray<ContributionEntry<T>>;
  /** Coarse-grained change signal — fires after any add/remove. */
  onChange(listener: () => void): () => void;
  /** Monotonic counter; bumps on every add/remove. Memo key for derived views. */
  version(): number;
  /** Coherent read model for consumers that fold more than one registry. */
  snapshot(): ContributionRegistrySnapshot<T>;
}

interface RegistryInternals<T> {
  list: Array<ContributionEntry<T>>;
  readonly listeners: Set<() => void>;
  version: number;
  generation: number;
}

const registryInternals = new WeakMap<object, RegistryInternals<unknown>>();
let nextGeneration = 0;

function allocateGeneration(): number {
  nextGeneration++;
  return nextGeneration;
}

function internalFor<T>(registry: ContributionRegistry<T>): RegistryInternals<T> {
  const internal = registryInternals.get(registry);
  if (!internal) throw new Error('contribution transaction received an unknown registry');
  return internal as RegistryInternals<T>;
}

function publish<T>(internal: RegistryInternals<T>, list: Array<ContributionEntry<T>>, generation: number): void {
  internal.list = list;
  internal.version++;
  internal.generation = generation;
}

function notify(internal: RegistryInternals<unknown>): unknown[] {
  const errors: unknown[] = [];
  // Snapshot before iterating — a listener may unsubscribe itself.
  for (const listener of [...internal.listeners]) {
    try {
      listener();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

export function createContributionRegistry<T>(): ContributionRegistry<T> {
  const internal: RegistryInternals<T> = {
    list: [],
    listeners: new Set(),
    version: 0,
    generation: 0,
  };
  const registry: ContributionRegistry<T> = {
    contribute(owner, item) {
      const entry: ContributionEntry<T> = { owner, item };
      publish(internal, [...internal.list, entry], allocateGeneration());
      const errors = notify(internal as RegistryInternals<unknown>);
      if (errors.length) throw new AggregateError(errors, 'contribution registry listener failed');
      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        const i = internal.list.indexOf(entry);
        if (i < 0) return;
        const next = [...internal.list];
        next.splice(i, 1);
        publish(internal, next, allocateGeneration());
        const cleanupErrors = notify(internal as RegistryInternals<unknown>);
        if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'contribution registry listener failed');
      };
    },
    entries() {
      return [...internal.list];
    },
    onChange(listener) {
      internal.listeners.add(listener);
      return () => {
        internal.listeners.delete(listener);
      };
    },
    version() {
      return internal.version;
    },
    snapshot() {
      return {
        generation: internal.generation,
        version: internal.version,
        entries: [...internal.list],
      };
    },
  };
  registryInternals.set(registry, internal as RegistryInternals<unknown>);
  return registry;
}

type StagedOperation<T> =
  | { readonly kind: 'add'; readonly entry: ContributionEntry<T> }
  | { readonly kind: 'remove-owner'; readonly owner: string };

interface StagedRegistry<T> {
  readonly internal: RegistryInternals<T>;
  readonly operations: Array<StagedOperation<T>>;
  readonly addedEntries: Array<ContributionEntry<T>>;
}

export interface ContributionTransactionCommit {
  readonly generation: number;
  /** Listener failures do not roll back an already-published atomic commit and
   * do not hide its cleanup handle from the caller. */
  readonly notificationErrors: readonly unknown[];
  /** Removes entries added by this transaction, atomically across registries.
   * Entries removed via removeOwner are intentionally not restored. */
  readonly cleanup: Cleanup;
}

export interface ContributionTransaction {
  contribute<T>(registry: ContributionRegistry<T>, owner: string, item: T): void;
  removeOwner<T>(registry: ContributionRegistry<T>, owner: string): void;
  commit(): ContributionTransactionCommit;
  abort(): void;
}

/** Stages contribution changes and publishes all affected registries before
 * notifying any subscriber. A listener folding multiple registries therefore
 * observes either the complete old state or the complete new state. */
export function createContributionTransaction(): ContributionTransaction {
  const staged = new Map<RegistryInternals<unknown>, StagedRegistry<unknown>>();
  let state: 'open' | 'committed' | 'aborted' = 'open';

  const assertOpen = (): void => {
    if (state !== 'open') throw new Error(`contribution transaction is ${state}`);
  };

  const stageFor = <T>(registry: ContributionRegistry<T>): StagedRegistry<T> => {
    const internal = internalFor(registry);
    let current = staged.get(internal as RegistryInternals<unknown>);
    if (!current) {
      current = { internal, operations: [], addedEntries: [] } as StagedRegistry<unknown>;
      staged.set(internal as RegistryInternals<unknown>, current);
    }
    return current as StagedRegistry<T>;
  };

  return {
    contribute<T>(registry: ContributionRegistry<T>, owner: string, item: T): void {
      assertOpen();
      const target = stageFor(registry);
      const entry: ContributionEntry<T> = { owner, item };
      target.operations.push({ kind: 'add', entry });
      target.addedEntries.push(entry);
    },
    removeOwner<T>(registry: ContributionRegistry<T>, owner: string): void {
      assertOpen();
      stageFor(registry).operations.push({ kind: 'remove-owner', owner });
    },
    commit(): ContributionTransactionCommit {
      assertOpen();
      const generation = allocateGeneration();
      const changed: Array<StagedRegistry<unknown>> = [];

      for (const target of staged.values()) {
        let next = [...target.internal.list];
        for (const operation of target.operations) {
          if (operation.kind === 'add') next.push(operation.entry);
          else next = next.filter((entry) => entry.owner !== operation.owner);
        }
        if (
          next.length !== target.internal.list.length ||
          next.some((entry, index) => entry !== target.internal.list[index])
        ) {
          publish(target.internal, next, generation);
          changed.push(target);
        }
      }
      state = 'committed';

      const notificationErrors = changed.flatMap((target) => notify(target.internal));

      let cleaned = false;
      return {
        generation,
        notificationErrors,
        cleanup(): void {
          if (cleaned) return;
          cleaned = true;
          const cleanupGeneration = allocateGeneration();
          const cleanupTargets: Array<RegistryInternals<unknown>> = [];
          for (const target of staged.values()) {
            if (!target.addedEntries.length) continue;
            const added = new Set(target.addedEntries);
            const next = target.internal.list.filter((entry) => !added.has(entry));
            if (next.length === target.internal.list.length) continue;
            publish(target.internal, next, cleanupGeneration);
            cleanupTargets.push(target.internal);
          }
          const cleanupErrors = cleanupTargets.flatMap((target) => notify(target));
          if (cleanupErrors.length) {
            throw new AggregateError(cleanupErrors, 'contribution transaction cleanup listener failed');
          }
        },
      };
    },
    abort(): void {
      assertOpen();
      state = 'aborted';
      staged.clear();
    },
  };
}
