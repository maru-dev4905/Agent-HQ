import 'reflect-metadata';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bridgePaths, readCredentials, runCli, type CliIo } from '@agent-hq/bridge';
import { agentListSchema, connectionListSchema } from '@agent-hq/contracts';
import { createConnectionStore, createDatabaseClient, createEventStore } from '@agent-hq/database';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runAdmin } from '../src/admin/cli.js';
import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config.js';
import { ConnectionHealthService } from '../src/connections/connection-health.service.js';
import { CLOCK } from '../src/connections/tokens.js';
import { createHttpAdapter } from '../src/http/fastify.js';

/**
 * HQ-203: the Bridge's pairing and heartbeat against a real API over HTTP (security §4.6:
 * Local Bridge pairing, token expiration/revocation).
 */
const databaseUrl = process.env['TEST_DATABASE_URL'];
if (databaseUrl === undefined)
  throw new Error('TEST_DATABASE_URL is set by test/integration-setup.ts');

const db = createDatabaseClient(databaseUrl);
const quiet = () => undefined;
const logger = {
  log: quiet,
  error: quiet,
  warn: quiet,
  debug: quiet,
  verbose: quiet,
  fatal: quiet,
};
const euid = process.geteuid?.() ?? -1;
let now = new Date();
let app: NestFastifyApplication | undefined;
let apiUrl = '';
let root = '';

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: databaseUrl,
    HEALTH_CHECK_INTERVAL_MS: '0',
    OUTBOX_POLL_INTERVAL_MS: '0',
    GAP_CHECK_INTERVAL_MS: '0',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forConfig(config)] })
    .overrideProvider(CLOCK)
    .useValue(() => now)
    .compile();
  const created = moduleRef.createNestApplication<NestFastifyApplication>(createHttpAdapter(), {
    logger,
  });
  app = created;
  await created.listen({ host: '127.0.0.1', port: 0 });
  const address = created.getHttpServer().address();
  if (address === null || typeof address === 'string') throw new Error('no TCP address');
  apiUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  try {
    if (app !== undefined) await app.close();
  } finally {
    await db.$disconnect();
  }
});

