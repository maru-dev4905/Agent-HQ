import { Inject, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ConnectionHealthService } from './connection-health.service.js';
import { CONNECTION_SETTINGS, type ConnectionSettings } from './tokens.js';

export const CONNECTION_HEALTH_QUEUE = 'connection-health';
const SCHEDULER_ID = 'connection-health-check';
const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 60_000;

/**
 * BullMQ job that periodically re-evaluates connection health (ADR-0005). The job holds no
 * state: losing Redis only delays evaluation, it never loses events.
 */
@Processor(CONNECTION_HEALTH_QUEUE)
export class ConnectionHealthProcessor extends WorkerHost implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionHealthProcessor.name);
  private retryTimer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    @Inject(ConnectionHealthService) private readonly health: ConnectionHealthService,
    @InjectQueue(CONNECTION_HEALTH_QUEUE) private readonly queue: Queue,
    @Inject(CONNECTION_SETTINGS) private readonly settings: ConnectionSettings,
  ) {
    super();
  }

  /**
   * Registration never blocks startup: without Redis the API still serves heartbeats and
   * ingestion. A failed registration is retried with exponential backoff until it succeeds,
   * so evaluation resumes on its own once Redis is back.
   */
  onModuleInit(): void {
    this.scheduleWithRetry(INITIAL_RETRY_MS);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
  }

  private scheduleWithRetry(nextDelayMs: number): void {
    void this.schedule().catch((error: unknown) => {
      if (this.stopped) return;
      this.logger.warn(
        `connection health scheduler not registered, retrying in ${nextDelayMs}ms: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.retryTimer = setTimeout(
        () => this.scheduleWithRetry(Math.min(nextDelayMs * 2, MAX_RETRY_MS)),
        nextDelayMs,
      );
      this.retryTimer.unref();
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
