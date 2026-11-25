import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { OutboxStore } from '@agent-hq/database';
import { OUTBOX_STORE, REALTIME_SETTINGS, type RealtimeSettings } from './tokens.js';
import { WorkspaceSignals } from './workspace-signals.js';

const BATCH = 500;

/**
 * Turns outbox entries into workspace signals and removes them (HQ-107). The outbox is a
 * notification channel only; streams read events from the event store by cursor.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private lastError: string | undefined;

  constructor(
    @Inject(OUTBOX_STORE) private readonly outbox: OutboxStore,
    @Inject(WorkspaceSignals) private readonly signals: WorkspaceSignals,
    @Inject(REALTIME_SETTINGS) private readonly settings: RealtimeSettings,
  ) {}

  onApplicationBootstrap(): void {
    if (this.settings.outboxPollIntervalMs > 0) this.schedule();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  /** Relays every pending entry; returns how many were relayed. */
  async relayOnce(): Promise<number> {
    let relayed = 0;
    for (;;) {
      const entries = await this.outbox.pending(BATCH);
      if (entries.length === 0) return relayed;
      for (const workspaceId of new Set(entries.map((entry) => entry.workspaceId))) {
        this.signals.notify(workspaceId);
      }
      await this.outbox.acknowledge(entries.map((entry) => entry.storeSequence));
      relayed += entries.length;
      if (entries.length < BATCH) return relayed;
    }
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.relayOnce()
        .then(() => {
          this.lastError = undefined;
        })
        .catch((error: unknown) => {
          // Log each distinct failure once; streams still catch up on their own interval.
          const message = error instanceof Error ? error.message : String(error);
          if (message !== this.lastError) this.logger.warn(`outbox relay failed: ${message}`);
          this.lastError = message;
        })
        .finally(() => this.schedule());
    }, this.settings.outboxPollIntervalMs);
  }
}