beforeEach(async () => {
  now = new Date();
  root = mkdtempSync(join(tmpdir(), 'hq-bridge-int-'));
  chmodSync(root, 0o700);
  await db.$executeRawUnsafe(
    'TRUNCATE agent_current_state, task_current_state, event_outbox, events, agent_instances, tasks, connections, registration_codes, workspaces RESTART IDENTITY CASCADE',
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function api(): NestFastifyApplication {
  if (app === undefined) throw new Error('app failed to start (see beforeAll)');
  return app;
}

const admin = async (argv: string[]) => {
  const out: string[] = [];
  await runAdmin(argv, {
    store: createConnectionStore(db),
    events: createEventStore(db),
    thresholds: { degradedAfterMs: 30_000, disconnectedAfterMs: 90_000 },
    stdout: (text) => out.push(text),
    now: () => now,
  });
  return out.join('');
};

const registrationCode = async () => (await admin(['registration-code'])).split('\n')[0] ?? '';

function bridgeIo(extra: Partial<CliIo> = {}): CliIo & { out: string[] } {
  const out: string[] = [];
  return {
    env: { AGENT_HQ_BRIDGE_HOME: join(root, 'home') },
    userHome: root,
    euid,
    stdout: (text) => out.push(text),
    readStdin: () => Promise.resolve(''),
    fetch,
    now: () => new Date(),
    stopSignal: new AbortController().signal,
    heartbeatIntervalMs: 50,
    out,
    ...extra,
  };
}

const paths = () => bridgePaths({ AGENT_HQ_BRIDGE_HOME: join(root, 'home') }, root);

async function pair(code: string) {
  const io = bridgeIo({ readStdin: () => Promise.resolve(`${code}\n`) });
  await runCli(['pair', '--api', apiUrl], io);
  return io;
}

/** Runs the Bridge until `until` holds for its output, then stops it. */
async function runUntil(until: (out: string) => boolean) {
  const stop = new AbortController();
  const io = bridgeIo({ stopSignal: stop.signal });
  const running = runCli(['run'], io).catch((error: unknown) => error);
  for (let i = 0; i < 200 && !until(io.out.join('')); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  stop.abort();
  return { io, result: await running };
}

const connections = async () =>
  connectionListSchema.parse(
    (await api().inject({ method: 'GET', url: '/workspaces/local/connections' })).json(),
  ).connections;

describe('Bridge pairing and heartbeat (HQ-203)', () => {
  it('pairs once with a code; the same code and an expired code are refused', async () => {
    const code = await registrationCode();
    const first = await pair(code);
    const credentials = readCredentials(paths(), euid);
    expect(credentials?.connectionId).toBeDefined();
    expect(first.out.join('')).not.toContain(credentials?.token);

    // Reusing the code: refused, and the stored pairing is untouched.
    const again = bridgeIo({ readStdin: () => Promise.resolve(`${code}\n`) });
    await expect(runCli(['pair', '--api', apiUrl, '--replace'], again)).rejects.toThrow(
      /invalid, already used or expired/,
    );
    expect(readCredentials(paths(), euid)).toEqual(credentials);

    // A code past its 10-minute lifetime.
    const stale = await registrationCode();
    now = new Date(now.getTime() + 11 * 60_000);
    const late = bridgeIo({ readStdin: () => Promise.resolve(`${stale}\n`) });
    await expect(runCli(['pair', '--api', apiUrl, '--replace'], late)).rejects.toThrow(
      /invalid, already used or expired/,
    );
    expect(await connections()).toHaveLength(1);
  });

  it('heartbeats keep the connection up; when they stop, its agents become unknown', async () => {
    await pair(await registrationCode());
    const { io } = await runUntil((out) => out.includes('connected (heartbeat'));
    expect(io.out.join('')).toMatch(/connected \(heartbeat/);
    expect((await connections())[0]?.status).toBe('connected');

    // An agent reported over this connection, then the Bridge goes silent.
    const token = readCredentials(paths(), euid)?.token ?? '';
    const response = await api().inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: [
          {
            schemaVersion: 1,
            type: 'agent.connected',
            occurredAt: new Date().toISOString(),
            source: {
              adapterId: 'claude-code',
              runtime: 'claude-code',
              externalSessionId: 's1',
              externalAgentId: 'main:s1',
            },
            correlationId: 's1',
            idempotencyKey: 's1:SessionStart:0',
            sequence: 0,
            payload: { agentName: 'main' },
          },
        ],
      } as never,
    });
    expect(response.statusCode).toBe(200);

    const health = api().get(ConnectionHealthService);
    now = new Date(now.getTime() + 31_000);
    await health.evaluateAll();
    now = new Date(now.getTime() + 60_000);
    await health.evaluateAll();
    expect((await connections())[0]?.status).toBe('disconnected');
    const agents = agentListSchema.parse(
      (await api().inject({ method: 'GET', url: '/workspaces/local/agents' })).json(),
    ).agents;
    expect(agents.map((a) => a.observedStatus)).toEqual(['unknown']);
  });

  it('stops and asks to pair again once the token is revoked', async () => {
    await pair(await registrationCode());
    const connectionId = readCredentials(paths(), euid)?.connectionId ?? '';
    expect(await admin(['revoke', connectionId])).toContain(`revoked ${connectionId}`);

    const { io, result } = await runUntil((out) => out.includes('revoked or has expired'));
    expect(String(result)).toMatch(/pair again/);
    expect(io.out.join('')).toMatch(/agent-hq-bridge pair --replace/);
    expect(io.out.join('')).not.toContain(readCredentials(paths(), euid)?.token);
  });
});
