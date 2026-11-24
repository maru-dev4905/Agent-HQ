export interface RateLimitSettings {
  /** Sustained events per second per connection. */
  eventsPerSecond: number;
  /** Bucket size: the largest burst a connection may send at once. */
  burstEvents: number;
}

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Per-connection token bucket counted in events, not requests (security T8: a runaway local
 * process). In memory: correct for the single API process of the local self-host (TD-006).
 */
export class EventRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly settings: RateLimitSettings,
    private readonly now: () => number,
  ) {}

  take(connectionId: string, events: number): RateDecision {
    const { eventsPerSecond, burstEvents } = this.settings;
    const now = this.now();
    const bucket = this.buckets.get(connectionId) ?? { tokens: burstEvents, updatedAt: now };
    const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1000;
    const tokens = Math.min(burstEvents, bucket.tokens + elapsedSeconds * eventsPerSecond);
    if (events > tokens) {
      this.buckets.set(connectionId, { tokens, updatedAt: now });
      // A request larger than the bucket can never pass; the wait is reported for a full bucket.
      const missing = Math.min(events, burstEvents) - tokens;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(missing / eventsPerSecond)),
      };
    }
    this.buckets.set(connectionId, { tokens: tokens - events, updatedAt: now });
    return { allowed: true };
  }
}
