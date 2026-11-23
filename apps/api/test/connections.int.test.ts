import 'reflect-metadata';
import { createConnectionStore, createDatabaseClient, createEventStore } from '@agent-hq/database';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runAdmin } from '../src/admin/cli.js';
import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config.js';
import { ConnectionHealthService } from '../src/connections/connection-health.service.js';
import { CLOCK } from '../src/connections/tokens.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
if (databaseUrl === undefined)
  throw new Error('TEST_DATABASE_URL is set by test/integration-setup.ts');

const db = createDatabaseClient(databaseUrl);
const store = createConnectionStore(db);
const thresholds = { degradedAfterMs: 30_000, disconnectedAfterMs: 90_000 };
let current = new Date('2026-11-23T03:00:00.000Z');
const advance = (ms: number) => {
  current = new Date(current.getTime() + ms);
};

const logs: string[] = [];
const collect = (...parts: unknown[]) => {
  logs.push(parts.map(String).join(' '));
};
const logger = {
  log: collect,
  error: collect,
  warn: collect,
  debug: collect,
  verbose: collect,
  fatal: collect,
};

let app: NestFastifyApplication;

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: databaseUrl,
    HEALTH_CHECK_INTERVAL_MS: '0',
    HEARTBEAT_DEGRADED_MS: String(thresholds.degradedAfterMs),
    HEARTBEAT_DISCONNECTED_MS: String(thresholds.disconnectedAfterMs),
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forConfig(config)] })
    .overrideProvider(CLOCK)
    .useValue(() => current)
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE event_outbox, events, agent_instances, tasks, connections, registration_codes, workspaces RESTART IDENTITY CASCADE',
  );
});

const adminIo = (stdout: (text: string) => void) => ({
  store,
  events: createEventStore(db),
  thresholds,
  stdout,
  now: () => current,
});

async function registrationCode(): Promise<string> {
  const out: string[] = [];
  await runAdmin(
    ['registration-code'],
    adminIo((t) => out.push(t)),
  );
  return out.join('').split('\n')[0]!;
}

function register(code: string) {
  return app.inject({
    method: 'POST',
    url: '/connections',
    payload: { registrationCode: code, adapterId: 'simulator', runtime: 'simulator' },
  });
}

async function registerNew(): Promise<{ connectionId: string; token: string; code: string }> {
  const code = await registrationCode();
  const body = (await register(code)).json<{ connectionId: string; token: string }>();
  return { ...body, code };
}

function heartbeat(id: string, token: string) {
  return app.inject({
    method: 'POST',
    url: `/connections/${id}/heartbeat`,
    headers: { authorization: `Bearer ${token}` },
  });
}

async function healthEvents(): Promise<string[]> {
  const events = await createEventStore(db).readFrom('local', 0n, 100);
  return events
    .filter((e) => e.type === 'connection.health.changed')
    .map((e) => (e.payload as { status: string }).status);
}

describe('connections (HTTP)', () => {
  it('registers once per code, then authenticates heartbeats with the token', async () => {
    const code = await registrationCode();
    const registered = await register(code);
    expect(registered.statusCode).toBe(201);
    const body = registered.json<{ connectionId: string; workspaceId: string; token: string }>();
    expect(body.workspaceId).toBe('local');

    const reused = await register(code);
    expect(reused.statusCode).toBe(401);
    expect(reused.json()).toMatchObject({ error: { code: 'REGISTRATION_CODE_INVALID' } });

    const beat = await heartbeat(body.connectionId, body.token);
    expect(beat.statusCode).toBe(200);
    expect(beat.json()).toMatchObject({ connectionId: body.connectionId, status: 'connected' });
    expect(await healthEvents()).toEqual(['connected']);
  });

  it('rejects invalid bodies, bad tokens and heartbeats for another connection', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/connections',
      payload: { adapterId: 'x' },
    });
    expect(invalid.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    const { connectionId, token } = await registerNew();
    expect((await heartbeat(connectionId, 'ahq_ct_wrong')).statusCode).toBe(401);
    expect((await heartbeat('someone-else', token)).statusCode).toBe(404);
  });

  it('degrades and disconnects silent connections, recording each change as an event', async () => {
    const { connectionId, token } = await registerNew();
    await heartbeat(connectionId, token);
    const health = app.get(ConnectionHealthService);

    advance(29_000);
    expect(await health.evaluateAll()).toBe(0);
    advance(1_000);
    expect(await health.evaluateAll()).toBe(1);
    advance(60_000);
    expect(await health.evaluateAll()).toBe(1);
    expect(await healthEvents()).toEqual(['connected', 'degraded', 'disconnected']);

    // A heartbeat brings it back immediately.
    expect((await heartbeat(connectionId, token)).json()).toMatchObject({ status: 'connected' });
  });

  it('stops accepting a revoked token and records the revocation as a status change', async () => {
    const { connectionId, token } = await registerNew();
    await heartbeat(connectionId, token);
    await runAdmin(
      ['revoke', connectionId],
      adminIo(() => {}),
    );
    expect((await heartbeat(connectionId, token)).statusCode).toBe(401);
    expect((await store.findById(connectionId))?.status).toBe('disconnected');
    expect(await healthEvents()).toEqual(['connected', 'disconnected']);
  });

  it('accepts a token until its expiry instant and rejects it from then on', async () => {
    const { connectionId, token } = await registerNew();
    advance(30 * 86_400_000 - 1);
    expect((await heartbeat(connectionId, token)).statusCode).toBe(200);
    advance(1);
    expect((await heartbeat(connectionId, token)).statusCode).toBe(401);
  });

  it('never stores or logs a raw token or registration code', async () => {
    const { connectionId, token, code } = await registerNew();
    await heartbeat(connectionId, token);
    await heartbeat(connectionId, 'ahq_ct_wrong_token_value');
    for (const table of [
      'workspaces',
      'connections',
      'registration_codes',
      'events',
      'event_outbox',
    ]) {
      const rows = await db.$queryRawUnsafe<unknown[]>(
        `SELECT row_to_json(t) AS row FROM ${table} t`,
      );
      const dump = JSON.stringify(rows);
      expect(dump).not.toContain(token);
      expect(dump).not.toContain(code);
    }
    const allLogs = logs.join('\n');
    expect(allLogs).not.toContain(token);
    expect(allLogs).not.toContain(code);
  });

  it('answers framework errors with the contract error envelope', async () => {
    const malformed = await app.inject({
      method: 'POST',
      url: '/connections',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    const unknown = await app.inject({ method: 'GET', url: '/nope' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('marks the one-time token response as not cacheable', async () => {
    const response = await register(await registrationCode());
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
