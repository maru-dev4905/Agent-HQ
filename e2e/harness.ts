import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
// Source import: the root workspace has no dependency on the contracts package.
import {
  registerConnectionResponseSchema,
  type RegisterConnectionResponse,
} from '../packages/contracts/src/index.js';

/**
 * E2E harness (HQ-111): a dedicated database, a fresh API process per test and the real
 * simulator CLI. Everything talks over HTTP, exactly as a user's setup would.
 */
const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const E2E_DATABASE = 'agent_hq_e2e';
/** The dashboard's proxy target is fixed at build time (next.config.ts), so the API keeps its default port. */
export const API_PORT = 4000;
export const WEB_PORT = 3100;
const API_URL = `http://127.0.0.1:${API_PORT}`;

/**
 * `pnpm build` bakes the dashboard's proxy target in (next.config.ts keeps an empty value and
 * appends paths to it), so anything but unset or exactly the E2E API breaks every test.
 */
export function checkProxyTarget(): void {
  const target = process.env['AGENT_HQ_API_URL'];
  if (target !== undefined && target !== API_URL) {
    throw new Error(`AGENT_HQ_API_URL must be unset or exactly ${API_URL} for the E2E tests`);
  }
}

function loadEnv(): void {
  try {
    process.loadEnvFile(`${ROOT}.env`);
  } catch {
    // No .env: rely on the environment.
  }
}

function devUrl(key: 'DATABASE_URL' | 'REDIS_URL'): URL {
  loadEnv();
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`${key} is not set. Copy .env.example to .env and run \`pnpm infra:up\`.`);
  }
  return new URL(value);
}

/** Connection URL of the E2E database (same server as the dev database). */
export function e2eDatabaseUrl(): string {
  const url = devUrl('DATABASE_URL');
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
}

/** Redis logical database 1, so E2E queues never mix with the dev API's. */
function e2eRedisUrl(): string {
  const url = devUrl('REDIS_URL');
  url.pathname = '/1';
  return url.toString();
}

/** Creates the E2E database if needed and applies every migration. */
export async function prepareDatabase(): Promise<void> {
  const admin = new pg.Client({
    connectionString: devUrl('DATABASE_URL').toString(),
    connectionTimeoutMillis: 3000,
  });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error('Cannot reach PostgreSQL. Run `pnpm infra:up` first.', { cause: error });
  }
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      E2E_DATABASE,
    ]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${E2E_DATABASE}`);
  } finally {
    await admin.end();
  }
  await run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: `${ROOT}packages/database`,
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
  });
}

/** Empties every table of the E2E database (the migration history stays). */
async function resetDatabase(): Promise<void> {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const current = await client.query<{ name: string }>('SELECT current_database() AS name');
    if (current.rows[0]?.name !== E2E_DATABASE)
      throw new Error('refusing to reset a non-E2E database');
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    if (rows.length > 0) {
      const tables = rows.map((r) => client.escapeIdentifier(r.tablename)).join(', ');
      await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

export type Connection = RegisterConnectionResponse;

export interface RunningApi {
  register(): Promise<Connection>;
  heartbeat(connection: Connection): Promise<void>;
}

/** The API process of the current test, kept here so it is stopped even if startup fails. */
let running: { child: ChildProcess; exited: Promise<void> } | undefined;

/** Stops the API started by `startApi`, if any. Call it after every test. */
export async function stopApi(): Promise<void> {
  const current = running;
  running = undefined;
  if (current === undefined || current.child.exitCode !== null) return;
  current.child.kill('SIGTERM');
  const timer = setTimeout(() => current.child.kill('SIGKILL'), 5000);
  await current.exited;
  clearTimeout(timer);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts the built API (`apps/api/dist`) on an empty E2E database. */
export async function startApi(settings: Record<string, string> = {}): Promise<RunningApi> {
  if (await portInUse(API_PORT)) {
    throw new Error(`Port ${API_PORT} is in use. Stop the dev API before running the E2E tests.`);
  }
  await resetDatabase();
  const env = {
    ...process.env,
    DATABASE_URL: e2eDatabaseUrl(),
    REDIS_URL: e2eRedisUrl(),
    API_HOST: '127.0.0.1',
    API_PORT: String(API_PORT),
    ...settings,
  };
  const child: ChildProcess = spawn('node', ['apps/api/dist/main.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  running = { child, exited };

  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`API exited during startup:\n${output}`);
    try {
      if ((await fetch(`${API_URL}/health`)).ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      await stopApi();
      throw new Error(`API did not become healthy within 30 s:\n${output}`);
    }
    await sleep(200);
  }

  return {
    async register() {
      const { stdout } = await run('node', ['apps/api/dist/admin/bin.js', 'registration-code'], {
        cwd: ROOT,
        env,
      });
      const registrationCode = stdout.split('\n')[0];
      const response = await fetch(`${API_URL}/connections`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ registrationCode, adapterId: 'simulator', runtime: 'simulator' }),
      });
      if (response.status !== 201) throw new Error(`register: HTTP ${response.status}`);
      return registerConnectionResponseSchema.parse(await response.json());
    },
    async heartbeat(connection) {
      const response = await fetch(`${API_URL}/connections/${connection.connectionId}/heartbeat`, {
        method: 'POST',
        headers: { authorization: `Bearer ${connection.token}` },
      });
      if (response.status !== 200) throw new Error(`heartbeat: HTTP ${response.status}`);
    },
  };
}

const SIMULATOR = 'packages/simulator/dist/bin.js';

/** Number of events a scenario emits (the CLI writes one JSON line per event). */
export async function scenarioLength(args: string[]): Promise<number> {
  const { stdout } = await run('node', [SIMULATOR, ...args, '--out', '-'], { cwd: ROOT });
  return stdout.split('\n').filter((line) => line !== '').length;
}

/** Sends a scenario to the running API with the simulator CLI. Returns the events sent. */
export async function simulate(args: string[], connection: Connection): Promise<number> {
  const { stdout } = await run('node', [SIMULATOR, ...args, '--url', `${API_URL}/events`], {
    cwd: ROOT,
    env: { ...process.env, AGENT_HQ_TOKEN: connection.token },
  });
  const sent = /^sent (\d+) events/.exec(stdout);
  if (sent === null) throw new Error(`unexpected simulator output: ${stdout}`);
  return Number(sent[1]);
}
