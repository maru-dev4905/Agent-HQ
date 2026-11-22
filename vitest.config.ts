import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspacePackages = ['domain', 'events', 'contracts', 'database', 'simulator'];

export default defineConfig({
  resolve: {
    // Resolve workspace packages from source so tests never run against a stale dist build.
    // Scoped to @agent-hq/* only; third-party resolution is untouched.
    alias: workspacePackages.map((name) => ({
      find: `@agent-hq/${name}`,
      replacement: fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
    })),
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/api/src/**/*.test.ts'],
    environment: 'node',
  },
});
