import { describe, expect, it } from 'bun:test';

type DesignToken = { name: string; value: string; category: 'color' | 'spacing' | 'typography' };

function validateDesignToken(token: DesignToken): string[] {
  const errors: string[] = [];
  if (!token.name || !token.value) errors.push('design token identity and value are required');
  if (!['color', 'spacing', 'typography'].includes(token.category)) errors.push('design token category is invalid');
  if (/agent|engine|editor/i.test(token.name)) errors.push('design primitives cannot own a domain concept');
  return errors;
}

describe('design contract', () => {
  it('accepts reusable visual primitives', () => {
    expect(validateDesignToken({ name: 'surface-muted', value: '#20242a', category: 'color' })).toEqual([]);
    expect(validateDesignToken({ name: 'space-2', value: '8px', category: 'spacing' })).toEqual([]);
  });

  it('rejects business concepts', () => {
    expect(validateDesignToken({ name: 'editor-toolbar', value: '1', category: 'spacing' }).join(' ')).toContain('domain concept');
  });
});
