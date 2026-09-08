/**
 * @forgeax/extension-platform/transport — postMessage RPC bridge for Extension Runtime iframes.
 *
 * Two entry points:
 *   import { createHost, createExtensionPort } from '@forgeax/extension-platform/transport';
 *
 * Both built on the same RpcChannel + Transport abstraction.
 */
export * from './rpc';
export * from './transport';
export { createHost } from './extension-side';
export type { ExtensionHostApi, CreateHostOptions } from './extension-side';
export { installExtensionDiagnosticsBridge } from './extension-diagnostics';
export { createExtensionPort } from './host-side';
export type { ExtensionPort, CreateExtensionPortOptions } from './host-side';
export { createMockTransportPair } from './transport-mock';
export { createWindowTransport } from './transport-window';
export type { WindowTransportOptions } from './transport-window';
