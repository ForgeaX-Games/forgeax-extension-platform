import { ExtensionConflictError } from './errors';

/**
 * Generic id-keyed, owner-bound registry. Sub-registries in the consuming
 * shells are all instances of this single class — no inheritance, no
 * per-domain subclasses. Owner is always tracked so cleanup-by-owner works
 * without extensions having to remember what they registered.
 */
export class Registry<K extends string, V extends { id: K }> {
  readonly name: string;
  /** Insertion-ordered map of id → { entry, owner }. */
  private readonly entries = new Map<K, { entry: V; owner: string }>();

  constructor(name: string) {
    this.name = name;
  }

  register(entry: V, owner: string): void {
    if (typeof owner !== 'string' || owner.length === 0) {
      throw new TypeError(
        `[extension-platform] Registry("${this.name}").register: owner must be a non-empty string`,
      );
    }
    const existing = this.entries.get(entry.id);
    if (existing) {
      throw new ExtensionConflictError({
        id: entry.id,
        subRegistryName: this.name,
        existingOwner: existing.owner,
        newOwner: owner,
      });
    }
    this.entries.set(entry.id, { entry, owner });
  }

  unregister(id: K, owner: string): void {
    const existing = this.entries.get(id);
    if (!existing) return;
    if (existing.owner !== owner) {
      throw new ExtensionConflictError({
        id,
        subRegistryName: this.name,
        existingOwner: existing.owner,
        newOwner: owner,
      });
    }
    this.entries.delete(id);
  }

  unregisterByOwner(owner: string): K[] {
    const removed: K[] = [];
    for (const [id, { owner: o }] of this.entries) {
      if (o === owner) removed.push(id);
    }
    for (const id of removed) this.entries.delete(id);
    return removed;
  }

  get(id: K): V | undefined {
    return this.entries.get(id)?.entry;
  }

  list(filter?: (entry: V) => boolean): V[] {
    const out: V[] = [];
    for (const { entry } of this.entries.values()) {
      if (!filter || filter(entry)) out.push(entry);
    }
    return out;
  }

  count(): number {
    return this.entries.size;
  }

  snapshot(): Array<{ id: K; owner: string }> {
    return Array.from(this.entries.entries(), ([id, { owner }]) => ({
      id,
      owner,
    }));
  }
}
