import { EventBus } from '../base/bus';
import { ExtensionConflictError } from './errors';

/** A versioned capability contract shared by all host and extension layers. */
export interface CapabilityRef {
  readonly id: string;
  readonly version: number;
}

/**
 * A provider implementation contributed by an extension.
 *
 * Input/output stay generic at the contribution boundary so each capability
 * can publish its own strongly typed adapter without making the platform
 * package depend on product-specific schemas.
 */
export interface CapabilityProvider<Context = unknown, Input = unknown, Output = unknown> {
  readonly ref: CapabilityRef;
  readonly providerId: string;
  readonly invoke: (input: Input, context: Context) => Output | PromiseLike<Output>;
}

/** Metadata exposed for discovery, diagnostics, and host selection UI. */
export interface CapabilityProviderInfo {
  readonly ref: CapabilityRef;
  readonly providerId: string;
  readonly owner: string;
}

/** A resolved provider handle used by hosts that need to inspect before invoke. */
export interface CapabilityProviderHandle<Context = unknown> extends CapabilityProviderInfo {
  readonly invoke: (input: unknown, context: Context) => unknown | PromiseLike<unknown>;
}

export type CapabilityProviderEventName = 'added' | 'removed';

interface CapabilityProviderEvents {
  added: CapabilityProviderInfo;
  removed: CapabilityProviderInfo;
  [topic: string]: CapabilityProviderInfo;
}

export type CapabilityErrorCode = 'CAPABILITY_UNAVAILABLE' | 'CAPABILITY_AMBIGUOUS';

export interface CapabilityErrorInit {
  readonly capability: CapabilityRef;
  readonly providerId?: string;
}

/** Thrown when no provider matches a capability/version (or provider id). */
export class CapabilityUnavailableError extends Error {
  readonly code = 'CAPABILITY_UNAVAILABLE' as const;
  readonly capability: CapabilityRef;
  readonly providerId: string | undefined;

  constructor(init: CapabilityErrorInit) {
    const suffix = init.providerId ? ` provider "${init.providerId}"` : ' provider';
    super(
      `[extension-platform] capability "${init.capability.id}@${init.capability.version}" has no${suffix}`,
    );
    this.name = 'CapabilityUnavailableError';
    this.capability = init.capability;
    this.providerId = init.providerId;
  }
}

export interface CapabilityAmbiguousErrorInit {
  readonly capability: CapabilityRef;
  readonly candidates: readonly string[];
}

/** Thrown when a host omits provider selection but several are available. */
export class CapabilityAmbiguousError extends Error {
  readonly code = 'CAPABILITY_AMBIGUOUS' as const;
  readonly capability: CapabilityRef;
  readonly candidates: readonly string[];

  constructor(init: CapabilityAmbiguousErrorInit) {
    super(
      `[extension-platform] capability "${init.capability.id}@${init.capability.version}" has multiple providers; select one of: ${init.candidates.join(', ')}`,
    );
    this.name = 'CapabilityAmbiguousError';
    this.capability = init.capability;
    this.candidates = init.candidates;
  }
}

interface StoredProvider<Context> {
  readonly info: CapabilityProviderInfo;
  readonly handle: CapabilityProviderHandle<Context>;
  readonly token: object;
}

/**
 * Single source of truth for executable capability providers.
 *
 * It intentionally sits beside (rather than replacing) CapabilityRegistry:
 * the existing registry remains a lightweight membership set for manifest
 * dependency loading, while this registry owns versioned implementations and
 * invocation. This additive split keeps all existing Arrival/ForgeaX loader
 * consumers backwards compatible.
 */
export class CapabilityProviderRegistry<Context = unknown> {
  private readonly entries = new Map<string, StoredProvider<Context>>();
  private readonly bus = new EventBus<CapabilityProviderEvents>();

