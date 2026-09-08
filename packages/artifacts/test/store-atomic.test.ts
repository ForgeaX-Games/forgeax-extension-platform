import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentAddressedStore } from '../src/store/content-addressed';
import { sha256 } from '../src/integrity/digest';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('content-addressed FXE Store', () => {
  it('installs concurrently by digest and preserves last-known-good', async () => {
    const root = mkdtempSync(join(tmpdir(), 'forgeax-fxe-')); roots.push(root);
    const store = new ContentAddressedStore(root);
    const bytes = new TextEncoder().encode('verified fxe bytes');
    const digest = sha256(bytes);
    await Promise.all([store.install(bytes, digest), store.install(bytes, digest), store.install(bytes, digest)]);
    await store.markLastKnownGood(digest);
    expect(new TextDecoder().decode(await store.read(digest))).toBe('verified fxe bytes');
    expect(new TextDecoder().decode(await store.readLastKnownGood())).toBe('verified fxe bytes');
    expect(readFileSync(join(root, 'artifacts', digest, 'artifact.fxe'))).toEqual(Buffer.from(bytes));
  });

  it('does not leave partial files or replace last-known-good on a failed install', async () => {
    const root = mkdtempSync(join(tmpdir(), 'forgeax-fxe-')); roots.push(root);
    const store = new ContentAddressedStore(root);
    const good = new TextEncoder().encode('good');
    const goodDigest = sha256(good);
    await store.install(good, goodDigest); await store.markLastKnownGood(goodDigest);
    const bad = new TextEncoder().encode('bad');
    await expect(store.install(bad, goodDigest)).rejects.toMatchObject({ code: 'FXE_DIGEST_MISMATCH', phase: 'store' });
    expect(new TextDecoder().decode(await store.readLastKnownGood())).toBe('good');
    expect(() => readFileSync(join(root, 'artifacts', '.tmp', 'artifact.fxe'))).toThrow();
  });
});
