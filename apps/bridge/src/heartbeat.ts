import type { ApiResult } from './api.js';

/**
 * Heartbeat loop (ADR-0007 §6). Reports the Bridge's own connection, not session liveness
 * (§9). A revoked or expired token stops the loop for good: the user must pair again.
 */

export type HeartbeatState =
  | { kind: 'connected'; at: string }
  | { kind: 'retrying'; reason: string; nextInMs: number }
  /** Host/Origin refused: keep trying at the slowest pace until the address is fixed. */
  | { kind: 'config_error'; nextInMs: number }
  | { kind: 'unauthorized' }
  | { kind: 'stopped' };

export interface HeartbeatDeps {
  send: () => Promise<ApiResult<unknown>>;
  onState: (state: HeartbeatState) => void;
  intervalMs: number;
  maxBackoffMs: number;
  now: () => Date;
  random: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
}

export const DEFAULT_HEARTBEAT = { intervalMs: 15_000, maxBackoffMs: 60_000 } as const;

/** Full jitter: a uniform delay in [0, min(max, base·2^attempt)], at least 1 s. */
export function backoffMs(attempt: number, maxMs: number, random: () => number): number {
  const ceiling = Math.min(maxMs, 1000 * 2 ** attempt);
  return Math.max(1000, Math.floor(random() * ceiling));
}

export class HeartbeatLoop {
  private timer: unknown;
  private failures = 0;
  private running = false;
  /** Bumped on every start/stop, so a beat still in flight from an earlier run is ignored. */
  private generation = 0;

  constructor(private readonly deps: HeartbeatDeps) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    this.schedule(0);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;
    if (this.timer !== undefined) this.deps.clearTimer(this.timer);
    this.timer = undefined;
    this.deps.onState({ kind: 'stopped' });
  }

  private schedule(ms: number): void {
    const generation = this.generation;
    this.timer = this.deps.setTimer(() => void this.beat(generation), ms);
  }

  private async beat(generation: number): Promise<void> {
    this.timer = undefined;
    let result: Awaited<ReturnType<HeartbeatDeps['send']>>;
    try {
      result = await this.deps.send();
    } catch {
      // A bug or unexpected failure in sending must not end the loop silently.
      result = { kind: 'retry', reason: 'internal error' };
    }
    if (!this.running || generation !== this.generation) return;
    switch (result.kind) {
      case 'ok':
        this.failures = 0;
        this.deps.onState({ kind: 'connected', at: this.deps.now().toISOString() });
        this.schedule(this.deps.intervalMs);
        return;
      case 'unauthorized':
        this.running = false;
        this.deps.onState({ kind: 'unauthorized' });
        return;
      case 'config':
        this.deps.onState({ kind: 'config_error', nextInMs: this.deps.maxBackoffMs });
        this.schedule(this.deps.maxBackoffMs);
        return;
      case 'retry':
      case 'rejected': {
        const delay =
          result.kind === 'retry' && result.retryAfterMs !== undefined
            ? Math.max(1000, Math.min(result.retryAfterMs, this.deps.maxBackoffMs))
            : backoffMs(this.failures, this.deps.maxBackoffMs, this.deps.random);
        this.failures += 1;
        const reason = result.kind === 'retry' ? result.reason : `HTTP ${result.status}`;
        this.deps.onState({ kind: 'retrying', reason, nextInMs: delay });
        this.schedule(delay);
        return;
      }
    }
  }
}
