import {
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiExceptionFilter } from './api-exception.filter.js';

function run(exception: unknown) {
  const headers: Record<string, string> = {};
  const sent: { status?: number; body?: unknown; headers?: Record<string, string> } = {};
  // Non-enumerable so existing whole-object comparisons keep checking only status and body.
  Object.defineProperty(sent, 'headers', { value: headers, enumerable: false });
  const reply = {
    status(code: number) {
      sent.status = code;
      return reply;
    },
    header(name: string, value: string) {
      headers[name] = value;
      return reply;
    },
    send(body: unknown) {
      sent.body = body;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => reply }) } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  return sent;
}

describe('ApiExceptionFilter', () => {
  it('maps retryable and conflicting statuses to their own codes', () => {
    expect(run(new ConflictException()).body).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(run(new HttpException('slow down', HttpStatus.TOO_MANY_REQUESTS)).body).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    expect(run(new HttpException('nope', HttpStatus.UNSUPPORTED_MEDIA_TYPE)).body).toMatchObject({
      error: { code: 'REQUEST_REJECTED' },
    });
  });

  it('never echoes framework messages that may contain the request URL', () => {
    const sent = run(new NotFoundException('Cannot GET /x?token=secret'));
    expect(sent).toEqual({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Not found' } },
    });
  });

  it('hides unexpected errors behind a generic 500', () => {
    const sent = run(new Error('db password is hunter2'));
    expect(sent).toEqual({
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    });
  });
});

describe('ApiExceptionFilter — busy database (HQ-113)', () => {
  it('answers 503 + Retry-After when the pool or a lock is exhausted outside a transaction', () => {
    for (const error of [
      new Error('timeout exceeded when trying to connect'),
      new Error('canceling statement due to lock timeout'),
    ]) {
      const sent = run(error);
      expect(sent.status).toBe(503);
      expect(sent.headers?.['Retry-After']).toBe('2');
      expect(sent.body).toEqual({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
      });
    }
  });
});
