import 'reflect-metadata';
import { agentListSchema } from '@agent-hq/contracts';
import {
  createConnectionStore,
  createDatabaseClient,
  createEventStore,
  readProjections,
} from '@agent-hq/database';
import { generate } from '@agent-hq/simulator';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runAdmin } from '../src/admin/cli.js';
import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config.js';
import { ConnectionHealthService } from '../src/connections/connection-health.service.js';
import { CLOCK } from '../src/connections/tokens.js';
import { GapDetectionService } from '../src/gap-detection/gap-detection.service.js';
import { createHttpAdapter } from '../src/http/fastify.js';
import { replayProjections } from '../src/projection/projection.service.js';
import { QUERY_CLOCK } from '../src/query/tokens.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
if (databaseUrl === undefined)
  throw new Error('TEST_DATABASE_URL is set by test/integration-setup.ts');

const db = createDatabaseClient(databaseUrl);
const eventStore = createEventStore(db);
const quiet = () => undefined;
const logger = {
  log: quiet,
  error: quiet,
  warn: quiet,
  debug: quiet,
  verbose: quiet,
  fatal: quiet,
};
const GRACE_MS = 30_000;

let now = new Date('2026-11-25T09:00:00.000Z');
const advance = (ms: number) => {
  now = new Date(now.getTime() + ms);
};
let app: NestFastifyApplication;

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: databaseUrl,
    HEALTH_CHECK_INTERVAL_MS: '0',
    OUTBOX_POLL_INTERVAL_MS: '0',
    GAP_CHECK_INTERVAL_MS: '0',
    GAP_GRACE_MS: String(GRACE_MS),
    STALE_THRESHOLD_MS: '60000',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forConfig(config)] })
    .overrideProvider(CLOCK)
    .useValue(() => now)
    .overrideProvider(QUERY_CLOCK)
    .useValue(() => now)
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

async function ingest(token: string, events: unknown[]): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events } as never,
  });
  expect(response.statusCode).toBe(200);
}

const gapEvents = async () =>
  (await eventStore.readFrom('local', 0n, 1000)).filter((e) => e.type === 'event.gap.detected');

/** Shown status per agent name, as the Query API serves it (includes connection loss). */
const agentStatuses = async (): Promise<Record<string, string>> => {
  const list = agentListSchema.parse(
    (await app.inject({ method: 'GET', url: '/workspaces/local/agents' })).json(),
  );
  return Object.fromEntries(
    list.agents.map((a) => [a.agentName ?? a.agentInstanceId, a.observedStatus]),
  );
};

function sessionEvent(
  sequence: number,
  type: string,
  payload: Record<string, unknown>,
  agent = 'main',
) {
  return {
    schemaVersion: 1,
    type,
    occurredAt: new Date(Date.parse('2026-11-25T08:00:00.000Z') + sequence * 1000).toISOString(),
    source: {
      adapterId: 'simulator',
      runtime: 'simulator',
      externalSessionId: 'sess_1',
      externalAgentId: agent,
    },
    correlationId: 'run',
    idempotencyKey: `sess_1:${sequence}`,
    sequence,
    payload,
  };
}

describe('gap detection (HQ-108)', () => {
  it('records event.gap.detected for the simulator gap scenario once the grace period passes', async () => {
    const { token } = await connect();
    const stream = generate({ scenario: 'failure-gap', seed: 4, shuffle: true });
    await ingest(token, stream);
    const detector = app.get(GapDetectionService);

    // Within the grace period a late event may still fill the hole.
    expect(await detector.detectOnce(now)).toBe(0);
    advance(GRACE_MS + 1);
    expect(await detector.detectOnce(now)).toBe(1);

    const sequences = stream
      .flatMap((e) => (e.sequence === undefined ? [] : [e.sequence]))
      .sort((a, b) => a - b);
    const missing = sequences
      .slice(1)
      .flatMap((s, i) => (s > sequences[i]! + 1 ? [{ from: sequences[i]! + 1, to: s - 1 }] : []));
    expect(missing).toHaveLength(1);
    const [gap] = await gapEvents();
    expect(gap).toMatchObject({
      source: { adapterId: 'hq', runtime: 'hq' },
      payload: { fromSequence: missing[0]!.from, toSequence: missing[0]!.to },
    });
    expect(gap!.agentInstanceId).toBeDefined();

    // Recorded once: later checks add nothing.
    expect(await detector.detectOnce(now)).toBe(0);
    expect(await gapEvents()).toHaveLength(1);
    // The scenario ends with agent.disconnected, so the final state is still decided by it.
    expect(await agentStatuses()).toEqual({ main: 'disconnected' });

    const live = await readProjections(db, 'local');
    await replayProjections(eventStore, 'local');
    expect(await readProjections(db, 'local')).toEqual(live);
  });

  it('leaves the agent unknown when no known status follows the hole', async () => {
    const { token } = await connect();
    await ingest(token, [
      sessionEvent(0, 'agent.started', { agentName: 'main' }),
      sessionEvent(1, 'agent.status.changed', { status: 'working' }),
      // 2 and 3 never arrive.
      sessionEvent(4, 'tool.call.started', { toolName: 'Bash', externalToolCallId: 'c1' }),
    ]);
    advance(GRACE_MS + 1);
    expect(await app.get(GapDetectionService).detectOnce(now)).toBe(1);
    expect((await gapEvents())[0]).toMatchObject({ payload: { fromSequence: 2, toSequence: 3 } });
    expect(await agentStatuses()).toEqual({ main: 'unknown' });

    // The missing events arrive late: a recorded gap stays recorded, nothing is re-added,
    // and the agent's state follows the newest known event again.
    await ingest(token, [
      sessionEvent(2, 'tool.call.completed', { toolName: 'Bash', externalToolCallId: 'c0' }),
      sessionEvent(3, 'agent.status.changed', { status: 'waiting' }),
      sessionEvent(5, 'agent.status.changed', { status: 'working' }),
    ]);
    advance(GRACE_MS + 1);
    expect(await app.get(GapDetectionService).detectOnce(now)).toBe(0);
    expect(await agentStatuses()).toEqual({ main: 'working' });
  });
});

