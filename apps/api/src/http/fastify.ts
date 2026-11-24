import { INGEST_LIMITS } from '@agent-hq/contracts';
import { FastifyAdapter } from '@nestjs/platform-fastify';

/**
 * The HTTP adapter used by the server and by tests, so both enforce the same body limit
 * (security T8). Fastify answers a larger body with 413 before any handler runs.
 */
export function createHttpAdapter(): FastifyAdapter {
  return new FastifyAdapter({ bodyLimit: INGEST_LIMITS.maxRequestBytes });
}
