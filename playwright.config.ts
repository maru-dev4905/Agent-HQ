import { defineConfig, devices } from '@playwright/test';
import { WEB_PORT } from './e2e/harness.js';

/**
 * E2E tests (G5, HQ-111). Run with `pnpm test:e2e`, which starts the Compose services and
 * builds first. Each test starts its own API process; the dashboard is served once here.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // The tests share one API port and one database: one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm --filter @agent-hq/web start --port ${WEB_PORT}`,
    url: `http://127.0.0.1:${WEB_PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
