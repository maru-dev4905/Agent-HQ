import { describe, expect, it } from 'vitest';
import { HealthService, type DatabasePinger, type RedisPinger } from './health.service.js';

const dbUp = { $queryRaw: () => Promise.resolve([{ '?column?': 1 }]) } as unknown as DatabasePinger;
const dbDown = {
  $queryRaw: () => Promise.reject(new Error('ECONNREFUSED')),
} as unknown as DatabasePinger;
const redisUp: RedisPinger = { ping: () => Promise.resolve('PONG') };
const redisDown: RedisPinger = { ping: () => Promise.reject(new Error('ECONNREFUSED')) };

describe('HealthService', () => {
  it('is ok only when both dependencies are up', async () => {
    await expect(new HealthService(dbUp, redisUp).check()).resolves.toEqual({
      status: 'ok',
      dependencies: { database: 'up', redis: 'up' },
    });
  });

  it.each([
    [dbDown, redisUp, { database: 'down', redis: 'up' }],
    [dbUp, redisDown, { database: 'up', redis: 'down' }],
    [dbDown, redisDown, { database: 'down', redis: 'down' }],
  ] as const)('is degraded when a dependency fails (%#)', async (db, redis, dependencies) => {
    await expect(new HealthService(db, redis).check()).resolves.toEqual({
      status: 'degraded',
      dependencies,
    });
  });
});
