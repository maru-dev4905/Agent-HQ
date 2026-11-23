import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionHealthProcessor } from './connection-health.processor.js';
import type { ConnectionSettings } from './tokens.js';

const settings: ConnectionSettings = {
  tokenTtlMs: 1,
  thresholds: { degradedAfterMs: 30_000, disconnectedAfterMs: 90_000 },
  healthCheckIntervalMs: 10_000,
};

function processorWith(queue: {
  upsertJobScheduler: () => Promise<unknown>;
  removeJobScheduler: () => Promise<unknown>;
}) {
  return new ConnectionHealthProcessor(
    { evaluateAll: () => Promise.resolve(0) } as never,
    queue as never,
    settings,
  );
}

describe('ConnectionHealthProcessor scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps retrying registration with backoff until Redis accepts it', async () => {
    let attempts = 0;
    const upsertJobScheduler = vi.fn(() => {
      attempts += 1;
      return attempts < 3 ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve({});
    });
    const processor = processorWith({ upsertJobScheduler, removeJobScheduler: vi.fn() });
    processor.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(attempts).toBe(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempts).toBe(3);
  });

  it('stops retrying once the module is destroyed', async () => {
    const upsertJobScheduler = vi.fn(() => Promise.reject(new Error('down')));
    const processor = processorWith({ upsertJobScheduler, removeJobScheduler: vi.fn() });
    processor.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    processor.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
  });
});
