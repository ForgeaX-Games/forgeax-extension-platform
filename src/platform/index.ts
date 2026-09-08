export {
  ExtensionConflictError,
  ExtensionSetupError,
} from './errors';
export type {
  ExtensionConflictErrorInfo,
  ExtensionConflictErrorInit,
  ExtensionPhase,
  ExtensionSetupErrorInfo,
  ExtensionSetupErrorInit,
} from './errors';

export { Registry } from './registry';

export { CapabilityRegistry, createCapabilityRegistry } from './capabilities';
export type { CapabilityEventName } from './capabilities';

export {
  CapabilityAmbiguousError,
  CapabilityProviderRegistry,
  CapabilityUnavailableError,
  createCapabilityProviderRegistry,
} from './capability-providers';
export type {
  CapabilityErrorCode,
  CapabilityErrorInit,
  CapabilityProvider,
  CapabilityProviderEventName,
  CapabilityProviderHandle,
  CapabilityProviderInfo,
  CapabilityRef,
  CapabilityAmbiguousErrorInit,
} from './capability-providers';

export { createContributionRegistry, createContributionTransaction } from './contribution-registry';
export type {
  ContributionEntry,
  ContributionRegistry,
  ContributionRegistrySnapshot,
  ContributionTransaction,
  ContributionTransactionCommit,
} from './contribution-registry';

export { createCommandsRegistry } from './commands';
export type { CommandDescriptor, CommandsRegistry } from './commands';

export { createContextKeys } from './context-keys';
export type { ContextKeysApi } from './context-keys';

export { createStorageApi } from './storage';
export type { StorageApi } from './storage';

export { installDebugHook, uninstallDebugHook } from './debug';
export type {
  DebugSnapshot,
  ExtensionPlatformDebug,
  InstallDebugHookOptions,
} from './debug';
