import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { createDatabaseClient, createEventStore, type DatabaseClient } from '@agent-hq/database';
import { Redis } from 'ioredis';
import type { ApiConfig } from './config.js';
import { API_CONFIG, DATABASE_CLIENT, EVENT_STORE, REDIS_CLIENT } from './tokens.js';

function createRedisClient(url: string): Redis {
  const logger = new Logger('Redis');
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  let lastError: string | undefined;
  // Without a listener ioredis prints every reconnect failure as an unhandled error.
  client.on('error', (error: Error) => {
    if (error.message !== lastError) {
      lastError = error.message;
      logger.warn(`Redis unavailable: ${error.message}`);
    }
  });
  client.on('ready', () => {
    lastError = undefined;
  });
  return client;
}

/**
 * Shared clients for PostgreSQL (durable events) and Redis (BullMQ jobs only, ADR-0005), and
 * the single EventStore every module appends through. Clients are created by factories so
 * they exist only once Nest instantiates the module.
 */
@Global()
@Module({})
export class InfrastructureModule implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  static forConfig(config: ApiConfig) {
    return {
      module: InfrastructureModule,
      imports: [BullModule.forRoot({ connection: { url: config.redisUrl } })],
      providers: [
        { provide: API_CONFIG, useValue: config },
        {
          provide: DATABASE_CLIENT,
          useFactory: (cfg: ApiConfig) => createDatabaseClient(cfg.databaseUrl),
          inject: [API_CONFIG],
        },
        {
          provide: REDIS_CLIENT,
          useFactory: (cfg: ApiConfig) => createRedisClient(cfg.redisUrl),
          inject: [API_CONFIG],
        },
        {
          provide: EVENT_STORE,
          useFactory: (db: DatabaseClient) => createEventStore(db),
          inject: [DATABASE_CLIENT],
        },
      ],
      exports: [API_CONFIG, DATABASE_CLIENT, REDIS_CLIENT, EVENT_STORE, BullModule],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.database.$disconnect(), this.redis.quit()]);
  }
}
