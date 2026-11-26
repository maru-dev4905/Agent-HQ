import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import {
  createConnectionStore,
  createDatabaseClient,
  createEventStore,
  type EventStore,
} from '@agent-hq/database';
import type { IncomingAgentEvent } from '@agent-hq/events';
import { generateLoad } from '@agent-hq/simulator';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAdmin } from '../../src/admin/cli.js';
import { AppModule } from '../../src/app.module.js';
import { loadConfig } from '../../src/config.js';
import { GapDetectionService } from '../../src/gap-detection/gap-detection.service.js';
import { createHttpAdapter } from '../../src/http/fastify.js';
import { replayProjections } from '../../src/projection/projection.service.js';

/**
 * Load measurement for RES-005 / HQ-112 (NFR-002, NFR-003). It records numbers; the only
 * assertions are sanity checks (no duplicate stored, nothing missed or repeated on a stream).
 * Runs against the integration test database with an in-process API. Runtime settings are
 * pinned to the documented defaults (outbox relay 200 ms); only the rate limit is raised so the
 * limiter is not what gets measured. Event counts in the report are the counts actually sent.
 * The report goes to stdout and, if LOAD_REPORT is set, to that file.
 */

const databaseUrl = process.env['TEST_DATABASE_URL'];
if (databaseUrl === undefined)
  throw new Error('TEST_DATABASE_URL is set by test/integration-setup.ts');

const db = createDatabaseClient(databaseUrl);
const store: EventStore = createEventStore(db);
const quiet = () => undefined;
const logger = {
  log: quiet,
  error: quiet,
  warn: quiet,
  debug: quiet,
  verbose: quiet,
  fatal: quiet,
};
const report: Record<string, unknown> = {};

let app: NestFastifyApplication;
let baseUrl: string;

const now = () => performance.now();
function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    n: sorted.length,
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(sorted.at(-1)!),
    mean: round(sorted.reduce((sum, v) => sum + v, 0) / sorted.length),
  };
}

beforeAll(async () => {
  // Only connection settings come from the environment; runtime settings are pinned so a
  // local .env cannot change what is measured.
  const config = loadConfig({
    DATABASE_URL: databaseUrl,
    REDIS_URL: process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379',
    OUTBOX_POLL_INTERVAL_MS: '200',
    SSE_KEEP_ALIVE_MS: '15000',
    SSE_CATCH_UP_INTERVAL_MS: '5000',
    HEALTH_CHECK_INTERVAL_MS: '0',
    GAP_CHECK_INTERVAL_MS: '0',
    INGEST_RATE_EVENTS_PER_SECOND: '1000000',
    INGEST_RATE_BURST_EVENTS: '1000000',
  });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forConfig(config)],
  }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(createHttpAdapter(), { logger });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.getHttpAdapter().getInstance().server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  baseUrl = `http://127.0.0.1:${address.port}`;
  await db.$executeRawUnsafe(
    'TRUNCATE agent_current_state, task_current_state, event_outbox, events, agent_instances, tasks, connections, registration_codes, workspaces RESTART IDENTITY CASCADE',
  );
  const pg = await db.$queryRawUnsafe<{ server_version: string }[]>('SHOW server_version');
  report['environment'] = {
    at: new Date().toISOString(),
    node: process.version,
    cpu: cpus()[0]?.model,
    cores: cpus().length,
    memoryGiB: Math.round(totalmem() / 2 ** 30),
    postgres: pg[0]?.server_version,
    note: 'single process, API and PostgreSQL on the same machine (Docker), default pool',
    loadAverageAtStart: loadavg().map((v) => Math.round(v * 10) / 10),
    freeMemoryMiBAtStart: Math.round(freemem() / 2 ** 20),
  };
});

afterAll(async () => {
  report['failuresRetried'] = retried;
  report['loadAverageAtEnd'] = loadavg().map((v) => Math.round(v * 10) / 10);
  const text = JSON.stringify(report, null, 2);
  console.log(`\n===== HQ-112 LOAD REPORT =====\n${text}\n`);
  if (process.env['LOAD_REPORT'] !== undefined) writeFileSync(process.env['LOAD_REPORT'], text);
  await app.close();
  await db.$disconnect();
});

async function connect(): Promise<string> {
  const out: string[] = [];
  await runAdmin(['registration-code'], {
    store: createConnectionStore(db),
    events: store,
    thresholds: { degradedAfterMs: 30_000, disconnectedAfterMs: 90_000 },
    stdout: (text) => out.push(text),
    now: () => new Date(),
  });
  const response = await fetch(`${baseUrl}/connections`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      registrationCode: out.join('').split('\n')[0],
      adapterId: 'simulator',
      runtime: 'simulator',
    }),
  });
  return ((await response.json()) as { token: string }).token;
}

interface PostResult {
  status: number;
  ms: number;
  /** `ok`, or the error envelope's code and message. */
  detail: string;
  body: unknown;
}

