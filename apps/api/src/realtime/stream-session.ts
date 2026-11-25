import type { ServerResponse } from 'node:http';
import { STREAM_EVENT_NAME } from '@agent-hq/contracts';
import type { EventStore } from '@agent-hq/database';
import { eventView } from '../query/views.js';
import type { RealtimeSettings } from './tokens.js';
import type { WorkspaceSignals } from './workspace-signals.js';

/** Small pages bound memory per stream (events may be up to 64 KiB each). */
const PAGE = 100;
/** Browsers wait this long before reconnecting after a drop. */
const RETRY_MS = 3000;

export interface StreamDeps {
  events: EventStore;
  signals: WorkspaceSignals;
  settings: RealtimeSettings;
  onError: (error: unknown) => void;
}

/**
 * One SSE connection. It keeps a cursor (the last storeSequence sent) and, whenever it is
 * woken, sends every event after the cursor read from the event store. Because events of a
 * workspace commit in storeSequence order (HQ-104 lock) and only the cursor decides what is
 * sent, a reconnect with `Last-Event-ID` resumes with no gap and no duplicate.
 */
export class StreamSession {
  private closed = false;
  private draining = false;
  private wakeAgain = false;
  private readonly timers: NodeJS.Timeout[] = [];
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly workspaceId: string,
    private cursor: bigint,
    private readonly response: ServerResponse,
    private readonly deps: StreamDeps,
    private readonly onClosed: (session: StreamSession) => void,
  ) {}

  start(): void {
    // The client may have gone away while the request was validated (before `start`):
    // its 'close' event has already fired, so it would never be seen below.
    if (this.response.destroyed || this.response.writableEnded) {
      this.close();
      return;
    }
    this.response.on('close', () => this.close());
    this.response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      // Stops proxies from buffering the stream.
      'x-accel-buffering': 'no',
    });
    this.response.write(`retry: ${RETRY_MS}\n\n`);
    // Subscribe before the first read: an event committed in between still wakes us.
    this.unsubscribe = this.deps.signals.subscribe(this.workspaceId, () => this.wake());
    const { keepAliveMs, catchUpIntervalMs } = this.deps.settings;
    this.timers.push(setInterval(() => this.write(': keep-alive\n\n'), keepAliveMs));
    this.timers.push(setInterval(() => this.wake(), catchUpIntervalMs));
    this.wake();
  }

  /** Reads and sends everything after the cursor; concurrent wakes coalesce into one more pass. */
  wake(): void {
    if (this.closed) return;
    if (this.draining) {
      this.wakeAgain = true;
      return;
    }
    this.draining = true;
    void this.drain()
      .catch((error: unknown) => {
        this.deps.onError(error);
        this.close();
      })
      .finally(() => {
        this.draining = false;
        // A wake that arrived after the last pass checked the flag must not be lost.
        if (this.wakeAgain) this.wake();
      });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.();
    for (const timer of this.timers) clearInterval(timer);
    if (!this.response.writableEnded) this.response.end();
    this.onClosed(this);
  }

  private async drain(): Promise<void> {
    do {
      this.wakeAgain = false;
      for (;;) {
        const page = await this.deps.events.readFrom(this.workspaceId, this.cursor, PAGE);
        for (const event of page) {
          if (this.closed) return;
          const data = JSON.stringify(eventView(event));
          const accepted = this.write(
            `id: ${event.storeSequence}\nevent: ${STREAM_EVENT_NAME}\ndata: ${data}\n\n`,
          );
          this.cursor = event.storeSequence;
          // Respect backpressure from a slow client instead of buffering without bound.
          if (!accepted) await this.writable();
        }
        if (page.length < PAGE) break;
      }
    } while (this.wakeAgain && !this.closed);
  }

  /** Resolves on 'drain' or 'close', removing both listeners either way. */
  private writable(): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        this.response.off('drain', done);
        this.response.off('close', done);
        resolve();
      };
      this.response.on('drain', done);
      this.response.on('close', done);
    });
  }

  private write(chunk: string): boolean {
    if (this.closed || this.response.writableEnded) return true;
    return this.response.write(chunk);
  }
}
