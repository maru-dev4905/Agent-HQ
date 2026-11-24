import { describe, expect, it } from 'vitest';
import { isLoopbackHost, loadConfig } from './config.js';

const base = { DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x' };

describe('loadConfig', () => {
  it('binds to loopback by default', () => {
    expect(loadConfig(base)).toMatchObject({ host: '127.0.0.1', port: 4000 });
  });

  it('treats an empty or blank API_HOST as unset instead of binding every interface', () => {
    expect(loadConfig({ ...base, API_HOST: '' }).host).toBe('127.0.0.1');
    expect(loadConfig({ ...base, API_HOST: '   ' }).host).toBe('127.0.0.1');
  });

  it('fails fast when a required variable is missing or blank', () => {
    expect(() => loadConfig({ REDIS_URL: 'redis://x' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, REDIS_URL: '' })).toThrow(/REDIS_URL/);
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...base, API_PORT: 'abc' })).toThrow(/API_PORT/);
    expect(() => loadConfig({ ...base, API_PORT: '70000' })).toThrow(/API_PORT/);
  });
});

describe('loadConfig — connections', () => {
  it('uses documented defaults', () => {
    expect(loadConfig(base).connections).toEqual({
      tokenTtlMs: 30 * 86_400_000,
      thresholds: { degradedAfterMs: 30_000, disconnectedAfterMs: 90_000 },
      healthCheckIntervalMs: 10_000,
    });
  });

  it('allows disabling the health job but rejects inconsistent thresholds', () => {
    expect(
      loadConfig({ ...base, HEALTH_CHECK_INTERVAL_MS: '0' }).connections.healthCheckIntervalMs,
    ).toBe(0);
    expect(() => loadConfig({ ...base, HEARTBEAT_DEGRADED_MS: '90000' })).toThrow(/smaller/);
    expect(() => loadConfig({ ...base, CONNECTION_TOKEN_TTL_DAYS: '0' })).toThrow(/positive/);
  });
});

describe('isLoopbackHost', () => {
  it('recognises loopback addresses only', () => {
    expect(['127.0.0.1', '::1', 'localhost'].every(isLoopbackHost)).toBe(true);
    expect(['0.0.0.0', '::', '192.168.0.10'].some(isLoopbackHost)).toBe(false);
  });
});

describe('loadConfig — http and ingestion', () => {
  it('allows only loopback host names and no browser origin by default', () => {
    expect(loadConfig(base).http).toEqual({
      allowedHosts: ['127.0.0.1', '::1', 'localhost'],
      allowedOrigins: [],
    });
  });

  it('adds configured hosts (lower-cased) and origins', () => {
    const { http } = loadConfig({
      ...base,
      API_ALLOWED_HOSTS: ' HQ.local:4000 , ',
      API_ALLOWED_ORIGINS: 'http://127.0.0.1:3000',
    });
    expect(http.allowedHosts).toContain('hq.local');
    expect(http.allowedOrigins).toEqual(['http://127.0.0.1:3000']);
  });

  it('uses documented rate defaults and rejects a burst smaller than one batch', () => {
    expect(loadConfig(base).ingestion).toEqual({ eventsPerSecond: 500, burstEvents: 2000 });
    expect(() => loadConfig({ ...base, INGEST_RATE_BURST_EVENTS: '499' })).toThrow(/batch/);
    expect(() => loadConfig({ ...base, INGEST_RATE_EVENTS_PER_SECOND: '0' })).toThrow(/positive/);
  });
});
