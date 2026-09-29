import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function assertDesignRelease({ eventName, ref, sha, expectedSha, version, expectedVersion }) {
  if (eventName !== 'workflow_dispatch' || ref !== 'refs/heads/main') throw new Error('Design release requires explicit main dispatch');
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || sha !== expectedSha) throw new Error('Design release SHA does not match approved input');
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || version !== expectedVersion) throw new Error('Design release version does not match approved input');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assertDesignRelease({ eventName: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA, expectedSha: event.inputs?.['expected-sha'],
    version: manifest.version, expectedVersion: event.inputs?.['expected-version'] });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== process.env.GITHUB_SHA) throw new Error('Design checkout is not the approved commit');
  execFileSync('git', ['merge-base', '--is-ancestor', head, 'origin/main']);
  if (manifest.name !== '@forgeax/design' || manifest.private !== false) throw new Error('Design package identity is invalid');
  console.log(`Verified Design ${manifest.version} at ${head}`);
}
