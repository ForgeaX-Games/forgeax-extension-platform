import { EventBus } from '../base/bus';

/**
 * Observable capability set. Upper layers wrap this inside their host
 * bridge; this is the only sanctioned source-of-truth for capability
 * membership in the platform layer.
 */

export type CapabilityEventName = 'added' | 'removed';

interface CapabilityEvents<C extends string> {
  added: C;
  removed: C;
  [topic: string]: C;
}

export class CapabilityRegistry<C extends string> {
  private readonly set = new Set<C>();
  // Internal bus is private — exposing it would let consumers bypass the
  // idempotent add/remove guarantee. We only re-export `on` / unsubscribe.
  private readonly bus = new EventBus<CapabilityEvents<C>>();

  add(capability: C): void {
    if (this.set.has(capability)) return;
    this.set.add(capability);
    this.bus.emit('added', capability);
  }

  remove(capability: C): void {
    if (!this.set.has(capability)) return;
    this.set.delete(capability);
    this.bus.emit('removed', capability);
  }

  has(capability: C): boolean {
    return this.set.has(capability);
  }

  /** Returns a frozen ReadonlySet view; mutations throw at runtime. */
  snapshot(): ReadonlySet<C> {
    // Build a fresh frozen Set so the view is also immune to subsequent
    // mutations on the source set.
    const copy = new Set<C>(this.set);
    return freezeSet(copy);
  }

  on(event: CapabilityEventName, listener: (capability: C) => void): () => void {
    return this.bus.on(event, listener);
  }
}

/** forgeax-side factory idiom for the same class. */
export function createCapabilityRegistry<C extends string>(): CapabilityRegistry<C> {
  return new CapabilityRegistry<C>();
}

function freezeSet<T>(set: Set<T>): ReadonlySet<T> {
  const reject = (op: string) => () => {
    throw new TypeError(
      `[extension-platform] CapabilityRegistry.snapshot() returned a read-only Set; ${op}() is not permitted`,
    );
  };
  set.add = reject('add') as typeof set.add;
  set.delete = reject('delete') as typeof set.delete;
  set.clear = reject('clear') as typeof set.clear;
  return set;
}
