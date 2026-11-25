import { DEFAULT_HEARTBEAT_THRESHOLDS } from '@agent-hq/domain';
import { INGEST_LIMITS } from '@agent-hq/contracts';
import type { ConnectionSettings } from './connections/tokens.js';
import type { RateLimitSettings } from './ingestion/rate-limiter.js';
import type { RealtimeSettings } from './realtime/tokens.js';

export interface ApiConfig {
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  connections: ConnectionSettings;
  http: HttpSettings;
  ingestion: RateLimitSettings;
  realtime: RealtimeSettings;
}

export interface HttpSettings {
  /** Host header names (without port) the API answers to (security T3, DNS rebinding). */
  allowedHosts: string[];
  /** Exact `Origin` values allowed. Requests with any other Origin are rejected. */
  allowedOrigins: string[];
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function optional(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = optional(env, key);
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${key} (see .env.example)`);
  }
  return value;
}

function positiveInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  allowZero = false,
): number {
  const raw = optional(env, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${key} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`);
  }
  return value;
}

const DAY_MS = 86_400_000;

/** Timer intervals: Node treats delays above 2^31-1 ms as 1 ms, so cap them at one day. */
function interval(env: NodeJS.ProcessEnv, key: string, fallback: number, allowZero = false) {
  const value = positiveInt(env, key, fallback, allowZero);
  if (value > DAY_MS) throw new Error(`${key} must be at most ${DAY_MS} (one day)`);
  return value;
}
const MAX_TOKEN_TTL_DAYS = 3650;

function tokenTtlDays(env: NodeJS.ProcessEnv): number {
  const days = positiveInt(env, 'CONNECTION_TOKEN_TTL_DAYS', 30);
  if (days > MAX_TOKEN_TTL_DAYS) {
    throw new Error(`CONNECTION_TOKEN_TTL_DAYS must be at most ${MAX_TOKEN_TTL_DAYS}`);
  }
  return days;
}

function list(env: NodeJS.ProcessEnv, key: string): string[] {
  return (optional(env, key) ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/** Host header or configured host without its port, lower-cased; `[::1]:4000` → `::1`. */
export function hostName(header: string): string {
  const value = header.trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? value : value.slice(1, end);
  }
  // A bare IPv6 address has several colons and no port.
  if (value.indexOf(':') !== value.lastIndexOf(':')) return value;
  const colon = value.indexOf(':');
  return colon === -1 ? value : value.slice(0, colon);
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number(optional(env, 'API_PORT') ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`API_PORT must be an integer between 1 and 65535`);
  }
  const config = {
    // Empty or unset falls back to loopback: an empty host would make Fastify listen on
    // every interface (RSK-005, security T2).
    host: optional(env, 'API_HOST') ?? '127.0.0.1',
    port,
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    connections: {
      tokenTtlMs: tokenTtlDays(env) * DAY_MS,
      thresholds: {
        degradedAfterMs: positiveInt(
          env,
          'HEARTBEAT_DEGRADED_MS',
          DEFAULT_HEARTBEAT_THRESHOLDS.degradedAfterMs,
        ),
        disconnectedAfterMs: positiveInt(
          env,
          'HEARTBEAT_DISCONNECTED_MS',
          DEFAULT_HEARTBEAT_THRESHOLDS.disconnectedAfterMs,
        ),
      },
      healthCheckIntervalMs: positiveInt(env, 'HEALTH_CHECK_INTERVAL_MS', 10_000, true),
    },
    http: {
      // Ports are ignored on both sides: `hq.local:4000` in the setting still matches.
      allowedHosts: [...LOOPBACK_HOSTS, ...list(env, 'API_ALLOWED_HOSTS')].map(hostName),
      allowedOrigins: list(env, 'API_ALLOWED_ORIGINS'),
    },
    ingestion: {
      eventsPerSecond: positiveInt(env, 'INGEST_RATE_EVENTS_PER_SECOND', 500),
      burstEvents: positiveInt(env, 'INGEST_RATE_BURST_EVENTS', 2000),
    },
    realtime: {
      outboxPollIntervalMs: interval(env, 'OUTBOX_POLL_INTERVAL_MS', 200, true),
      maxStreams: positiveInt(env, 'SSE_MAX_STREAMS', 100),
      keepAliveMs: interval(env, 'SSE_KEEP_ALIVE_MS', 15_000),
      catchUpIntervalMs: interval(env, 'SSE_CATCH_UP_INTERVAL_MS', 5_000),
    },
  };
  if (config.ingestion.burstEvents < INGEST_LIMITS.maxBatchEvents) {
    // Otherwise a full batch could never pass the limiter.
    throw new Error(
      `INGEST_RATE_BURST_EVENTS must be at least ${INGEST_LIMITS.maxBatchEvents} (the batch limit)`,
    );
  }
  const { degradedAfterMs, disconnectedAfterMs } = config.connections.thresholds;
  if (degradedAfterMs >= disconnectedAfterMs) {
    throw new Error('HEARTBEAT_DEGRADED_MS must be smaller than HEARTBEAT_DISCONNECTED_MS');
  }
  return config;
}
