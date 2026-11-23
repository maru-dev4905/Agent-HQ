import { describe, expect, it } from 'vitest';
import { generate } from './generate.js';
import { sendEvents } from './send.js';

function fakeFetch(status = 202) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push({ url, init: init ?? {} });
    return Promise.resolve(new Response(null, { status }));
  };
  return { calls, impl };
}

describe('sendEvents', () => {
  const events = generate({ scenario: 'delegation', seed: 1 });

  it('posts batches with a bearer token and an events envelope', async () => {
    const { calls, impl } = fakeFetch();
    const report = await sendEvents(events, {
      url: 'http://127.0.0.1:4000/ingest',
      token: 't0k',
      batchSize: 5,
      fetch: impl,
    });
    expect(report.events).toBe(events.length);
    expect(report.batches).toBe(Math.ceil(events.length / 5));
    const first = calls[0]!;
    expect(first.init.method).toBe('POST');
    expect((first.init.headers as Record<string, string>)['authorization']).toBe('Bearer t0k');
    expect(typeof first.init.body).toBe('string');
    expect((JSON.parse(first.init.body as string) as { events: unknown[] }).events).toHaveLength(5);
  });

  it('stops at the first rejected batch without echoing the response body', async () => {
    const { calls, impl } = fakeFetch(401);
    await expect(
      sendEvents(events, { url: 'http://x', token: 't', batchSize: 5, fetch: impl }),
    ).rejects.toThrow('HTTP 401');
    expect(calls).toHaveLength(1);
  });

  it('reports a network failure with its cause but without the URL', async () => {
    const failing: typeof fetch = () =>
      Promise.reject(new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') }));
    const error = await sendEvents(events, {
      url: 'http://secret-host:1/x',
      token: 't',
      fetch: failing,
    }).then(
      () => {
        throw new Error('expected a rejection');
      },
      (e: unknown) => e as Error,
    );
    expect(error.message).toBe('Could not reach the ingestion endpoint: connect ECONNREFUSED');
  });

  it('aborts a stalled request after the timeout', async () => {
    const stalled: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const reason: unknown = init.signal?.reason;
          reject(reason instanceof Error ? reason : new Error('aborted'));
        });
      });
    await expect(
      sendEvents(events, { url: 'http://x', token: 't', timeoutMs: 20, fetch: stalled }),
    ).rejects.toThrow('Could not reach the ingestion endpoint: timed out after 20ms');
  });

  it('rejects batch sizes outside the contract limit', async () => {
    await expect(
      sendEvents(events, { url: 'http://x', token: 't', batchSize: 501 }),
    ).rejects.toThrow(RangeError);
  });
});
