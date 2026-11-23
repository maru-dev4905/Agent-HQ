import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ConnectionHealthService } from './connection-health.service.js';
import { CONNECTION_SETTINGS, type ConnectionSettings } from './tokens.js';

export const CONNECTION_HEALTH_QUEUE = 'connection-health';
const SCHEDULER_ID = 'connection-health-check';

/**
 * BullMQ job that periodically re-evaluates connection health (ADR-0005). The job holds no
 * state: losing Redis only delays evaluation, it never loses events.
 */
@Processor(CONNECTION_HEALTH_QUEUE)
export class ConnectionHealthProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ConnectionHealthProcessor.name);

  constructor(
    @Inject(ConnectionHealthService) private readonly health: ConnectionHealthService,
    @InjectQueue(CONNECTION_HEALTH_QUEUE) private readonly queue: Queue,
    @Inject(CONNECTION_SETTINGS) private readonly settings: ConnectionSettings,
  ) {
    super();
  }

  /**
   * Scheduling must never block startup: without Redis the API still serves heartbeats and
   * ingestion, and evaluation simply resumes once the scheduler can be registered.
   */
  onModuleInit(): void {
    void this.schedule().catch((error: unknown) => {
      this.logger.warn(
        `connection health scheduler not registered: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async schedule(): Promise<void> {
    if (this.settings.healthCheckIntervalMs <= 0) {
      await this.queue.removeJobScheduler(SCHEDULER_ID);
      return;
    }
    await this.queue.upsertJobScheduler(
      SCHEDULER_ID,
      { every: this.settings.healthCheckIntervalMs },
      { name: 'check' },
    );
  }

  async process(): Promise<{ changed: number }> {
    return { changed: await this.health.evaluateAll() };
  }
}
