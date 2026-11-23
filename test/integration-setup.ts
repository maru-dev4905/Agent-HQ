import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Vitest global setup for integration tests (G4). Creates an isolated test database next
 * to the dev database and applies all migrations. Requires `pnpm infra:up`.
 */
export const TEST_DATABASE = 'agent_hq_test';

function adminUrl(): string {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch {
    // No .env: rely on the environment.
  }
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and run `pnpm infra:up`.');
  }
  return url;
}

export function testDatabaseUrl(): string {
  const url = new URL(adminUrl());
  url.pathname = `/${TEST_DATABASE}`;
  return url.toString();
}

export default async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl(), connectionTimeoutMillis: 3000 });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error('Cannot reach PostgreSQL. Run `pnpm infra:up` first.', { cause: error });
  }
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DATABASE]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
  await admin.end();

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../packages/database', import.meta.url)),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  });
  process.env['TEST_DATABASE_URL'] = testDatabaseUrl();
}