async function post(token: string, events: unknown[]): Promise<PostResult> {
  const started = now();
  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ events }),
  });
  const text = await response.text();
  const ms = now() - started;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
  const detail =
    response.status === 200 ? 'ok' : `${error?.code ?? '?'}: ${error?.message ?? 'no body'}`;
  return { status: response.status, ms, detail, body };
}

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

const retried: Record<string, number> = {};
/**
 * Sends a batch like an adapter would: a failed request is retried (ingestion is idempotent).
 * Every failure is counted in the report instead of stopping the measurement.
 */
async function postWithRetry(token: string, events: unknown[], phase: string): Promise<PostResult> {
  for (let attempt = 1; ; attempt++) {
    const r = await post(token, events);
    if (r.status === 200 || attempt === 5) {
      if (r.status !== 200) throw new Error(`${phase}: gave up after 5 attempts (${r.detail})`);
      return r;
    }
    const key = `${phase} → ${r.status} ${r.detail}`;
    retried[key] = (retried[key] ?? 0) + 1;
  }
}

/** Minimal SSE reader: arrival time per storeSequence, plus the raw order to spot repeats. */
function openStream(query: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const arrivals = new Map<string, number>();
  const order: string[] = [];
  let buffer = '';
  const done = fetch(`${baseUrl}/workspaces/local/stream${query}`, {
    headers,
    signal: controller.signal,
  }).then(async (response) => {
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    try {
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) return;
        buffer += value;
        let cut: number;
        while ((cut = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const id = /^id: (\d+)$/m.exec(block)?.[1];
          if (id !== undefined) {
            order.push(id);
            arrivals.set(id, now());
          }
        }
      }
    } catch {
      // aborted
    }
  });
  return {
    arrivals,
    order,
    async until(count: number, timeoutMs = 120_000) {
      const deadline = Date.now() + timeoutMs;
      while (arrivals.size < count) {
        if (Date.now() > deadline) {
          throw new Error(`stream: ${arrivals.size}/${count} after ${timeoutMs}ms`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    close: () => {
      controller.abort();
      return done;
    },
  };
}

const allSequences = async () => {
  const out: string[] = [];
  let after = 0n;
  for (;;) {
    const page = await store.readFrom('local', after, 1000);
    out.push(...page.map((e) => e.storeSequence.toString()));
    if (page.length < 1000) return out;
    after = page.at(-1)!.storeSequence;
  }
};

let seed = 1000;
/** Exactly `count` events from fresh runs (a run averages ~15 events, so generate until enough). */
function eventsOf(count: number, duplicateRate?: number): IncomingAgentEvent[] {
  const events: IncomingAgentEvent[] = [];
  while (events.length < count) {
    events.push(
      ...generateLoad({
        runs: 10,
        seed,
        ...(duplicateRate === undefined ? {} : { duplicateRate }),
      }),
    );
    seed += 10;
  }
  return events.slice(0, count);
}

describe('HQ-112 load measurement', () => {
  it('ingestion latency by batch size (sequential requests, one connection)', async () => {
    const token = await connect();
    const result: Record<string, unknown> = {};
    for (const [batch, requests] of [
      [1, 300],
      [50, 60],
      [500, 12],
    ] as const) {
      const events = eventsOf(batch * requests);
      const times: number[] = [];
      const started = now();
      let failed = 0;
      for (const chunk of chunks(events, batch)) {
        const r = await post(token, chunk);
        times.push(r.ms);
        if (r.status !== 200) {
          failed += 1;
          const key = `ingestion batch_${batch} → ${r.status} ${r.detail}`;
          retried[key] = (retried[key] ?? 0) + 1;
          await postWithRetry(token, chunk, `ingestion batch_${batch} retry`);
        }
      }
      const seconds = (now() - started) / 1000;
      result[`batch_${batch}`] = {
        events: events.length,
        failedRequests: failed,
        requestMs: stats(times),
        eventsPerSecond: Math.round(events.length / seconds),
      };
    }
    report['ingestionLatency'] = result;
  });

  it('concurrent 500-event batches in one workspace (RSK-019)', async () => {
    const result: Record<string, unknown> = {};
    for (const parallel of [2, 5, 10, 20]) {
      const tokens = await Promise.all(Array.from({ length: parallel }, () => connect()));
      const batches = tokens.map(() => eventsOf(500));
      const started = now();
      // Failed batches are not retried here (rolled back, nothing stored); later steps re-read
      // the log from the database, so their counts stay exact.
      const outcomes = await Promise.all(tokens.map((token, i) => post(token, batches[i]!)));
      const statuses: Record<string, number> = {};
      const failures: Record<string, number> = {};
      for (const o of outcomes) {
        statuses[o.status] = (statuses[o.status] ?? 0) + 1;
        if (o.status !== 200) failures[o.detail] = (failures[o.detail] ?? 0) + 1;
      }
      result[`parallel_${parallel}`] = {
        eventsPerRequest: batches[0]!.length,
        statuses,
        failures,
        wallMs: Math.round(now() - started),
        requestMs: stats(outcomes.map((o) => o.ms)),
      };
    }
    report['concurrentFullBatches'] = result;
  });

  it('dashboard update latency: request start → SSE arrival (low load)', async () => {
    const token = await connect();
    const stream = openStream('');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const events = eventsOf(100);
    const sent = new Map<string, number>();
    for (const event of events) {
      const started = now();
      const r = await postWithRetry(token, [event], 'dashboard latency');
      const body = r.body as { results: { storeSequence: string }[] };
      sent.set(body.results[0]!.storeSequence, started);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await stream.until(events.length);
    await stream.close();
    expect(new Set(stream.order).size).toBe(stream.order.length);
    const latencies = [...sent].map(([seq, started]) => stream.arrivals.get(seq)! - started);
    report['dashboardUpdateLatency'] = {
      events: events.length,
      requestToSseMs: stats(latencies),
      note: 'one event per request every ~50 ms, no competing writers; includes HTTP and the outbox relay poll (200 ms); Dashboard render not included',
    };
  });

  it('duplicate rate: duplicates are acknowledged, never stored twice', async () => {
    const token = await connect();
    const events = eventsOf(800, 0.3);
    const unique = new Set(events.map((e) => e.idempotencyKey)).size;
    const before = (await allSequences()).length;
    const counts = { stored: 0, duplicate: 0 };
    for (const chunk of chunks(events, 100)) {
      const r = await postWithRetry(token, chunk, 'duplicate rate');
      const body = r.body as { results: { status: 'stored' | 'duplicate' }[] };
      for (const item of body.results) counts[item.status] += 1;
    }
    const storedRows = (await allSequences()).length - before;
    expect(storedRows).toBe(unique);
    report['duplicateRate'] = {
      sent: events.length,
      uniqueKeys: unique,
      sentDuplicateRate: Math.round(((events.length - unique) / events.length) * 1000) / 1000,
      responses: counts,
      storedRows,
      duplicatesStored: storedRows - unique,
    };
  });

  it('reconnect recovery: events missed while disconnected', async () => {
    const token = await connect();
    const result: Record<string, unknown> = {};
    for (const missed of [1000, 5000]) {
      const events = eventsOf(missed);
      const last = (await allSequences()).at(-1) ?? '0';
      for (const chunk of chunks(events, 500)) await postWithRetry(token, chunk, 'reconnect setup');
      const expected = (await allSequences()).filter((s) => BigInt(s) > BigInt(last));
      const started = now();
      const stream = openStream('', { 'last-event-id': last });
      await stream.until(expected.length);
      const ms = now() - started;
      await stream.close();
      // In order, nothing missing, nothing delivered twice.
      expect(stream.order.slice(0, expected.length)).toEqual(expected);
      expect(new Set(stream.order).size).toBe(stream.order.length);
      result[`missed_${missed}`] = {
        events: expected.length,
        recoveryMs: Math.round(ms),
        eventsPerSecond: Math.round(expected.length / (ms / 1000)),
      };
    }
    report['reconnectRecovery'] = result;
  });

  it('log-size dependent work: replay, gap detection, full SSE replay (TD-005, TD-008, TD-010)', async () => {
    const token = await connect();
    let total = (await allSequences()).length;
    while (total < 50_000) {
      await postWithRetry(token, eventsOf(500), 'log growth');
      total += 500;
    }

    let started = now();
    const applied = await replayProjections(store, 'local');
    // (total is re-read below, after gap records are written)
    const replayMs = now() - started;

    // First run records every hole the load scenarios left (backlog); the second has nothing
    // left to record, which is what each periodic run costs in steady state.
    const detector = app.get(GapDetectionService);
    const later = new Date(Date.now() + 3_600_000);
    started = now();
    const backlogRecorded = await detector.detectOnce(later);
    const gapBacklogMs = now() - started;
    started = now();
    const steadyRecorded = await detector.detectOnce(later);
    const gapSteadyMs = now() - started;

    // Gap records written above are part of the log too.
    total = (await allSequences()).length;
    started = now();
    const stream = openStream('?after=0');
    await stream.until(total, 600_000);
    const sseReplayMs = now() - started;
    await stream.close();
    expect(new Set(stream.order).size).toBe(stream.order.length);

    report['logSize'] = {
      events: total,
      projectionReplay: { applied, ms: Math.round(replayMs), adr0002Limit: '60000 ms' },
      gapDetection: {
        backlog: { recorded: backlogRecorded, ms: Math.round(gapBacklogMs) },
        steadyState: { recorded: steadyRecorded, ms: Math.round(gapSteadyMs) },
      },
      sseFullReplay: {
        ms: Math.round(sseReplayMs),
        eventsPerSecond: Math.round(total / (sseReplayMs / 1000)),
      },
    };
  });
});
