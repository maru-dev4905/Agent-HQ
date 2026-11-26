import { defineConfig } from 'vitest/config';
import { workspaceAliases } from './vitest.shared.js';

// Load measurement (HQ-112, RES-005): not part of any Gate. Uses the integration test database
// (test/integration-setup.ts) and an in-process API. Run with `pnpm measure:load`.
export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: {
    include: ['apps/api/test/load/**/*.load.ts'],
    environment: 'node',
    globalSetup: ['./test/integration-setup.ts'],
    fileParallelism: false,
    testTimeout: 30 * 60_000,
    hookTimeout: 120_000,
  },
});
