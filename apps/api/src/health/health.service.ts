import { Inject, Injectable } from '@nestjs/common';
import { pingDatabase, type DatabaseClient } from '@agent-hq/database';
import { DATABASE_CLIENT, REDIS_CLIENT } from '../tokens.js';

export type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  dependencies: { database: DependencyStatus; redis: DependencyStatus };
}

/** The parts of the clients the health check needs; keeps the service unit-testable. */
export type DatabasePinger = Pick<DatabaseClient, '$queryRaw'>;
export interface RedisPinger {
  ping(): Promise<string>;
}

const REDIS_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabasePinger,
    @Inject(REDIS_CLIENT) private readonly redis: RedisPinger,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
      dependencies: { database, redis },
    };
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    return (await pingDatabase(this.database)) ? 'up' : 'down';
  }

  private async checkRedis(): Promise<DependencyStatus> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('TIMEOUT'), REDIS_TIMEOUT_MS);
      });
      return (await Promise.race([this.redis.ping(), timeout])) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}
