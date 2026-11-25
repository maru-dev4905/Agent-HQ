import 'reflect-metadata';
import {
  agentListSchema,
  connectionListSchema,
  eventPageSchema,
  eventViewSchema,
  taskListSchema,
} from '@agent-hq/contracts';
import { createConnectionStore, createDatabaseClient, createEventStore } from '@agent-hq/database';
import { generate } from '@agent-hq/simulator';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { connect as tcpConnect } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runAdmin } from '../src/admin/cli.js';
import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config.js';
import { createHttpAdapter } from '../src/http/fastify.js';
import { StreamService } from '../src/realtime/stream.service.js';

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

let app: NestFastifyApplication;
let baseUrl: string;

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: databaseUrl,
    HEALTH_CHECK_INTERVAL_MS: '0',
    OUTBOX_POLL_INTERVAL_MS: '25',
    // Long, so the tests prove that the outbox relay (not the safety poll) delivers live events.
    SSE_CATCH_UP_INTERVAL_MS: '600000',
  });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forConfig(config)],
  }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(createHttpAdapter(), { logger });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.getHttpAdapter().getInstance().server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  baseUrl = `http://127.0.0.1:${address.port}`;
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
    events: eventStore,
    thresholds: { degradedAfterMs: 30_000, disconnectedAfterMs: 90_000 },
    stdout: (text) => out.push(text),
    now: () => new Date(),
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
  return response.json<{ token: string }>().token;
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

/** Simulator events with keys unique to `tag`, so batches never collide as duplicates. */
function batch(tag: string, seed: number): unknown[] {
  return generate({ scenario: 'single-agent', seed }).map((event) => ({
    ...event,
    idempotencyKey: `${tag}:${event.idempotencyKey}`,
  }));
}

const allSequences = async () =>
  (await eventStore.readFrom('local', 0n, 1000)).map((e) => e.storeSequence.toString());

interface SseMessage {
  id: string;
  event: string;
  data: unknown;
}

