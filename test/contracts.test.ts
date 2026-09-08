import { describe, expect, it } from 'bun:test';
import { ContractValidationError, parseCapability, parseContribution, parseExtensionManifest, parseProductLock } from '../src/contracts/index';

describe('Extension contracts', () => {
  it('parses a family-neutral manifest without a retired product category', () => {
    expect(parseExtensionManifest({
      schemaVersion: 1,
      id: 'forgeax.editor.baseline',
      version: '1.0.0',
      displayName: 'Editor baseline',
      family: 'editor',
      entrypoint: './dist/index.js',
    }).family).toBe('editor');
  });

  it('reports structured manifest failures with a recovery hint', () => {
    try {
      parseExtensionManifest({ schemaVersion: 2, family: 'unknown' });
      throw new Error('expected manifest validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      const issues = (error as ContractValidationError).issues;
      expect(issues.some((issue) => issue.code === 'manifest.schema-version')).toBe(true);
      expect(issues.every((issue) => issue.hint.length > 0)).toBe(true);
    }
  });

  it('parses capability, contribution, and product lock DTOs', () => {
    expect(parseCapability({ id: 'project.read', scope: 'read', description: 'Read project files' }).scope).toBe('read');
    expect(parseContribution({ id: 'editor.open', type: 'editor', title: 'Open editor', activation: 'on-demand' }).type).toBe('editor');
    expect(parseProductLock({ schemaVersion: 1, productId: 'forgeax-ide', productVersion: '1.0.0', extensions: [], services: [] }).productId).toBe('forgeax-ide');
  });
});
