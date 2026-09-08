import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const roots = ['src', 'test', 'packages', 'README.md'];
const retiredShellTerm = ['work', 'bench'].join('');
const retired = new RegExp(`${retiredShellTerm}|\\b(?:wb|wm)[-_]`, 'i');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '.md']);

function filesUnder(path: string): string[] {
  const entries = readdirSync(path, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return filesUnder(child);
    return sourceExtensions.has(extname(entry.name)) ? [child] : [];
  });
}

describe('Extension Platform retired vocabulary gate', () => {
  it('keeps maintained contracts, transport, tests, and docs domain-neutral', () => {
    const files = roots.flatMap((root) => (extname(root) ? [root] : filesUnder(root)));
    const violations = files.flatMap((file) => {
      const lines = readFileSync(file, 'utf8').split('\n');
      return lines.flatMap((line, index) =>
        retired.test(line) ? [`${relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`] : [],
      );
    });

    expect(violations).toEqual([]);
  });
});
