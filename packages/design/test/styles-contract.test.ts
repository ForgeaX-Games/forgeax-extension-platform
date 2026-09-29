import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaultDesignTokens, token } from '../src/index';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Design preserves its published root API while exposing owned CSS assets', () => {
  const manifest = JSON.parse(read('package.json'));
  expect(manifest.exports['.']).toEqual({ types: './dist/index.d.ts', import: './dist/index.js' });
  expect(token('gap', '8px', 'spacing')).toEqual({ name: 'gap', value: '8px', category: 'spacing' });
  expect(defaultDesignTokens).toEqual([
    { name: 'surface-muted', value: '#20242a', category: 'color' },
    { name: 'space-2', value: '8px', category: 'spacing' },
    { name: 'text-body', value: '14px/20px', category: 'typography' },
  ]);
  for (const path of ['tokens.css', 'styles/primitive.css', 'styles/semantic.css', 'styles/fx-bridge.css', 'styles/reset.css']) {
    expect(manifest.exports[`./${path}`]).toBe(`./dist/${path}`);
  }
  expect(manifest.sideEffects).toEqual(['**/*.css']);
});

test('token cascade preserves primitives before semantics before bridge', () => {
  const css = read('tokens.css');
  expect([...css.matchAll(/@import\s+'([^']+)'/g)].map(match => match[1])).toEqual([
    './styles/primitive.css', './styles/semantic.css', './styles/fx-bridge.css',
  ]);
});

test('shared reset does not own Interface chrome or product skin', () => {
  const css = read('styles/reset.css');
  expect(css).toContain('box-sizing: border-box');
  expect(css).toContain('font-family: var(--font-sans)');
  expect(css).not.toMatch(/studio-shell|cp-thread|forgeax-ctx-menu|agent-avatar|@tailwind|@layer/);
});

test('the built npm candidate includes every exported CSS file and its relative imports', () => {
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const build = spawnSync(process.execPath, ['run', 'build'], { cwd, encoding: 'utf8', timeout: 30_000 });
  expect({ status: build.status, error: build.error?.message }).toEqual({ status: 0, error: undefined });
  const pack = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd, encoding: 'utf8', timeout: 30_000 });
  expect({ status: pack.status, error: pack.error?.message }).toEqual({ status: 0, error: undefined });
  const files = new Set(JSON.parse(pack.stdout)[0].files.map((file: { path: string }) => file.path));
  const manifest = JSON.parse(read('package.json'));
  for (const [path, target] of Object.entries(manifest.exports)) {
    if (!path.endsWith('.css')) continue;
    expect(files.has((target as string).replace(/^\.\//, ''))).toBe(true);
  }
  expect(files.has('dist/LICENSE')).toBe(true);
  expect(read('dist/tokens.css')).toBe(read('tokens.css'));
  for (const name of ['primitive', 'semantic', 'fx-bridge', 'reset']) {
    expect(read(`dist/styles/${name}.css`)).toBe(read(`styles/${name}.css`));
  }
}, 65_000);
