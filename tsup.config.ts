import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'base/index': 'src/base/index.ts',
    'platform/index': 'src/platform/index.ts',
    'extensions/index': 'src/extensions/index.ts',
    'runtime/index': 'src/runtime/index.ts',
    'permissions/policy': 'src/permissions/policy.ts',
    'diagnostics/error': 'src/diagnostics/error.ts',
    'contracts/index': 'src/contracts/index.ts',
    'discovery/index': 'src/discovery/index.ts',
    'transport/index': 'src/transport/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  noExternal: [/^@forgeax\//],
});
