// JSON-codec localStorage wrapper. Consumers pass string keys (they SHOULD
// come from a storage-keys SSOT on their side — this layer is agnostic to
// the naming scheme). No-ops outside a browser context.

export interface StorageApi {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

export function createStorageApi(logger: {
  warn: (msg: string, ...rest: unknown[]) => void;
} = console): StorageApi {
  return {
    get<T>(key: string): T | null {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      try { return JSON.parse(raw) as T; }
      catch (err) { logger.warn(`[storage] "${key}" corrupt JSON, returning null`, err); return null; }
    },
    set<T>(key: string, value: T): void {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key: string): void {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(key);
    },
  };
}
