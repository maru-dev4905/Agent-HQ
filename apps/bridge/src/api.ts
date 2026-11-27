import {
  heartbeatResponseSchema,
  registerConnectionResponseSchema,
  type HeartbeatResponse,
  type RegisterConnectionResponse,
} from '@agent-hq/contracts';
import type { Credentials } from './credentials.js';

/**
 * HQ API calls the Bridge makes (ADR-0007 §5, §6). Results are classified so callers can
 * act on them; response bodies are never echoed (they may quote what we sent).
 */

export const ADAPTER_ID = 'claude-code';
export const RUNTIME = 'claude-code';

export type ApiResult<T> =
  | { kind: 'ok'; value: T }
  /** 401: token (or registration code) missing, invalid, revoked or expired. */
  | { kind: 'unauthorized' }
  /** 403 without event issues: Host/Origin refused — the Bridge's API address is wrong. */
  | { kind: 'config'; status: number }
  /** 429/503 or network failure: try again later. */
  | { kind: 'retry'; retryAfterMs?: number; reason: string }
  /** Any other refusal: retrying the same request gives the same answer. */
  | { kind: 'rejected'; status: number };

const LOOPBACK = new Set(['127.0.0.1', '[::1]', 'localhost']);

/**
 * Rejects addresses that could leak the token: credentials in the URL, non-HTTP schemes,
 * and plain HTTP to anything but this machine (TLS may be skipped only on loopback,
 * security §4.3).
 */
export function parseApiUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('--api is not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('--api must use http or https');
  }
  if (url.protocol === 'http:' && !LOOPBACK.has(url.hostname)) {
    throw new Error('--api over http must be a loopback address; use https for other hosts');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('--api must not contain credentials');
  }
  if (url.search !== '' || url.hash !== '')
    throw new Error('--api must not have a query or fragment');
  return url.toString().replace(/\/+$/, '');
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (value === null || !/^\d{1,5}$/.test(value)) return undefined;
  return Number(value) * 1000;
}

async function call<T>(
  doFetch: typeof fetch,
  url: string,
  init: RequestInit,
  parse: (body: unknown) => T,
  timeoutMs: number,
  cancel?: AbortSignal,
): Promise<ApiResult<T>> {
  let response: Response;
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    response = await doFetch(url, {
      ...init,
      signal: cancel === undefined ? timeout : AbortSignal.any([cancel, timeout]),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    return { kind: 'retry', reason: name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }
  if (response.ok) {
    try {
      return { kind: 'ok', value: parse(await response.json()) };
    } catch {
      return { kind: 'rejected', status: response.status };
    }
  }
  // Drain the body without reading it into messages.
  await response.body?.cancel();
  if (response.status === 401) return { kind: 'unauthorized' };
  if (response.status === 403) return { kind: 'config', status: 403 };
  if (response.status === 429 || response.status === 503) {
    const after = retryAfter(response);
    return {
      kind: 'retry',
      reason: `HTTP ${response.status}`,
      ...(after === undefined ? {} : { retryAfterMs: after }),
    };
  }
  if (response.status >= 500) return { kind: 'retry', reason: `HTTP ${response.status}` };
  return { kind: 'rejected', status: response.status };
}

const TIMEOUT_MS = 10_000;

export function register(
  doFetch: typeof fetch,
  apiUrl: string,
  registrationCode: string,
): Promise<ApiResult<RegisterConnectionResponse>> {
  return call(
    doFetch,
    `${apiUrl}/connections`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ registrationCode, adapterId: ADAPTER_ID, runtime: RUNTIME }),
    },
    (body) => registerConnectionResponseSchema.parse(body),
    TIMEOUT_MS,
  );
}

export function heartbeat(
  doFetch: typeof fetch,
  credentials: Credentials,
  cancel?: AbortSignal,
): Promise<ApiResult<HeartbeatResponse>> {
  return call(
    doFetch,
    `${credentials.apiUrl}/connections/${encodeURIComponent(credentials.connectionId)}/heartbeat`,
    { method: 'POST', headers: { authorization: `Bearer ${credentials.token}` } },
    (body) => heartbeatResponseSchema.parse(body),
    TIMEOUT_MS,
    cancel,
  );
}