/** Minimal SSE client over fetch: collects `agent-event` messages as they arrive. */
function openStream(path: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const messages: SseMessage[] = [];
  let status = 0;
  let contentType = '';
  const ready = fetch(`${baseUrl}${path}`, { headers, signal: controller.signal }).then(
    (response) => {
      status = response.status;
      contentType = response.headers.get('content-type') ?? '';
      if (response.body === null) return;
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      void (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) return;
            buffer += value;
            let end: number;
            while ((end = buffer.indexOf('\n\n')) !== -1) {
              const block = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const fields = Object.fromEntries(
                block
                  .split('\n')
                  .filter((line) => !line.startsWith(':') && line.includes(': '))
                  .map((line) => [
                    line.slice(0, line.indexOf(': ')),
                    line.slice(line.indexOf(': ') + 2),
                  ]),
              );
              if (fields['event'] !== undefined) {
                messages.push({
                  id: fields['id'] ?? '',
                  event: fields['event'],
                  data: JSON.parse(fields['data'] ?? 'null'),
                });
              }
            }
          }
        } catch {
          // aborted
        }
      })();
    },
  );
  return {
    messages,
    ready: () => ready.then(() => ({ status, contentType })),
    async waitFor(count: number, timeoutMs = 5000): Promise<SseMessage[]> {
      const deadline = Date.now() + timeoutMs;
      while (messages.length < count) {
        if (Date.now() > deadline) {
          throw new Error(`expected ${count} messages, got ${messages.length}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return messages;
    },
    close: () => controller.abort(),
  };
}

const ids = (messages: SseMessage[]) => messages.map((m) => m.id);

describe('query API', () => {
  it('serves read models, connections and event pages that match the contract', async () => {
    const token = await connect();
    await ingest(token, generate({ scenario: 'delegation', seed: 5 }));

    const agents = await app.inject({ method: 'GET', url: '/workspaces/local/agents' });
    expect(agents.statusCode).toBe(200);
    expect(agents.headers['cache-control']).toBe('no-store');
    const agentList = agentListSchema.parse(agents.json());
    expect(agentList.agents.length).toBeGreaterThan(1);

    const tasks = taskListSchema.parse(
      (await app.inject({ method: 'GET', url: '/workspaces/local/tasks' })).json(),
    );
    expect(tasks.tasks.length).toBeGreaterThan(0);

    const connections = await app.inject({ method: 'GET', url: '/workspaces/local/connections' });
    const connectionList = connectionListSchema.parse(connections.json());
    expect(connectionList.connections).toHaveLength(1);
    expect(connections.body).not.toContain(token);
    expect(connections.body).not.toContain('tokenHash');

    // Page through the log and get every event exactly once, in order.
    const seen: string[] = [];
    let after = '0';
    for (;;) {
      const page = eventPageSchema.parse(
        (
          await app.inject({
            method: 'GET',
            url: `/workspaces/local/events?after=${after}&limit=4`,
          })
        ).json(),
      );
      seen.push(...page.events.map((e) => e.storeSequence));
      if (page.events.length < 4) {
        expect(page.nextCursor).toBe(seen.at(-1) ?? after);
        break;
      }
      after = page.nextCursor;
    }
    expect(seen).toEqual(await allSequences());
  });

  it('rejects unknown workspaces, invalid queries and foreign Host or Origin', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/workspaces/nope/agents' })).json(),
    ).toMatchObject({ error: { code: 'NOT_FOUND' } });
    await connect();
    for (const query of [
      'after=-1',
      'after=abc',
      'after=9223372036854775808',
      'limit=0',
      'limit=501',
      'limit=1e2',
      'extra=1',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: `/workspaces/local/events?${query}`,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    }
    for (const path of ['/workspaces/local/agents', '/workspaces/local/stream']) {
      const badHost = await app.inject({
        method: 'GET',
        url: path,
        headers: { host: 'evil.example' },
      });
      expect(badHost.statusCode).toBe(403);
      const badOrigin = await app.inject({
        method: 'GET',
        url: path,
        headers: { origin: 'https://evil.example' },
      });
      expect(badOrigin.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    }
  });
});

describe('realtime stream (SSE)', () => {
  it('replays from Last-Event-ID after a disconnect with no gap and no duplicate', async () => {
    const token = await connect();
    await ingest(token, batch('a', 1));
    const before = await allSequences();

    const first = openStream('/workspaces/local/stream?after=0');
    expect(await first.ready()).toEqual({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
    });
    await first.waitFor(before.length);

    // Live: delivered through the outbox relay while connected.
    await ingest(token, batch('b', 2));
    const live = await allSequences();
    await first.waitFor(live.length);
    const firstIds = ids(first.messages);
    expect(firstIds).toEqual(live);
    first.close();

    // Events committed while no client was connected.
    await ingest(token, batch('c', 3));
    await ingest(token, batch('d', 4));

    const second = openStream('/workspaces/local/stream', { 'last-event-id': firstIds.at(-1)! });
    const all = await allSequences();
    await second.waitFor(all.length - firstIds.length);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const resumed = ids(second.messages);
    second.close();

    expect([...firstIds, ...resumed]).toEqual(all);
    expect(new Set([...firstIds, ...resumed]).size).toBe(all.length);
    for (const message of second.messages) {
      expect(message.event).toBe('agent-event');
      expect(eventViewSchema.parse(message.data).storeSequence).toBe(message.id);
    }
  });

  it('delivers every event exactly once while batches are ingested concurrently', async () => {
    const token = await connect();
    const stream = openStream('/workspaces/local/stream?after=0');
    await stream.ready();
    await Promise.all(Array.from({ length: 6 }, (_, i) => ingest(token, batch(`p${i}`, 10 + i))));
    const all = await allSequences();
    await stream.waitFor(all.length);
    await new Promise((resolve) => setTimeout(resolve, 200));
    stream.close();
    expect(ids(stream.messages)).toEqual(all);
  });

  it('starts at the head when no cursor is given and rejects a bad Last-Event-ID', async () => {
    const token = await connect();
    await ingest(token, batch('old', 1));
    const stream = openStream('/workspaces/local/stream');
    await stream.ready();
    await ingest(token, batch('new', 2));
    const fresh = (await eventStore.readFrom('local', 0n, 1000)).filter((e) =>
      e.idempotencyKey.startsWith('new:'),
    );
    await stream.waitFor(fresh.length);
    stream.close();
    expect(ids(stream.messages)).toEqual(fresh.map((e) => e.storeSequence.toString()));

    const bad = await app.inject({
      method: 'GET',
      url: '/workspaces/local/stream',
      headers: { 'last-event-id': 'x1' },
    });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/workspaces/nope/stream' })).statusCode).toBe(
      404,
    );
  });

  it('prefers Last-Event-ID over ?after, and rejects cursors past the head or int64', async () => {
    const token = await connect();
    await ingest(token, batch('a', 1));
    const all = await allSequences();
    const middle = all[2]!;
    const stream = openStream('/workspaces/local/stream?after=0', { 'last-event-id': middle });
    await stream.waitFor(all.length - 3);
    await new Promise((resolve) => setTimeout(resolve, 200));
    stream.close();
    expect(ids(stream.messages)).toEqual(all.slice(3));

    const ahead = await app.inject({
      method: 'GET',
      url: '/workspaces/local/stream',
      headers: { 'last-event-id': String(BigInt(all.at(-1)!) + 1n) },
    });
    expect(ahead.statusCode).toBe(409);
    expect(ahead.json()).toMatchObject({ error: { code: 'CONFLICT' } });
    const huge = await app.inject({
      method: 'GET',
      url: '/workspaces/local/stream',
      headers: { 'last-event-id': '9999999999999999999' },
    });
    expect(huge.statusCode).toBe(400);
  });

  it('does not keep a stream for a client that left before it started', async () => {
    await connect();
    const streams = app.get(StreamService);
    const before = streams.activeStreams;
    const port = Number(new URL(baseUrl).port);
    for (let i = 0; i < 10; i++) {
      await new Promise<void>((resolve) => {
        const socket = tcpConnect(port, '127.0.0.1', () => {
          socket.write('GET /workspaces/local/stream HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
          setTimeout(() => {
            socket.destroy();
            resolve();
          }, 1);
        });
      });
    }
    const deadline = Date.now() + 2000;
    while (streams.activeStreams > before && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(streams.activeStreams).toBe(before);
  });

  it('releases a stream when the client goes away', async () => {
    await connect();
    const streams = app.get(StreamService);
    const before = streams.activeStreams;
    const stream = openStream('/workspaces/local/stream');
    await stream.ready();
    expect(streams.activeStreams).toBe(before + 1);
    stream.close();
    const deadline = Date.now() + 2000;
    while (streams.activeStreams > before && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(streams.activeStreams).toBe(before);
  });
});
