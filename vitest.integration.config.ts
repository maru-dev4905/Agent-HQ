import { defineConfig } from 'vitest/config';
import { workspaceAliases } from './vitest.shared.js';

// Integration tests (G4): real PostgreSQL via test/integration-setup.ts. Requires `pnpm infra:up`.
export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: {
    include: ['packages/*/test/**/*.int.test.ts', 'apps/api/test/**/*.int.test.ts'],
    environment: 'node',
    globalSetup: ['./test/integration-setup.ts'],
    // Test files share one database; run them one at a time.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
