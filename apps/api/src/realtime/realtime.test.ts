import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import type { EventStore, OutboxEntry, OutboxStore, StoredEvent } from '@agent-hq/database';
import { describe, expect, it } from 'vitest';
import { OutboxRelay } from './outbox-relay.js';
import { StreamSession } from './stream-session.js';
import { WorkspaceSignals } from './workspace-signals.js';

const settings = {
  outboxPollIntervalMs: 0,
  maxStreams: 10,
  keepAliveMs: 60_000,
  catchUpIntervalMs: 60_000,
};

class FakeResponse extends EventEmitter {
  chunks: string[] = [];
  writableEnded = false;
  destroyed = false;
  accept = true;
  writeHead(): this {
    return this;
  }
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return this.accept;
  }
  end(): void {
    this.writableEnded = true;
  }
  ids(): string[] {
    return this.chunks.flatMap((c) => (c.startsWith('id: ') ? [c.slice(4, c.indexOf('\n'))] : []));
  }
}

const event = (n: number) =>
  ({
    storeSequence: BigInt(n),
    id: `e${n}`,
    workspaceId: 'w',
    connectionId: 'c',
    type: 'agent.started',
    schemaVersion: 1,
    occurredAt: '2026-11-25T00:00:00.000Z',
    receivedAt: '2026-11-25T00:00:00.000Z',
    idempotencyKey: `k${n}`,
    correlationId: 'corr',
    source: { adapterId: 'a', runtime: 'r', externalAgentId: 'x' },
    payload: {},
  }) as unknown as StoredEvent;

/** An event log whose reads block until released, to interleave wakes with a drain. */
function controllableLog() {
  const log: StoredEvent[] = [];
  const reads: { after: bigint; release: () => void }[] = [];
  const store = {
    readFrom: (_ws: string, after: bigint) =>
      new Promise<StoredEvent[]>((resolve) => {
        reads.push({ after, release: () => resolve(log.filter((e) => e.storeSequence > after)) });
      }),
  } as unknown as EventStore;
  return { log, reads, store };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function session(store: EventStore, response: FakeResponse, signals = new WorkspaceSignals()) {
  const closed: StreamSession[] = [];
  const s = new StreamSession(
    'w',
    0n,
    response as unknown as ServerResponse,
    { events: store, signals, settings, onError: () => undefined },
    (x) => closed.push(x),
  );
  return { s, signals, closed };
}

describe('StreamSession', () => {
  it('re-reads after a drain when woken during it, so no commit is left behind', async () => {
    const { log, reads, store } = controllableLog();
    const response = new FakeResponse();
    const { s, signals } = session(store, response);
    log.push(event(1));
    s.start();
    await tick();
    // A new event commits and its signal arrives while the first read is still in flight.
    log.push(event(2));
    signals.notify('w');
    reads[0]!.release();
    await tick();
    expect(reads).toHaveLength(2);
    expect(reads[1]!.after).toBe(2n);
    reads[1]!.release();
    await tick();
    expect(response.ids()).toEqual(['1', '2']);
    s.close();
  });

  it('waits for drain under backpressure and stops cleanly on close', async () => {
    const { log, reads, store } = controllableLog();
    const response = new FakeResponse();
    response.accept = false;
    const { s, signals, closed } = session(store, response);
    log.push(event(1), event(2));
    s.start();
    await tick();
    reads[0]!.release();
    await tick();
    // The first write was not accepted: nothing more is written until 'drain'.
    expect(response.ids()).toEqual(['1']);
    response.accept = true;
    response.emit('drain');
    await tick();
    expect(response.ids()).toEqual(['1', '2']);
    // Waiting for 'drain' leaves no listeners behind (only the session's own 'close').
    expect(response.listenerCount('drain')).toBe(0);
    expect(response.listenerCount('close')).toBe(1);
    response.emit('close');
    expect(closed).toHaveLength(1);
    expect(response.writableEnded).toBe(true);
    expect(signals.listenerCount('w')).toBe(0);
  });
});

describe('StreamSession — client gone before start', () => {
  it('closes at once instead of leaking timers and a stream slot', () => {
    const { store } = controllableLog();
    const response = new FakeResponse();
    response.destroyed = true;
    const { s, signals, closed } = session(store, response);
    s.start();
    expect(closed).toEqual([s]);
    expect(response.chunks).toEqual([]);
    expect(signals.listenerCount('w')).toBe(0);
  });
});

describe('OutboxRelay', () => {
  it('signals each workspace once per batch and acknowledges what it relayed', async () => {
    let entries: OutboxEntry[] = [
      { storeSequence: 1n, workspaceId: 'a' },
      { storeSequence: 2n, workspaceId: 'b' },
      { storeSequence: 3n, workspaceId: 'a' },
    ];
    const acknowledged: bigint[] = [];
    const outbox: OutboxStore = {
      pending: () => Promise.resolve(entries),
      acknowledge: (seqs) => {
        acknowledged.push(...seqs);
        entries = entries.filter((e) => !seqs.includes(e.storeSequence));
        return Promise.resolve();
      },
    };
    const signals = new WorkspaceSignals();
    const woken: string[] = [];
    signals.subscribe('a', () => woken.push('a'));
    signals.subscribe('b', () => woken.push('b'));
    const relay = new OutboxRelay(outbox, signals, settings);
    expect(await relay.relayOnce()).toBe(3);
    expect(woken).toEqual(['a', 'b']);
    expect(acknowledged).toEqual([1n, 2n, 3n]);
    expect(await relay.relayOnce()).toBe(0);
  });
});
