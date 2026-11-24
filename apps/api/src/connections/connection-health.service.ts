import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConnectionRecord, ConnectionStore, EventStore } from '@agent-hq/database';
import { applyConnectionStatus, type ApplyStatusResult } from './apply-status.js';
import { EVENT_STORE } from '../tokens.js';
import {
  CLOCK,
  CONNECTION_SETTINGS,
  CONNECTION_STORE,
  ID_GENERATOR,
  type Clock,
  type ConnectionSettings,
  type IdGenerator,
} from './tokens.js';

/** Re-evaluates connection status from heartbeat recency and revocation (HQ-103). */
@Injectable()
export class ConnectionHealthService {
  private readonly logger = new Logger(ConnectionHealthService.name);

  constructor(
    @Inject(CONNECTION_STORE) private readonly connections: ConnectionStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(CONNECTION_SETTINGS) private readonly settings: ConnectionSettings,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly newId: IdGenerator,
  ) {}

  /** Evaluates every connection that can still change; one failure never skips the rest. */
  async evaluateAll(): Promise<number> {
    const connections = await this.connections.listActive();
    // Take the time after reading: every row is then at least as old as `now`, so a delayed
    // sweep can never apply an older instant over a newer recorded transition.
    const now = this.clock();
    let changed = 0;
    for (const connection of connections) {
      try {
        if ((await this.refresh(connection, now)).changed) changed += 1;
      } catch (error) {
        this.logger.error(
          `health evaluation failed for connection ${connection.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return changed;
  }

  async refresh(
    connection: ConnectionRecord,
    now: Date = this.clock(),
  ): Promise<ApplyStatusResult> {
    const result = await applyConnectionStatus(connection, now, {
      events: this.events,
      thresholds: this.settings.thresholds,
      newId: this.newId,
    });
    if (result.changed) {
      this.logger.log(`connection ${connection.id}: ${connection.status} → ${result.status}`);
    }
    return result;
  }
}
