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

describe('isLoopbackHost', () => {
  it('recognises loopback addresses only', () => {
    expect(['127.0.0.1', '::1', 'localhost'].every(isLoopbackHost)).toBe(true);
    expect(['0.0.0.0', '::', '192.168.0.10'].some(isLoopbackHost)).toBe(false);
  });
});
