/**
 * Synchronous, typed pub/sub with a middleware chain. The bus has no
 * business semantics; each product shell (chat / IDE / studio)
 * instantiates it with its own EventMap.
 *
 * Merged superset of the two upstream foundations (2026-07-20, ADR 0026):
 * arrival's plugin-foundation/bus.ts body + forgeax's middleware
 * error-tolerance in runChain (a throwing middleware is reported to
 * onListenerError and the chain auto-advances unless it already advanced).
 */

// `any` (not `unknown`) is intentional here — it's a CONSTRAINT, never a
// runtime payload type. Using `unknown` would force every consumer to add
// `[topic: string]: unknown` to their EventMap, breaking exhaustive
// `keyof E` typing. Within `EventBus<E>` the body always narrows through
// `E[K]` so the consumer never observes `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventMap = Record<string, any>;

export interface BusEvent<E extends EventMap, K extends keyof E = keyof E> {
  readonly topic: K;
  readonly payload: E[K];
}

export type Listener<P> = (payload: P) => void;

export type Middleware<E extends EventMap> = (
  event: BusEvent<E>,
  next: (event: BusEvent<E>) => void,
) => void;

export type ListenerErrorHandler<E extends EventMap> = (
  error: unknown,
  topic: keyof E,
  payload: unknown,
) => void;

export interface EventBusOptions<E extends EventMap> {
  /** Called when a listener throws; defaults to console.error. */
  readonly onListenerError?: ListenerErrorHandler<E>;
}

export class EventBus<E extends EventMap> {
  private readonly listeners = new Map<keyof E, Set<Listener<unknown>>>();
  private readonly middlewares: Middleware<E>[] = [];
  private readonly onListenerError: ListenerErrorHandler<E>;
  private destroyed = false;

  constructor(opts: EventBusOptions<E> = {}) {
    this.onListenerError =
      opts.onListenerError ??
      ((err, topic, payload) =>
        console.error(
          `[extension-platform] EventBus listener for "${String(topic)}" threw`,
          err,
          { payload },
        ));
  }

  on<K extends keyof E>(topic: K, listener: Listener<E[K]>): () => void {
    this.assertAlive('on');
    let set = this.listeners.get(topic);
    if (!set) {
      set = new Set();
      this.listeners.set(topic, set);
    }
    set.add(listener as Listener<unknown>);
    return () => this.off(topic, listener);
  }

  off<K extends keyof E>(topic: K, listener: Listener<E[K]>): void {
    const set = this.listeners.get(topic);
    if (!set) return;
    set.delete(listener as Listener<unknown>);
    if (set.size === 0) this.listeners.delete(topic);
  }

  emit<K extends keyof E>(topic: K, payload: E[K]): void {
    if (this.destroyed) return;
    const event: BusEvent<E, K> = { topic, payload };
    this.runChain(0, event as BusEvent<E>);
  }

  use(middleware: Middleware<E>): () => void {
    this.assertAlive('use');
    this.middlewares.push(middleware);
    return () => {
      const i = this.middlewares.indexOf(middleware);
      if (i >= 0) this.middlewares.splice(i, 1);
    };
  }

  listenerCount(topic?: keyof E): number {
    if (topic !== undefined) return this.listeners.get(topic)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  destroy(): void {
    this.listeners.clear();
    this.middlewares.length = 0;
    this.destroyed = true;
  }

  // --- internals -----------------------------------------------------------

  private runChain(index: number, event: BusEvent<E>): void {
    if (index < this.middlewares.length) {
      const mw = this.middlewares[index]!;
      let nextCalled = false;
      try {
        mw(event, (next) => {
          nextCalled = true;
          this.runChain(index + 1, next);
        });
      } catch (err) {
        try {
          this.onListenerError(err, event.topic, event.payload);
        } catch {
          // Don't allow error-handler failures to break the chain.
        }
        // A middleware that threw BEFORE advancing must not silently drop
        // the event; one that threw AFTER next() must not re-run downstream.
        if (!nextCalled) this.runChain(index + 1, event);
      }
      return;
    }
    this.dispatch(event);
  }

  private dispatch(event: BusEvent<E>): void {
    const set = this.listeners.get(event.topic);
    if (!set) return;
    // Snapshot to tolerate listeners that unsubscribe during iteration.
    const snapshot = Array.from(set);
    for (const listener of snapshot) {
      try {
        listener(event.payload);
      } catch (err) {
        try {
          this.onListenerError(err, event.topic, event.payload);
        } catch {
          // Don't allow error-handler failures to break sibling listeners.
        }
      }
    }
  }

  private assertAlive(method: 'on' | 'use'): void {
    if (this.destroyed) {
      throw new Error(
        `[extension-platform] EventBus.${method}() called on a destroyed bus`,
      );
    }
  }
}
