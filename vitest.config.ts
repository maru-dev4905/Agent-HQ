import { defineConfig } from 'vitest/config';
import { workspaceAliases } from './vitest.shared.js';

export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/api/src/**/*.test.ts',
      'apps/web/{app,lib}/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
  },
});
