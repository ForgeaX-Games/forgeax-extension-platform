/**
 * @forgeax/extension-platform — generic, business-free primitives
 * shared by ForgeaX product shells and standalone extension hosts.
 * No React, no DOM (storage no-ops outside a browser), no business
 * semantics.
 *
 * Layered like VS Code: base (events/lifecycle) → platform (registries,
 * commands, context-keys, storage, debug) → extensions (manifest, loader).
 * Subpath exports mirror the layers; this root entry is the union.
 */

export * from './base/index';
export * from './platform/index';
export * from './extensions/index';
export * from './runtime/index';
export * from './permissions/policy';
export * from './diagnostics/error';
export * as contracts from './contracts/index';
// Keep the two public capability groups under the same root package version.
// Subpath consumers use ./discovery and ./transport; namespace exports make
// root-package consumers able to inspect the same release without a second
// package identity.
export * as discovery from './discovery/index';
export * as transport from './transport/index';
export {
  ContractValidationError,
  artifactLockSchema,
  extensionManifestV2Schema,
  parseArtifactLock,
  parseCapability,
  parseContribution,
  parseExtensionManifest,
  parseExtensionManifestV2,
  parseProductLock,
  parseProductRuntimeReport,
  parseServiceHealth,
  productRuntimeReportV1Schema,
  serviceHealthV1Schema,
} from './contracts/index';
export type {
  ApiCompatibility,
  ArtifactLock,
  ArtifactSource,
  ArtifactSourceKind,
  CapabilityDeclaration,
  CapabilityScope,
  ContractIssue,
  ContributionDeclaration,
  ContributionType,
  ExtensionCategory,
  ExtensionEntrypointKind,
  ExtensionEntrypoints,
  ExtensionFamily,
  ExtensionLockEntry,
  ExtensionManifest as ContractExtensionManifest,
  ExtensionManifestV2,
  ProductLock,
  ProductRuntimeReportV1,
  RuntimeComponentReport,
  RuntimeDiagnostic,
  RuntimePhase,
  RuntimeStatus,
  ServiceHealthV1,
  ServiceLockEntry,
  SignerPolicy,
} from './contracts/index';
