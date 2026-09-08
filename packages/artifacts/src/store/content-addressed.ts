import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ArtifactError } from '../archive/error';
import { sha256 } from '../integrity/digest';

export class ContentAddressedStore {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private artifactPath(digest: string): string { return join(this.root, 'artifacts', digest, 'artifact.fxe'); }
  private pointerPath(): string { return join(this.root, 'last-known-good'); }

  async install(bytes: Uint8Array, expectedDigest: string): Promise<string> {
    const actual = sha256(bytes);
    if (actual !== expectedDigest) throw new ArtifactError({ code: 'FXE_DIGEST_MISMATCH', phase: 'store', message: 'Verified bytes do not match the Store digest', hint: 'Pass the exact bytes selected by the artifact lock.', expected: expectedDigest, actual });
    const destination = this.artifactPath(expectedDigest); const temporaryDirectory = join(this.root, 'artifacts', '.tmp'); const temporaryPath = join(temporaryDirectory, `${randomUUID()}.fxe`);
    await mkdir(temporaryDirectory, { recursive: true }); await mkdir(join(this.root, 'artifacts', expectedDigest), { recursive: true });
    try {
      await writeFile(temporaryPath, bytes);
      try { await rename(temporaryPath, destination); } catch (error) {
        const existing = await readFile(destination).catch(() => undefined);
        if (!existing || sha256(existing) !== expectedDigest) throw new ArtifactError({ code: 'FXE_STORE_CORRUPT', phase: 'store', message: 'Store destination exists with a different digest', hint: 'Remove the corrupt cache entry and restore the last-known-good artifact.' });
      }
    } finally { await rm(temporaryPath, { force: true }); }
    return destination;
  }

  async read(digest: string): Promise<Uint8Array> {
    const bytes = new Uint8Array(await readFile(this.artifactPath(digest)).catch(() => { throw new ArtifactError({ code: 'FXE_STORE_MISSING', phase: 'store', message: `Artifact is not installed: ${digest}`, hint: 'Acquire and install the locked artifact before activation.', retryable: true }); }));
    const actual = sha256(bytes);
    if (actual !== digest) throw new ArtifactError({ code: 'FXE_STORE_CORRUPT', phase: 'store', message: 'Installed artifact failed content-address verification', hint: 'Restore the last-known-good artifact and retry activation.', expected: digest, actual });
    return bytes;
  }

  async markLastKnownGood(digest: string): Promise<void> {
    await this.read(digest); const pointer = this.pointerPath(); const temporary = `${pointer}.${randomUUID()}.tmp`; await mkdir(this.root, { recursive: true }); await writeFile(temporary, `${digest}\n`, 'utf8'); await rename(temporary, pointer);
  }

  async readLastKnownGood(): Promise<Uint8Array> {
    const digest = (await readFile(this.pointerPath(), 'utf8').catch(() => { throw new ArtifactError({ code: 'FXE_STORE_NO_RECOVERY', phase: 'store', message: 'No last-known-good artifact is recorded', hint: 'Install and verify a valid artifact before enabling recovery.' }); })).trim();
    return this.read(digest);
  }
}
