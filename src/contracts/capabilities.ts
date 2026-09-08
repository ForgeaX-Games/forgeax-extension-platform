export type CapabilityScope = 'read' | 'write' | 'execute';

export interface CapabilityDeclaration {
  id: string;
  scope: CapabilityScope;
  description: string;
}

export function parseCapability(input: unknown): CapabilityDeclaration {
  const value = input as Partial<CapabilityDeclaration> | null;
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.scope !== 'string' || typeof value.description !== 'string') {
    throw new Error('Invalid capability declaration: provide id, scope, and description');
  }
  if (!['read', 'write', 'execute'].includes(value.scope)) {
    throw new Error(`Invalid capability scope: ${value.scope}`);
  }
  return value as CapabilityDeclaration;
}
