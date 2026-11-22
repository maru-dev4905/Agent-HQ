export interface ApiConfig {
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
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

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number(optional(env, 'API_PORT') ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`API_PORT must be an integer between 1 and 65535`);
  }
  return {
    // Empty or unset falls back to loopback: an empty host would make Fastify listen on
    // every interface (RSK-005, security T2).
    host: optional(env, 'API_HOST') ?? '127.0.0.1',
    port,
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
  };
}
