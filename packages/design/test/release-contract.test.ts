import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { assertDesignRelease } from '../scripts/verify-release.mjs';

test('Design has an independent publishable package and source identity', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  expect(manifest.private).toBe(false);
  expect(manifest.version).toBe('0.2.0');
  expect(manifest.publishConfig).toEqual({ access: 'public' });
  expect(manifest.repository.directory).toBe('packages/design');
});

test('publication fails closed on a changed head, version, event, or branch', () => {
  const valid = { eventName: 'workflow_dispatch', ref: 'refs/heads/main', sha: 'a'.repeat(40),
    expectedSha: 'a'.repeat(40), version: '0.2.0', expectedVersion: '0.2.0' };
  expect(() => assertDesignRelease(valid)).not.toThrow();
  for (const changed of [{ eventName: 'push' }, { ref: 'refs/heads/work' }, { sha: 'b'.repeat(40) },
    { expectedSha: undefined }, { expectedVersion: '0.1.0' }, { version: 'workspace:*' }]) {
    expect(() => assertDesignRelease({ ...valid, ...changed })).toThrow();
  }
});

test('Design publication selects only its package and is explicit main dispatch', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/publish-design.yml', import.meta.url), 'utf8');
  expect(workflow).toContain('workflow_dispatch:');
  expect(workflow).not.toContain('tags:');
  expect(workflow).toContain('package-directory: packages/design');
  expect(workflow).toContain('node packages/design/scripts/verify-release.mjs');
  expect(workflow).toContain('default: true');
  expect(workflow).toContain('expected-sha:');
});
