#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { packExtensionDirectory } from '../src/pack';

const args = new Map<string, string>();
for (let index = 0; index < Bun.argv.length; index += 1) if (Bun.argv[index]?.startsWith('--')) args.set(Bun.argv[index].slice(2), Bun.argv[index + 1] ?? '');
const input = resolve(args.get('input') ?? '.'); const output = resolve(args.get('output') ?? 'extension.fxe');
const required = (name: string) => { const value = args.get(name); if (!value) throw new Error(`--${name} is required`); return value; };
const artifact = packExtensionDirectory(input, { issuer: required('issuer'), subject: required('subject'), keyId: required('key-id'), signature: required('signature') });
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, artifact.bytes);
console.log(JSON.stringify({ output, sha256: artifact.sha256, manifestDigest: artifact.manifestDigest }));
