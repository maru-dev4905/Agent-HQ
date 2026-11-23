import { DEFAULT_HEARTBEAT_THRESHOLDS } from '@agent-hq/domain';
import type { ConnectionSettings } from './connections/tokens.js';

export interface ApiConfig {
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  connections: ConnectionSettings;
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
const MAX_TOKEN_TTL_DAYS = 3650;

function tokenTtlDays(env: NodeJS.ProcessEnv): number {
  const days = positiveInt(env, 'CONNECTION_TOKEN_TTL_DAYS', 30);
  if (days > MAX_TOKEN_TTL_DAYS) {
    throw new Error(`CONNECTION_TOKEN_TTL_DAYS must be at most ${MAX_TOKEN_TTL_DAYS}`);
  }
  return days;
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
  };
  const { degradedAfterMs, disconnectedAfterMs } = config.connections.thresholds;
  if (degradedAfterMs >= disconnectedAfterMs) {
    throw new Error('HEARTBEAT_DEGRADED_MS must be smaller than HEARTBEAT_DISCONNECTED_MS');
  }
  return config;
}
