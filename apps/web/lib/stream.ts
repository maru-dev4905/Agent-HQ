import type { EventView } from '@agent-hq/contracts';

/**
 * Must equal `STREAM_EVENT_NAME` in @agent-hq/contracts (a test pins it). Imported as a
 * literal so the contracts runtime (zod) stays out of the browser bundle.
 */
export const STREAM_EVENT = 'agent-event';

export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'reset-needed';

interface EventSourceLike {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export interface StreamDeps {
  open: (url: string) => EventSourceLike;
  /** Used only to tell "cursor ahead of the log" (409) apart from "API unreachable". */
  probe: (url: string) => Promise<number>;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
}

export interface StreamCallbacks {
  onEvent: (event: EventView) => void;
  onState: (state: StreamState) => void;
  /** Called when the stream (re)opens: read models may have changed while it was down. */
  onOpen: () => void;
  /** A message that is not a valid event; it is skipped and the cursor is kept. */
  onInvalid: (reason: string) => void;
}

const CLOSED = 2;
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];

/**
 * Keeps one SSE stream to the workspace alive. The browser's EventSource reconnects by
 * itself (with Last-Event-ID) only after a dropped connection; any non-200 answer — which
 * is what the proxy returns while the API is down — closes it for good. In that case this
 * reopens it with backoff from the last received `storeSequence`, so nothing is missed or
 * repeated. A 409 means the cursor is ahead of the log (database reset): that needs a
 * reset, not a retry. Limit: if the log was reset and has grown past the old cursor before
 * the reconnect, the cursor cannot tell, and the events up to it are skipped (cursor-only
 * contract, architecture N7).
 */
export class WorkspaceStream {
  private source: EventSourceLike | undefined;
  private timer: unknown;
  private attempt = 0;
  private last = 0n;
  private stopped = false;

  constructor(
    private readonly baseUrl: string,
    private readonly deps: StreamDeps,
    private readonly callbacks: StreamCallbacks,
  ) {}

  start(after = 0n): void {
    this.last = after;
    this.connect('connecting');
  }

  /** Starts over from the beginning of the log (after a reset). */
  reset(): void {
    this.closeSource();
    this.attempt = 0;
    this.start(0n);
  }

  stop(): void {
    this.stopped = true;
    this.closeSource();
  }

  private url(): string {
    return `${this.baseUrl}/stream?after=${this.last}`;
  }

  private connect(state: StreamState): void {
    if (this.stopped) return;
    this.callbacks.onState(state);
    const source = this.deps.open(this.url());
    this.source = source;
    source.onopen = () => {
      this.attempt = 0;
      this.callbacks.onState('live');
      this.callbacks.onOpen();
    };
    source.onerror = () => {
      if (source !== this.source) return;
      if (source.readyState === CLOSED) void this.recover();
      else this.callbacks.onState('reconnecting');
    };
    source.addEventListener(STREAM_EVENT, (message) => {
      const event = parseEvent(message.data);
      if (event === null) {
        this.callbacks.onInvalid('형식이 잘못된 Event 메시지를 받아 건너뛰었습니다');
        return;
      }
      const sequence = BigInt(event.storeSequence);
      if (sequence <= this.last) return;
      this.last = sequence;
      this.callbacks.onEvent(event);
    });
  }

  private async recover(): Promise<void> {
    this.closeSource();
    if (this.stopped) return;
    this.callbacks.onState('reconnecting');
    // An unreachable API (probe throws) is retried like any other failure.
    const status = await this.deps.probe(this.url()).catch(() => 0);
    if (this.stopped) return;
    if (status === 409) {
      this.callbacks.onState('reset-needed');
      return;
    }
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)] ?? 30_000;
    this.attempt += 1;
    this.timer = this.deps.setTimer(() => this.connect('reconnecting'), delay);
  }

  private closeSource(): void {
    this.deps.clearTimer(this.timer);
    this.timer = undefined;
    this.source?.close();
    this.source = undefined;
  }
}

const CURSOR = /^(0|[1-9][0-9]{0,18})$/;

/**
 * Minimal runtime check of a stream message (boundary validation). The full contract schema
 * would pull zod into the bundle; these are the fields the dashboard relies on.
 */
export function parseEvent(data: string): EventView | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const event = value as Record<string, unknown>;
  const ok =
    typeof event['storeSequence'] === 'string' &&
    CURSOR.test(event['storeSequence']) &&
    typeof event['type'] === 'string' &&
    typeof event['occurredAt'] === 'string' &&
    typeof event['payload'] === 'object' &&
    event['payload'] !== null;
  // Safe: the fields the dashboard reads were checked above.
  return ok ? (value as EventView) : null;
}

/** Longest wait for the probe's answer; the proxy's own 30 s idle limit is not relied on. */
const PROBE_TIMEOUT_MS = 5000;

/** Browser implementations of the stream dependencies. */
export function browserStreamDeps(): StreamDeps {
  return {
    // EventSource matches EventSourceLike structurally.
    open: (url) => new EventSource(url),
    probe: async (url) => {
      const controller = new AbortController();
      // A timeout rejects, which recover() treats like an unreachable API (retry).
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        return response.status;
      } finally {
        clearTimeout(timer);
        controller.abort(); // only the status matters; do not keep a second stream open
      }
    },
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (timer) => clearTimeout(timer as number | undefined),
  };
}

/**
 * Runs `run` at most once per `ms` while calls keep coming (throttle, not debounce: a steady
 * event stream must not postpone the refresh forever).
 */
export function throttle(
  run: () => void,
  ms: number,
  deps: Pick<StreamDeps, 'setTimer' | 'clearTimer'>,
) {
  let timer: unknown;
  let pending = false;
  const call = () => {
    if (pending) return;
    pending = true;
    timer = deps.setTimer(() => {
      pending = false;
      run();
    }, ms);
  };
  /** Drops a scheduled run (on unmount). */
  call.cancel = () => {
    deps.clearTimer(timer);
    pending = false;
  };
  return call;
}
