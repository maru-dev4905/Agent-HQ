import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { hostName } from '../config.js';
import { RequestOriginGuard } from './request-origin.guard.js';

const guard = new RequestOriginGuard({
  allowedHosts: ['127.0.0.1', '::1', 'localhost'],
  allowedOrigins: ['http://127.0.0.1:3000'],
});

function check(headers: Record<string, string | string[] | undefined>): string {
  const ctx = { switchToHttp: () => ({ getRequest: () => ({ headers }) }) };
  try {
    guard.canActivate(ctx as unknown as ExecutionContext);
    return 'allowed';
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenException);
    return (error as ForbiddenException).getResponse() as never;
  }
}

describe('hostName', () => {
  it('drops the port and IPv6 brackets and lower-cases', () => {
    expect(hostName('LocalHost:4000')).toBe('localhost');
    expect(hostName('[::1]:4000')).toBe('::1');
    expect(hostName('127.0.0.1')).toBe('127.0.0.1');
    expect(hostName('::1')).toBe('::1');
  });
});

describe('RequestOriginGuard', () => {
  it('allows loopback hosts without an Origin (sources are not browsers)', () => {
    expect(check({ host: '127.0.0.1:4000' })).toBe('allowed');
    expect(check({ host: '[::1]:4000' })).toBe('allowed');
  });

  it('rejects unknown or missing Host (DNS rebinding)', () => {
    expect(check({ host: 'evil.example:4000' })).toMatchObject({
      error: { code: 'FORBIDDEN', message: 'Host is not allowed' },
    });
    expect(check({ host: 'localhost.evil.example' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(check({})).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('rejects an Origin that is not an exact allowlist match, including "null"', () => {
    expect(check({ host: 'localhost', origin: 'http://127.0.0.1:3000' })).toBe('allowed');
    for (const origin of ['https://evil.example', 'null', 'http://127.0.0.1:3001']) {
      expect(check({ host: 'localhost', origin })).toMatchObject({
        error: { message: 'Origin is not allowed' },
      });
    }
  });
});
