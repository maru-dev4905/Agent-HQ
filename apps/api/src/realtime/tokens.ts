export interface RealtimeSettings {
  /** How often the outbox is polled for new events; 0 disables the relay (tests drive it). */
  outboxPollIntervalMs: number;
  /** Upper bound of concurrent SSE streams in this process. */
  maxStreams: number;
  /** Interval of `: keep-alive` comments on idle streams. */
  keepAliveMs: number;
  /**
   * Each stream also re-reads from its cursor at this interval, so delivery never depends on
   * the relay alone (e.g. another API process consumed the outbox entry).
   */
  catchUpIntervalMs: number;
}

export const REALTIME_SETTINGS = Symbol('REALTIME_SETTINGS');
export const OUTBOX_STORE = Symbol('OUTBOX_STORE');
