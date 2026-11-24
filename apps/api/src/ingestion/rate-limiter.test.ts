import { describe, expect, it } from 'vitest';
import { EventRateLimiter } from './rate-limiter.js';

describe('EventRateLimiter', () => {
  it('allows a burst, then refills at the sustained rate per connection', () => {
    let now = 0;
    const limiter = new EventRateLimiter({ eventsPerSecond: 10, burstEvents: 20 }, () => now);
    expect(limiter.take('a', 20)).toEqual({ allowed: true });
    expect(limiter.take('a', 1)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    // Another connection has its own bucket.
    expect(limiter.take('b', 20)).toEqual({ allowed: true });
    now = 500;
    expect(limiter.take('a', 5)).toEqual({ allowed: true });
    expect(limiter.take('a', 10)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    now = 10_000;
    // Never more than the burst, however long the idle time.
    expect(limiter.take('a', 20)).toEqual({ allowed: true });
    expect(limiter.take('a', 1).allowed).toBe(false);
  });

  it('reports the wait in whole seconds, at least 1', () => {
    const limiter = new EventRateLimiter({ eventsPerSecond: 2, burstEvents: 10 }, () => 0);
    limiter.take('a', 10);
    expect(limiter.take('a', 7)).toEqual({ allowed: false, retryAfterSeconds: 4 });
  });
});
