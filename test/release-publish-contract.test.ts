import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const root = resolve(import.meta.dir, '..');
const workflow = readFileSync(join(root, '.github/workflows/publish.yml'), 'utf8');
const capture = readFileSync(join(root, 'scripts/release-capture.ts'), 'utf8');

describe('Platform publish contract', () => {
  test('pre-publish gates do not require post-publish registry evidence', () => {
    const prePublishWorkflow = workflow.split('  capture-registry-evidence:')[0];
    expect(workflow).not.toContain('package-directory: packages/discovery');
    expect(workflow).not.toContain('package-directory: packages/transport');
    expect(workflow.match(/ForgeaX-Games\/forgeax-ci\/\.github\/workflows\/npm-publish\.yml@v2/g)?.length).toBe(1);
    expect(workflow).not.toContain('ForgeaX-Games/forgeax-ci/.github/workflows/npm-publish.yml@v1');
    expect(workflow).toContain('bun run release:preflight');
    expect(prePublishWorkflow).not.toContain('bun run release:verify');
    expect(workflow).toContain('needs: [publish-platform]');
    expect(workflow).toContain('run: bun run release:capture');
    expect(workflow).toContain('run: bun run release:verify');
  });

  test('preflight does not depend on developer-only search binaries', () => {
    const preflight = readFileSync(new URL('../scripts/release-preflight.ts', import.meta.url), 'utf8');
    expect(preflight).not.toContain("Bun.spawnSync(['rg'");
  });

  test('capture records registry bytes and fails without workflow provenance', () => {
    expect(capture).toContain('GITHUB_SHA');
    expect(capture).toContain('GITHUB_REPOSITORY');
    expect(capture).toContain("createHash('sha256')");
    expect(capture).toContain("resolvedFrom: 'registry'");
    expect(capture).toContain('immutable: true');
    expect(capture).toContain('release.capture-context-missing');
    expect(capture).toContain('release.registry-capture-failed');
  });

  test('capture and verify fail closed when immutable evidence is unavailable', () => {
    const captureResult = Bun.spawnSync(['bun', 'scripts/release-capture.ts'], {
      cwd: root,
      env: { ...process.env, GITHUB_SHA: '', GITHUB_REPOSITORY: '' },
    });
    const captureOutput = new TextDecoder().decode(captureResult.stderr);
    expect(captureResult.exitCode).toBe(1);
    expect(captureOutput).toContain('release.capture-context-missing');

    const verifyResult = Bun.spawnSync(['bun', 'scripts/release-verify.ts'], { cwd: root });
    const verifyOutput = new TextDecoder().decode(verifyResult.stderr);
    expect(verifyResult.exitCode).toBe(1);
    expect(verifyOutput).toContain('release.registry-evidence-missing');
  });
});
