import { STREAM_EVENT_NAME } from '@agent-hq/contracts';
import { describe, expect, it } from 'vitest';
import { STREAM_EVENT, throttle, WorkspaceStream, type StreamState } from './stream';

class FakeSource {
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  private listeners: ((e: MessageEvent<string>) => void)[] = [];
  constructor(readonly url: string) {}
  addEventListener(_type: string, listener: (e: MessageEvent<string>) => void) {
    this.listeners.push(listener);
  }
  close() {
    this.closed = true;
  }
  emit(sequence: number) {
    this.raw(
      JSON.stringify({
        storeSequence: String(sequence),
        type: 't',
        occurredAt: '2026-11-25T00:00:00.000Z',
        payload: {},
      }),
    );
  }
  raw(data: string) {
    for (const l of this.listeners) l({ data } as MessageEvent<string>);
  }
  fail(readyState: number) {
    this.readyState = readyState;
    this.onerror?.(new Event('error'));
  }
}

function harness(probeStatus: number | Error = 200) {
  const sources: FakeSource[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  const states: StreamState[] = [];
  const received: string[] = [];
  const invalid: string[] = [];
  let opens = 0;
  const stream = new WorkspaceStream(
    '/hq-api/workspaces/local',
    {
      open: (url) => {
        const s = new FakeSource(url);
        sources.push(s);
        return s;
      },
      probe: () =>
        probeStatus instanceof Error ? Promise.reject(probeStatus) : Promise.resolve(probeStatus),
      setTimer: (run, ms) => {
        timers.push({ run, ms });
        return timers.length;
      },
      clearTimer: () => undefined,
    },
    {
      onEvent: (e) => received.push(e.storeSequence),
      onState: (s) => states.push(s),
      onOpen: () => {
        opens += 1;
      },
      onInvalid: (reason) => invalid.push(reason),
    },
  );
  return { stream, sources, timers, states, received, invalid, opens: () => opens };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('WorkspaceStream', () => {
  it('uses the contract event name', () => {
    expect(STREAM_EVENT).toBe(STREAM_EVENT_NAME);
  });

  it('reopens from the last received event when the API was unreachable (review M1)', async () => {
    const h = harness(500);
    h.stream.start(0n);
    const first = h.sources[0]!;
    first.onopen?.(new Event('open'));
    first.emit(1);
    first.emit(2);
    first.fail(2); // closed for good, e.g. proxy answered 500 while the API restarted
    await flush();
    expect(first.closed).toBe(true);
    expect(h.states.at(-1)).toBe('reconnecting');
    expect(h.timers.map((t) => t.ms)).toEqual([1000]);
    h.timers[0]!.run();
    expect(h.sources[1]!.url).toBe('/hq-api/workspaces/local/stream?after=2');
    // Backoff grows while it keeps failing, and resets once a connection opens.
    h.sources[1]!.fail(2);
    await flush();
    expect(h.timers.map((t) => t.ms)).toEqual([1000, 2000]);
    h.timers[1]!.run();
    h.sources[2]!.onopen?.(new Event('open'));
    expect(h.states.at(-1)).toBe('live');
    expect(h.opens()).toBe(2);
    h.sources[2]!.emit(2); // already seen: ignored
    h.sources[2]!.emit(3);
    expect(h.received).toEqual(['1', '2', '3']);
  });

  it('leaves the browser to resume (Last-Event-ID) while the source is still reconnecting', () => {
    const h = harness();
    h.stream.start(0n);
    h.sources[0]!.fail(0); // CONNECTING: the browser retries by itself
    expect(h.states.at(-1)).toBe('reconnecting');
    expect(h.sources).toHaveLength(1);
    expect(h.timers).toHaveLength(0);
  });

  it('asks for a reset instead of retrying when the cursor is ahead of the log (409)', async () => {
    const h = harness(409);
    h.stream.start(5n);
    h.sources[0]!.fail(2);
    await flush();
    expect(h.states.at(-1)).toBe('reset-needed');
    expect(h.timers).toHaveLength(0);
    h.stream.reset();
    expect(h.sources[1]!.url).toBe('/hq-api/workspaces/local/stream?after=0');
  });

  it('retries when the probe itself fails, and stops for good on stop()', async () => {
    const h = harness(new Error('network'));
    h.stream.start(0n);
    h.sources[0]!.fail(2);
    await flush();
    expect(h.timers).toHaveLength(1);
    h.stream.stop();
    h.timers[0]!.run();
    expect(h.sources).toHaveLength(1);
  });
});

describe('WorkspaceStream — message validation', () => {
  it('skips malformed messages, keeps the cursor and reports them', () => {
    const h = harness();
    h.stream.start(0n);
    const source = h.sources[0]!;
    source.emit(1);
    for (const bad of [
      'not json',
      'null',
      '{"storeSequence":"bad","type":"t","occurredAt":"x","payload":{}}',
      '{"storeSequence":"2"}',
    ]) {
      source.raw(bad);
    }
    source.emit(2);
    expect(h.received).toEqual(['1', '2']);
    expect(h.invalid).toHaveLength(4);
  });
});

describe('throttle', () => {
  it('runs once per window however many calls arrive (review M2)', () => {
    const timers: (() => void)[] = [];
    let runs = 0;
    const call = throttle(() => (runs += 1), 500, {
      setTimer: (run) => timers.push(run),
      clearTimer: () => undefined,
    });
    for (let i = 0; i < 50; i++) call();
    expect(timers).toHaveLength(1);
    timers[0]!();
    expect(runs).toBe(1);
    call();
    expect(timers).toHaveLength(2);
    // Cancelled on unmount: the next call schedules again instead of being swallowed.
    call.cancel();
    call();
    expect(timers).toHaveLength(3);
  });
});
