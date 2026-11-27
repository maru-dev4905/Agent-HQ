import 'reflect-metadata';
import { mainAgentId, mapDropped, mapHook, type AdapterState } from '@agent-hq/adapter-claude-code';
import { agentListSchema, eventPageSchema } from '@agent-hq/contracts';
import { createConnectionStore, createDatabaseClient, createEventStore } from '@agent-hq/database';
import type { IncomingAgentEvent } from '@agent-hq/events';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runAdmin } from '../src/admin/cli.js';
import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config.js';
import { createHttpAdapter } from '../src/http/fastify.js';

/**
 * HQ-202: events produced by the Claude Code mapping are accepted by ingestion and project
 * into the expected agents. The mapping package itself never depends on the API, so this
 * check lives here.
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
let app: NestFastifyApplication;

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: databaseUrl,
    HEALTH_CHECK_INTERVAL_MS: '0',
    OUTBOX_POLL_INTERVAL_MS: '0',
    GAP_CHECK_INTERVAL_MS: '0',
  });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forConfig(config)],
  }).compile();
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

async function connect(): Promise<string> {
  const out: string[] = [];
  await runAdmin(['registration-code'], {
    store: createConnectionStore(db),
    events: createEventStore(db),
    thresholds: { degradedAfterMs: 30_000, disconnectedAfterMs: 90_000 },
    stdout: (text) => out.push(text),
    now: () => new Date(),
  });
  const response = await app.inject({
    method: 'POST',
    url: '/connections',
    payload: {
      registrationCode: out.join('').split('\n')[0],
      adapterId: 'claude-code',
      runtime: 'claude-code',
    },
  });
  return response.json<{ token: string }>().token;
}

async function ingest(token: string, events: IncomingAgentEvent[]) {
  return app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events } as never,
  });
}

const SESSION = '3f2a9c1e-0000-4000-8000-0000000000aa';
const hook = (name: string, fields: Record<string, unknown> = {}) => ({
  session_id: SESSION,
  hook_event_name: name,
  ...fields,
});
const at = (i: number) => new Date(Date.UTC(2026, 10, 27, 9, 0, 0) + i * 1000).toISOString();

function mapAll(inputs: unknown[]): { state: AdapterState; events: IncomingAgentEvent[] } {
  let state: AdapterState = {};
  const events: IncomingAgentEvent[] = [];
  inputs.forEach((input, i) => {
    const result = mapHook(state, input, { occurredAt: at(i) });
    state = result.state;
    events.push(...result.events);
  });
  return { state, events };
}

const agents = async () =>
  agentListSchema.parse(
    (await app.inject({ method: 'GET', url: '/workspaces/local/agents' })).json(),
  ).agents;

describe('Claude Code mapping → ingestion → read models (HQ-202)', () => {
  it('projects the main agent, a subagent with its parent, and their tool calls', async () => {
    const token = await connect();
    const { events } = mapAll([
      hook('SessionStart', { source: 'startup' }),
      hook('UserPromptSubmit'),
      hook('SubagentStart', { agent_id: 'agent_a1', agent_type: 'reviewer' }),
      hook('PreToolUse', { agent_id: 'agent_a1', tool_name: 'Read', tool_use_id: 'toolu_1' }),
      hook('PostToolUse', { agent_id: 'agent_a1', tool_name: 'Read', tool_use_id: 'toolu_1' }),
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_2' }),
      hook('PermissionRequest', { tool_name: 'Bash' }),
      hook('PostToolBatch', { tool_calls: [{ tool_use_id: 'toolu_2' }] }),
      hook('Stop'),
    ]);
    const response = await ingest(token, events);
    expect(response.statusCode).toBe(200);

    const list = await agents();
    const byName = Object.fromEntries(list.map((a) => [a.agentName ?? a.agentInstanceId, a]));
    expect(Object.keys(byName).sort()).toEqual(['main', 'reviewer']);
    expect(byName['main']).toMatchObject({
      observedStatus: 'waiting',
      rawStatus: 'stop',
      parentExternalAgentId: null,
    });
    expect(byName['reviewer']).toMatchObject({
      roleHint: 'reviewer',
      parentExternalAgentId: mainAgentId(SESSION),
    });

    const stored = eventPageSchema.parse(
      (await app.inject({ method: 'GET', url: '/workspaces/local/events' })).json(),
    ).events;
    const tools = stored
      .filter((e) => e.type.startsWith('tool.call.'))
      .map((e) => [e.type, (e.payload as { errorCode?: string }).errorCode ?? null]);
    expect(tools).toEqual([
      ['tool.call.started', null],
      ['tool.call.completed', null],
      ['tool.call.started', null],
      ['tool.call.failed', 'not_executed'],
    ]);
    // The subagent's tool events belong to the subagent.
    const reviewerId = byName['reviewer']?.agentInstanceId;
    expect(stored.filter((e) => e.agentInstanceId === reviewerId).map((e) => e.type)).toEqual([
      'agent.started',
      'tool.call.started',
      'tool.call.completed',
    ]);
  });

  it('resending the same mapped events stores nothing twice', async () => {
    const token = await connect();
    const { events } = mapAll([hook('SessionStart'), hook('UserPromptSubmit'), hook('Stop')]);
    expect((await ingest(token, events)).statusCode).toBe(200);
    expect((await ingest(token, events)).statusCode).toBe(200);
    const stored = eventPageSchema.parse(
      (await app.inject({ method: 'GET', url: '/workspaces/local/events' })).json(),
    ).events;
    expect(stored).toHaveLength(3);
  });

  it('a dropped-signal gap leaves the main agent unknown until it is heard from again', async () => {
    const token = await connect();
    const first = mapAll([hook('SessionStart'), hook('UserPromptSubmit')]);
    const gap = mapDropped(first.state, { sessionId: SESSION, count: 2, occurredAt: at(5) });
    expect((await ingest(token, [...first.events, ...gap.events])).statusCode).toBe(200);
    expect((await agents())[0]).toMatchObject({ agentName: 'main', observedStatus: 'unknown' });

    const later = mapHook(gap.state, hook('Stop'), { occurredAt: at(6) });
    expect((await ingest(token, later.events)).statusCode).toBe(200);
    expect((await agents())[0]).toMatchObject({ observedStatus: 'waiting' });
  });
});