  register<Input, Output>(
    provider: CapabilityProvider<Context, Input, Output>,
    owner: string,
  ): () => void {
    assertOwner(owner);
    const ref = normalizeRef(provider.ref);
    assertNonEmpty(provider.providerId, 'providerId');
    if (typeof provider.invoke !== 'function') {
      throw new TypeError('[extension-platform] capability provider invoke must be a function');
    }

    const key = providerKey(ref, provider.providerId);
    const existing = this.entries.get(key);
    if (existing) {
      throw new ExtensionConflictError({
        id: providerIdentity(ref, provider.providerId),
        subRegistryName: 'capability-providers',
        existingOwner: existing.info.owner,
        newOwner: owner,
      });
    }

    const info = freezeInfo({
      ref,
      providerId: provider.providerId,
      owner,
    });
    const token = {};
    const handle: CapabilityProviderHandle<Context> = Object.freeze({
      ...info,
      invoke: (input: unknown, context: Context) =>
        provider.invoke(input as Input, context) as unknown | PromiseLike<unknown>,
    });
    this.entries.set(key, { info, handle, token });
    this.bus.emit('added', info);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.entries.get(key);
      // An explicit unregister or a later replacement must not be removed by
      // an old extension cleanup callback.
      if (current?.token !== token) return;
      this.entries.delete(key);
      this.bus.emit('removed', info);
    };
  }

  unregister(ref: CapabilityRef, providerId: string, owner: string): void {
    assertOwner(owner);
    const normalizedRef = normalizeRef(ref);
    assertNonEmpty(providerId, 'providerId');
    const key = providerKey(normalizedRef, providerId);
    const existing = this.entries.get(key);
    if (!existing) return;
    if (existing.info.owner !== owner) {
      throw new ExtensionConflictError({
        id: providerIdentity(normalizedRef, providerId),
        subRegistryName: 'capability-providers',
        existingOwner: existing.info.owner,
        newOwner: owner,
      });
    }
    this.entries.delete(key);
    this.bus.emit('removed', existing.info);
  }

  /** Resolves a provider, requiring an explicit id when more than one exists. */
  resolve(ref: CapabilityRef, providerId?: string): CapabilityProviderHandle<Context> {
    const normalizedRef = normalizeRef(ref);
    if (providerId !== undefined) {
      assertNonEmpty(providerId, 'providerId');
      const selected = this.entries.get(providerKey(normalizedRef, providerId));
      if (!selected) throw new CapabilityUnavailableError({ capability: normalizedRef, providerId });
      return selected.handle;
    }

    const matches = this.list(normalizedRef);
    if (matches.length === 0) {
      throw new CapabilityUnavailableError({ capability: normalizedRef });
    }
    if (matches.length > 1) {
      throw new CapabilityAmbiguousError({
        capability: normalizedRef,
        candidates: matches.map((entry) => entry.providerId),
      });
    }
    return this.entries.get(providerKey(normalizedRef, matches[0]!.providerId))!.handle;
  }

  async invoke<Input, Output>(
    ref: CapabilityRef,
    input: Input,
    context: Context,
    providerId?: string,
  ): Promise<Output> {
    const provider = this.resolve(ref, providerId);
    return (await provider.invoke(input, context)) as Output;
  }

  list(ref?: CapabilityRef): readonly CapabilityProviderInfo[] {
    const normalizedRef = ref === undefined ? undefined : normalizeRef(ref);
    const result: CapabilityProviderInfo[] = [];
    for (const entry of this.entries.values()) {
      if (
        normalizedRef !== undefined &&
        (entry.info.ref.id !== normalizedRef.id || entry.info.ref.version !== normalizedRef.version)
      ) {
        continue;
      }
      result.push(entry.info);
    }
    return result;
  }

  count(ref?: CapabilityRef): number {
    return this.list(ref).length;
  }

  on(event: CapabilityProviderEventName, listener: (info: CapabilityProviderInfo) => void): () => void {
    return this.bus.on(event, listener);
  }
}

export function createCapabilityProviderRegistry<Context = unknown>(): CapabilityProviderRegistry<Context> {
  return new CapabilityProviderRegistry<Context>();
}

function normalizeRef(ref: CapabilityRef): CapabilityRef {
  if (!ref || typeof ref !== 'object') {
    throw new TypeError('[extension-platform] capability ref must be an object');
  }
  assertNonEmpty(ref.id, 'capability id');
  if (!Number.isSafeInteger(ref.version) || ref.version < 1) {
    throw new TypeError('[extension-platform] capability version must be a positive integer');
  }
  return Object.freeze({ id: ref.id, version: ref.version });
}

function assertOwner(owner: string): void {
  assertNonEmpty(owner, 'owner');
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`[extension-platform] ${field} must be a non-empty string`);
  }
}

function providerKey(ref: CapabilityRef, providerId: string): string {
  return JSON.stringify([ref.id, ref.version, providerId]);
}

function providerIdentity(ref: CapabilityRef, providerId: string): string {
  return `${ref.id}@${ref.version}#${providerId}`;
}

function freezeInfo(info: CapabilityProviderInfo): CapabilityProviderInfo {
  return Object.freeze({
    ref: Object.freeze({ ...info.ref }),
    providerId: info.providerId,
    owner: info.owner,
  });
}
