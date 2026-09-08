export type ResourceId = string & { readonly __resourceId: unique symbol };

export interface ResourceRecord {
  id: ResourceId;
  contentType: string;
  bytes: Uint8Array;
  revision: string;
}

export interface ResourceStore {
  read(id: ResourceId): Promise<ResourceRecord | null>;
  write(record: ResourceRecord): Promise<void>;
  remove(id: ResourceId): Promise<void>;
}

export interface PreferenceStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
}

export class MemoryResourceStore implements ResourceStore {
  #records = new Map<ResourceId, ResourceRecord>();

  async read(id: ResourceId): Promise<ResourceRecord | null> {
    return this.#records.get(id) ?? null;
  }

  async write(record: ResourceRecord): Promise<void> {
    this.#records.set(record.id, { ...record, bytes: record.bytes.slice() });
  }

  async remove(id: ResourceId): Promise<void> {
    this.#records.delete(id);
  }
}

export class MemoryPreferenceStore implements PreferenceStore {
  #values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.#values.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.#values.set(key, value);
  }

  delete(key: string): void {
    this.#values.delete(key);
  }
}