describe('gap detection — several agents and partial fills (HQ-108)', () => {
  it('records the gap for agents still in the session, not for one that had disconnected', async () => {
    const { token } = await connect();
    await ingest(token, [
      sessionEvent(0, 'agent.started', { agentName: 'main' }),
      sessionEvent(1, 'agent.started', { agentName: 'helper' }, 'helper'),
      sessionEvent(2, 'agent.disconnected', {}, 'helper'),
      sessionEvent(3, 'agent.status.changed', { status: 'working' }),
      // 4 and 5 never arrive.
      sessionEvent(6, 'tool.call.started', { toolName: 'Bash', externalToolCallId: 'c1' }),
    ]);
    advance(GRACE_MS + 1);
    expect(await app.get(GapDetectionService).detectOnce(now)).toBe(1);
    expect(await gapEvents()).toHaveLength(1);
    expect(await agentStatuses()).toEqual({ main: 'unknown', helper: 'disconnected' });
  });

  it('does not record again the holes left inside a recorded gap by a late event', async () => {
    const { token } = await connect();
    await ingest(token, [
      sessionEvent(0, 'agent.started', { agentName: 'main' }),
      sessionEvent(4, 'agent.status.changed', { status: 'working' }),
    ]);
    advance(GRACE_MS + 1);
    const detector = app.get(GapDetectionService);
    expect(await detector.detectOnce(now)).toBe(1);
    await ingest(token, [
      sessionEvent(2, 'tool.call.started', { toolName: 'Bash', externalToolCallId: 'c' }),
    ]);
    advance(GRACE_MS + 1);
    // Holes 1-1 and 3-3 lie inside the recorded 1-3: nothing new is recorded.
    expect(await detector.detectOnce(now)).toBe(0);
    expect((await gapEvents()).map((e) => e.payload)).toMatchObject([
      { fromSequence: 1, toSequence: 3 },
    ]);
    expect(await agentStatuses()).toEqual({ main: 'working' });
  });

  it('counts a source-sent event.gap.detected as part of its numbering, not as an HQ record', async () => {
    const { token } = await connect();
    await ingest(token, [
      sessionEvent(0, 'agent.started', { agentName: 'main' }),
      // The source reports a gap itself at sequence 2; sequence 1 is really missing.
      {
        // Numbers beyond int4/int8 in a source's own gap payload must not break detection.
        ...sessionEvent(2, 'event.gap.detected', {
          reason: 'adapter buffer overflow',
          fromSequence: 9_007_199_254_740_000,
          toSequence: 9_007_199_254_740_991,
        }),
        source: { adapterId: 'simulator', runtime: 'simulator', externalSessionId: 'sess_1' },
      },
    ]);
    advance(GRACE_MS + 1);
    expect(await app.get(GapDetectionService).detectOnce(now)).toBe(1);
    const hq = (await gapEvents()).filter((e) => e.source.adapterId === 'hq');
    expect(hq.map((e) => e.payload)).toMatchObject([{ fromSequence: 1, toSequence: 1 }]);
  });
});

describe('connection loss and stale display (HQ-108)', () => {
  it('marks agents of a lost connection unknown, keeps explicit disconnects, never idle', async () => {
    const { connectionId, token } = await connect();
    await app.inject({
      method: 'POST',
      url: `/connections/${connectionId}/heartbeat`,
      headers: { authorization: `Bearer ${token}` },
    });
    await ingest(token, [
      sessionEvent(0, 'agent.started', { agentName: 'main' }),
      sessionEvent(1, 'agent.completed', {}),
      sessionEvent(2, 'agent.started', { agentName: 'helper' }, 'helper'),
      sessionEvent(3, 'agent.disconnected', {}, 'helper'),
    ]);
    expect(await agentStatuses()).toEqual({ main: 'idle', helper: 'disconnected' });

    // Heartbeats stop: degraded, then disconnected.
    const health = app.get(ConnectionHealthService);
    advance(31_000);
    await health.evaluateAll();
    advance(60_000);
    await health.evaluateAll();
    expect(await agentStatuses()).toEqual({ main: 'unknown', helper: 'disconnected' });

    const live = await readProjections(db, 'local');
    await replayProjections(eventStore, 'local');
    expect(await readProjections(db, 'local')).toEqual(live);
  });

  it('shows stale from server receive time without changing observedStatus', async () => {
    const { token } = await connect();
    await ingest(token, [sessionEvent(0, 'agent.started', { agentName: 'main' })]);
    const list = async () =>
      agentListSchema.parse(
        (await app.inject({ method: 'GET', url: '/workspaces/local/agents' })).json(),
      );
    expect(await list()).toMatchObject({
      staleThresholdMs: 60_000,
      agents: [{ observedStatus: 'connected', stale: false }],
    });
    advance(60_001);
    expect(await list()).toMatchObject({ agents: [{ observedStatus: 'connected', stale: true }] });
  });
});
