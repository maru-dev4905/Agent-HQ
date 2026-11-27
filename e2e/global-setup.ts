import { checkProxyTarget, prepareDatabase } from './harness.js';

/** Playwright global setup: the E2E database exists and is migrated before any test runs. */
export default async function globalSetup(): Promise<void> {
  checkProxyTarget();
  await prepareDatabase();
}
