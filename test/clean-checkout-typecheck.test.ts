import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

const root = join(import.meta.dir, '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe('clean checkout typecheck contract', () => {
  it('installs Node explicitly before executing Node-shebang build tools in CI', () => {
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toMatch(/uses: actions\/setup-node@/u);
    expect(workflow.indexOf('uses: actions/setup-node@')).toBeLessThan(
      workflow.indexOf('run: bun run typecheck'),
    );
    expect(workflow).toMatch(/node-version: ['"]?22/u);
  });

  it('builds source dependencies before workspace typechecking', () => {
    const command = packageJson.scripts?.typecheck ?? '';
    expect(command.indexOf('tsc --noEmit -p tsconfig.json')).toBeGreaterThanOrEqual(0);
    expect(command.indexOf('tsup --config tsup.config.ts')).toBeGreaterThan(
      command.indexOf('tsc --noEmit -p tsconfig.json'),
    );
    expect(command.indexOf('bun run --filter @forgeax/extension-artifacts build')).toBeGreaterThan(
      command.indexOf('tsup --config tsup.config.ts'),
    );
    expect(command.indexOf('bun run --filter \'*\' typecheck')).toBeGreaterThan(
      command.indexOf('bun run --filter @forgeax/extension-artifacts build'),
    );
  });

  it('declares Bun and Node type contracts explicitly', () => {
    expect(packageJson.devDependencies?.['@types/bun']).toBeTruthy();
    expect(packageJson.devDependencies?.['@types/node']).toBeTruthy();
    const tsconfig = readFileSync(join(root, 'tsconfig.json'), 'utf8');
    expect(tsconfig).toMatch(/"types": \["bun", "node"\]/u);
  });
});
