/**
 * Abstract transport — anything that can post and receive ExtensionTransportEnvelope objects.
 *
 * Real-world impl in `transport-window.ts` wraps window.postMessage; the
 * `transport-mock.ts` impl wires two ports together for tests; future SharedWorker
 * or BroadcastChannel impls can plug in the same shape.
 */
import type { ExtensionTransportEnvelope } from '@forgeax/types';

export interface Transport {
  /** Send one envelope. May throw synchronously if the underlying channel is dead. */
  post(env: ExtensionTransportEnvelope): void;
  /** Subscribe to inbound envelopes. Returns an unsubscribe fn. */
  onMessage(handler: (env: ExtensionTransportEnvelope) => void): () => void;
  /** Free resources. After close(), post()/onMessage() are no-ops. */
  close(): void;
}
