export interface ExtensionLockEntry {
  id: string;
  version: string;
  digest: `sha256-${string}`;
  source: 'builtin' | 'user' | 'project';
  required: boolean;
}

export interface ServiceLockEntry {
  id: string;
  version: string;
  command: string;
  required: boolean;
}

export interface ProductLock {
  schemaVersion: 1;
  productId: string;
  productVersion: string;
  extensions: readonly ExtensionLockEntry[];
  services: readonly ServiceLockEntry[];
}

export function parseProductLock(input: unknown): ProductLock {
  const value = input as Partial<ProductLock> | null;
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1 || typeof value.productId !== 'string' || typeof value.productVersion !== 'string' || !Array.isArray(value.extensions) || !Array.isArray(value.services)) {
    throw new Error('Invalid product lock: provide schemaVersion, product identity, extensions, and services');
  }
  return value as ProductLock;
}
