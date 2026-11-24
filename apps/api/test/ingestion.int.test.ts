import 'reflect-metadata';
import {
  createConnectionStore,
  createDatabaseClient,
  createEventStore,
  readProjections,
} from '@agent-hq/database';
import { generate, sendEvents } from '@agent-hq/simulator';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runAdmin } from '../src/admin/cli.js';
import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config.js';
import { CLOCK } from '../src/connections/tokens.js';
import { createHttpAdapter } from '../src/http/fastify.js';
import { EventRateLimiter } from '../src/ingestion/rate-limiter.js';
import { EVENT_RATE_LIMITER } from '../src/ingestion/tokens.js';
import { replayProjections } from '../src/projection/projection.service.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
if (databaseUrl === undefined)
  throw new Error('TEST_DATABASE_URL is set by test/integration-setup.ts');

const db = createDatabaseClient(databaseUrl);
const eventStore = createEventStore(db);
const now = new Date('2026-11-24T09:00:00.000Z');

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

// Fake credential assembled at runtime so secret scanners do not flag this file.
const SECRET = ['ghp_', 'Z'.repeat(36)].join('');

let app: NestFastifyApplication;
let limiterNow = 0;

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: databaseUrl,
    HEALTH_CHECK_INTERVAL_MS: '0',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forConfig(config)] })
    .overrideProvider(CLOCK)
    .useValue(() => now)
    // Small, time-controlled bucket so the rate test does not depend on the wall clock.
    .overrideProvider(EVENT_RATE_LIMITER)
    .useValue(new EventRateLimiter({ eventsPerSecond: 1, burstEvents: 600 }, () => limiterNow))
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(createHttpAdapter(), { logger });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

beforeEach(async () => {
  logs.length = 0;
  limiterNow += 3_600_000; // refill every bucket between tests
  await db.$executeRawUnsafe(
    'TRUNCATE agent_current_state, task_current_state, event_outbox, events, agent_instances, tasks, connections, registration_codes, workspaces RESTART IDENTITY CASCADE',
  );
});

async function connect(): Promise<{ connectionId: string; token: string }> {
  const out: string[] = [];
  await runAdmin(['registration-code'], {
    store: createConnectionStore(db),
    events: eventStore,
    thresholds: { degradedAfterMs: 30_000, disconnectedAfterMs: 90_000 },
    stdout: (text) => out.push(text),
    now: () => now,
  });
  const response = await app.inject({
    method: 'POST',
    url: '/connections',
    payload: {
      registrationCode: out.join('').split('\n')[0],
      adapterId: 'simulator',
      runtime: 'simulator',
    },
  });
  return response.json<{ connectionId: string; token: string }>();
}

const agentStarted = (key: string, overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  type: 'agent.started',
  occurredAt: '2026-11-24T08:59:00Z',
  source: { adapterId: 'simulator', runtime: 'simulator', externalAgentId: 'main' },
  correlationId: 'corr-1',
  idempotencyKey: key,
  payload: { agentName: 'Main' },
  ...overrides,
});

function post(token: string | undefined, payload: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/events',
    headers: { ...(token === undefined ? {} : { authorization: `Bearer ${token}` }), ...headers },
    payload: payload as never,
  });
}

const storedEvents = () => eventStore.readFrom('local', 0n, 1000);

