import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as source from '../src/platform';
import * as built from '../dist/platform/index.js';

type Reader = { get<T = unknown>(key: string): T | undefined };
type Evaluate = (expression: string | undefined, reader: Reader, fallback: boolean) => boolean;
type ScanKeys = (expression: string | undefined) => readonly string[];

// Characterization of the existing Interface language, not a new grammar.
const values: Record<string, unknown> = {
  yes: true, no: false, count: 2, text: '2', mode: 'ready', zero: 0,
  nothing: null, empty: '', fraction: 0.5, hex: 16, infinity: Infinity,
  '0x10': 'key lookup', '1e2': 'key lookup', '.5': 'key lookup',
};
const cases: Array<[string | undefined, boolean, boolean]> = [
  [undefined, true, true], [undefined, false, false], ['', true, true], [' \t ', false, false],
  ['yes', false, true], ['no', true, false], ['missing', true, false], ['zero', true, false],
  ['nothing', true, false], ['empty', true, false], ['no || yes && count', false, true],
  ['yes || no && no', false, true], ['!yes', true, false], ['!!yes', false, true],
  ['!!!yes', true, false], ['!count == 2', true, false], ['!missing != false', true, false],
  ['count == 2', false, true], ['text == 2', true, false], ['text == "2"', false, true],
  ['count != "2"', false, true], ['mode == ready', false, true], ['mode == \'ready\'', false, true],
  ['nothing == null', false, true], ['missing == null', true, false], ['count == 0x2', false, true],
  ['count == 2e0', false, true], ['fraction == .5', false, true], ['hex == 0x10', false, true],
  ['infinity == Infinity', false, true], ['0x10', false, true], ['1e2', false, true], ['.5', false, true],
  ['true', false, true], ['false', true, false], ['null', true, false], ['-0.5', false, true],
  ['"false"', false, true], ['""', true, false], ['(yes)', true, false],
  ['"yes||no"', true, false], ['no ||', false, true], ['&&', false, true], ['!', false, true],
];

for (const [name, api] of [['source platform export', source], ['built platform export', built]] as const) {
  describe(name, () => {
    const evaluate = Reflect.get(api, 'evaluateContextExpression') as Evaluate;
    const scan = Reflect.get(api, 'getContextExpressionKeys') as ScanKeys;

    it('exports both pure mechanisms beside the context-key store', () => {
      expect(typeof evaluate).toBe('function');
      expect(typeof scan).toBe('function');
    });

    for (const [expression, fallback, expected] of cases) {
      it(`retains ${JSON.stringify(expression)} with fallback ${fallback}`, () => {
        const reader: Reader = { get: <T>(key: string) => values[key] as T | undefined };
        expect(evaluate(expression, reader, fallback)).toBe(expected);
      });
    }

    it('reads lazily from the caller and preserves short-circuit order', () => {
      const trace: string[] = [];
      const reader: Reader = {
        get: <T>(key: string) => { trace.push(key); return values[key] as T | undefined; },
      };
      expect(evaluate('no && skipped || yes && mode == "ready" || skipped', reader, false)).toBe(true);
      expect(trace).toEqual(['no', 'yes', 'mode']);
      trace.length = 0;
      expect(evaluate('true || skipped', reader, false)).toBe(true);
      expect(trace).toEqual([]);
    });

    it('does not catch, replace or cache reader failures', () => {
      const failure = new Error('caller read failure');
      const reader: Reader = { get: () => { throw failure; } };
      expect(() => evaluate('key', reader, false)).toThrow(failure);
      expect(evaluate('', reader, true)).toBe(true);
    });

    it('strips quotes without interpreting escapes', () => {
      const reader: Reader = { get: <T>() => 'a\\n' as T };
      expect(evaluate('key == "a\\n"', reader, false)).toBe(true);
    });

    it('keeps raw key tokenization rather than parsing expression operands', () => {
      expect(scan(undefined)).toEqual([]);
      expect(scan('')).toEqual([]);
      expect(scan('panel.ready && mode == "ready" || panel.ready || foo:bar-baz'))
        .toEqual(['panel.ready', 'mode', 'ready', 'foo:bar-baz']);
      expect(scan('true false null TRUE 2e3 _key')).toEqual(['TRUE', 'e3', '_key']);
      expect(scan('"literal word" || path.key == \'other\''))
        .toEqual(['literal', 'word', 'path.key', 'other']);
    });
  });
}

it('publishes declarations for the same browser-safe platform subpath', () => {
  const declaration = readFileSync(new URL('../dist/platform/index.d.ts', import.meta.url), 'utf8');
  expect(declaration).toContain('evaluateContextExpression');
  expect(declaration).toContain('getContextExpressionKeys');
});
