export type ContributionType = 'command' | 'panel' | 'activity' | 'editor' | 'service';

export interface ContributionDeclaration {
  id: string;
  type: ContributionType;
  title: string;
  activation: 'eager' | 'on-demand';
}

export function parseContribution(input: unknown): ContributionDeclaration {
  const value = input as Partial<ContributionDeclaration> | null;
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.type !== 'string' || typeof value.title !== 'string' || typeof value.activation !== 'string') {
    throw new Error('Invalid contribution declaration: provide id, type, title, and activation');
  }
  if (!['command', 'panel', 'activity', 'editor', 'service'].includes(value.type)) {
    throw new Error(`Invalid contribution type: ${value.type}`);
  }
  if (!['eager', 'on-demand'].includes(value.activation)) {
    throw new Error(`Invalid activation mode: ${value.activation}`);
  }
  return value as ContributionDeclaration;
}
