export type DesignTokenCategory = 'color' | 'spacing' | 'typography';

export interface DesignToken {
  name: string;
  value: string;
  category: DesignTokenCategory;
}

export const defaultDesignTokens: readonly DesignToken[] = [
  { name: 'surface-muted', value: '#20242a', category: 'color' },
  { name: 'space-2', value: '8px', category: 'spacing' },
  { name: 'text-body', value: '14px/20px', category: 'typography' },
];

export function token(name: string, value: string, category: DesignTokenCategory): DesignToken {
  return { name, value, category };
}
