import { createHash } from 'node:crypto';

export function sha256(bytes: Uint8Array): `sha256-${string}` {
  return `sha256-${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function canonicalJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

export function digestJson(value: unknown): `sha256-${string}` {
  return sha256(canonicalJson(value));
}