describe('ingestion (HTTP + PostgreSQL)', () => {
  it('stores a batch once, keeps occurredAt and receivedAt apart, and projects it', async () => {
    const { connectionId, token } = await connect();
    const first = await post(token, {
      events: [agentStarted('k1'), agentStarted('k2', { type: 'agent.completed', payload: {} })],
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      results: [
        { idempotencyKey: 'k1', status: 'stored', ignoredFields: [], redactedFields: [] },
        { idempotencyKey: 'k2', status: 'stored' },
      ],
    });

    const again = await post(token, { events: [agentStarted('k1')] });
    expect(again.json()).toMatchObject({
      results: [{ idempotencyKey: 'k1', status: 'duplicate' }],
    });

    const stored = (await storedEvents()).filter((e) => e.type !== 'connection.health.changed');
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({
      connectionId,
      workspaceId: 'local',
      occurredAt: '2026-11-24T08:59:00.000Z',
      receivedAt: now.toISOString(),
    });
    const { agents } = await readProjections(db, 'local');
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      agentInstanceId: stored[0]!.agentInstanceId,
      observedStatus: 'idle',
      // Normalized like storage, so the projector compares instants, not text (`:00Z` vs `:00.000Z`).
      lastEventAt: '2026-11-24T08:59:00.000Z',
    });
  });

  it('rejects the whole batch with per-field reasons when any event is invalid', async () => {
    const { token } = await connect();
    const response = await post(token, {
      events: [agentStarted('ok'), agentStarted('bad', { type: 'tool.call.started', payload: {} })],
    });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: { code: string; issues: { path: string }[] } }>();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(['events.1.payload.toolName', 'events.1.payload.externalToolCallId']),
    );
    expect((await storedEvents()).filter((e) => e.type === 'agent.started')).toHaveLength(0);

    // Valid JSON that PostgreSQL jsonb cannot store must be a 400, not a 500 retried forever.
    const surrogate = await post(token, {
      events: [agentStarted('u', { payload: { agentName: 'bad \ud800 text' } })],
    });
    expect(surrogate.statusCode).toBe(400);
    expect(surrogate.json()).toMatchObject({
      error: {
        issues: [{ path: 'events.0.payload.agentName', message: 'Text must be valid Unicode' }],
      },
    });

    for (const bad of [{}, { events: [] }, { events: 'x' }, []]) {
      expect((await post(token, bad)).json()).toMatchObject({
        error: { code: 'VALIDATION_FAILED' },
      });
    }
  });

  it('rejects events that name another workspace or connection', async () => {
    const { connectionId, token } = await connect();
    const response = await post(token, {
      events: [
        agentStarted('a', { workspaceId: 'local', connectionId }),
        agentStarted('b', { workspaceId: 'other' }),
        agentStarted('c', { connectionId: 'someone-else' }),
      ],
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'FORBIDDEN',
        issues: [{ path: 'events.1.workspaceId' }, { path: 'events.2.connectionId' }],
      },
    });
    expect((await storedEvents()).filter((e) => e.type === 'agent.started')).toHaveLength(0);
  });

  it('masks secrets before storage and keeps payloads and secrets out of logs (Secret redaction test)', async () => {
    const { token } = await connect();
    const toolCall = {
      schemaVersion: 1,
      type: 'tool.call.started',
      occurredAt: '2026-11-24T08:59:00.000Z',
      source: { adapterId: 'simulator', runtime: 'simulator', externalAgentId: 'main' },
      correlationId: 'corr-1',
      idempotencyKey: 'tool-1',
      payload: {
        toolName: 'Bash',
        externalToolCallId: 'call-1',
        inputSummary: `git push https://x:${SECRET}@github.com/o/r`,
        command: 'unknown field with marker-text-123',
      },
    };
    const response = await post(token, { events: [toolCall] });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      results: [{ ignoredFields: ['payload.command'], redactedFields: ['payload.inputSummary'] }],
    });

    const raw = await db.$queryRawUnsafe<{ payload: unknown }[]>('SELECT payload FROM events');
    const all = JSON.stringify(raw);
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain('marker-text-123');
    expect(all).toContain('[REDACTED:');

    const logText = logs.join('\n');
    expect(logText).toContain('redacted=payload.inputSummary×1');
    for (const text of [SECRET, 'marker-text-123', 'git push', token]) {
      expect(logText).not.toContain(text);
    }
  });

  it('rejects a conflicting idempotency key and rolls the batch back', async () => {
    const { token } = await connect();
    await post(token, { events: [agentStarted('k1')] });
    const response = await post(token, {
      events: [agentStarted('fresh'), agentStarted('k1', { payload: { agentName: 'Changed' } })],
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: 'CONFLICT', issues: [{ path: 'events.1.idempotencyKey' }] },
    });
    const keys = (await storedEvents()).map((e) => e.idempotencyKey);
    expect(keys).toContain('k1');
    expect(keys).not.toContain('fresh');
  });

  it('maps the same external ID from two connections to different agent instances', async () => {
    const a = await connect();
    const b = await connect();
    await post(a.token, { events: [agentStarted('k')] });
    await post(b.token, { events: [agentStarted('k')] });
    const started = (await storedEvents()).filter((e) => e.type === 'agent.started');
    expect(started).toHaveLength(2);
    expect(started[0]!.agentInstanceId).not.toBe(started[1]!.agentInstanceId);
    expect(new Set(started.map((e) => e.connectionId))).toEqual(
      new Set([a.connectionId, b.connectionId]),
    );
  });

  it('rejects requests without a valid token', async () => {
    expect((await post(undefined, { events: [agentStarted('k')] })).statusCode).toBe(401);
    expect((await post('ahq_ct_wrong', { events: [agentStarted('k')] })).json()).toMatchObject({
      error: { code: 'AUTHENTICATION_FAILED' },
    });
  });

  it('rejects a foreign Host or Origin before authentication', async () => {
    const { token } = await connect();
    const badHost = await post(
      token,
      { events: [agentStarted('k')] },
      { host: 'rebind.example:4000' },
    );
    expect(badHost.statusCode).toBe(403);
    expect(badHost.json()).toMatchObject({
      error: { code: 'FORBIDDEN', message: 'Host is not allowed' },
    });
    const badOrigin = await post(
      token,
      { events: [agentStarted('k')] },
      { origin: 'https://evil.example' },
    );
    expect(badOrigin.json()).toMatchObject({
      error: { code: 'FORBIDDEN', message: 'Origin is not allowed' },
    });
    expect((await storedEvents()).filter((e) => e.type === 'agent.started')).toHaveLength(0);
  });

  it('rejects oversized events, batches and bodies, and rate-limits per connection', async () => {
    const { token } = await connect();
    const big = await post(token, {
      events: [agentStarted('big', { payload: { agentName: 'x', padding: 'y'.repeat(70_000) } })],
    });
    expect(big.statusCode).toBe(400);
    expect(big.json()).toMatchObject({
      error: { issues: [{ path: 'events.0', message: 'Event exceeds 65536 bytes' }] },
    });

    const tooMany = await post(token, {
      events: Array.from({ length: 501 }, (_, i) => agentStarted(`m${i}`)),
    });
    expect(tooMany.statusCode).toBe(413);
    expect(tooMany.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });

    const hugeBody = await post(token, {
      events: [agentStarted('h')],
      filler: 'z'.repeat(5 * 1024 * 1024),
    });
    expect(hugeBody.statusCode).toBe(413);
    expect(hugeBody.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });

    // Only the 1-event request reached the limiter (the others failed earlier): 599 left.
    const batch = (prefix: string) => ({
      events: Array.from({ length: 100 }, (_, i) => agentStarted(`${prefix}${i}`)),
    });
    for (const prefix of ['a', 'b', 'c', 'd', 'e']) {
      expect((await post(token, batch(prefix))).statusCode).toBe(200);
    }
    const limited = await post(token, batch('r'));
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('1');
    expect(limited.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    // Another connection has its own budget.
    expect((await post((await connect()).token, batch('s'))).statusCode).toBe(200);
  });

  it('live projections equal a full replay for a simulator stream sent over HTTP', async () => {
    const { token } = await connect();
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.getHttpAdapter().getInstance().server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    const stream = generate({
      scenario: 'delegation',
      seed: 11,
      shuffle: true,
      duplicateRate: 0.3,
    });
    const report = await sendEvents(stream, {
      url: `http://127.0.0.1:${address.port}/events`,
      token,
      batchSize: 7,
    });
    expect(report.events).toBe(stream.length);
    expect(new Set(report.statuses)).toEqual(new Set([200]));

    const live = await readProjections(db, 'local');
    expect(live.agents.length).toBeGreaterThan(1);
    await replayProjections(eventStore, 'local');
    expect(await readProjections(db, 'local')).toEqual(live);
  });
});
