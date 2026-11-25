import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { EventStore, GapStore, SequenceGap } from '@agent-hq/database';
import type { AgentEvent } from '@agent-hq/events';
import { applyProjections } from '../projection/projection.service.js';
import { EVENT_STORE } from '../tokens.js';
import { GAP_ID_GENERATOR, GAP_SETTINGS, GAP_STORE, type GapSettings } from './tokens.js';

const BATCH = 100;

/** The HQ-authored record of one gap, for one affected agent (or none). */
export function gapEvent(
  gap: SequenceGap,
  agentInstanceId: string | undefined,
  now: Date,
  newId: () => string,
): AgentEvent {
  const range = `${gap.fromSequence}-${gap.toSequence}`;
  return {
    id: newId(),
    schemaVersion: 1,
    type: 'event.gap.detected',
    // Positioned at the hole: same session, the last missing sequence, the time of the next
    // known event. Later events therefore still decide the state (projector order, N8).
    occurredAt: gap.nextOccurredAt.toISOString(),
    timestampQuality: 'collected',
    receivedAt: now.toISOString(),
    workspaceId: gap.workspaceId,
    connectionId: gap.connectionId,
    source: { adapterId: 'hq', runtime: 'hq', externalSessionId: gap.externalSessionId },
    sequence: gap.toSequence,
    correlationId: `gap:${gap.externalSessionId}`,
    idempotencyKey: `hq:gap:${gap.externalSessionId}:${range}:${agentInstanceId ?? '-'}`,
    payload: {
      reason: `sequence ${range} missing in session (not received within the grace period)`,
      fromSequence: gap.fromSequence,
      toSequence: gap.toSequence,
    },
    ...(agentInstanceId === undefined ? {} : { agentInstanceId }),
  };
}

/**
 * Records holes in session `sequence` numbering as `event.gap.detected` and marks the
 * affected agents `unknown` through the projector (HQ-108, event-schema §8). Missing events
 * are never invented: the gap event only says that something is missing.
 */
@Injectable()
export class GapDetectionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(GapDetectionService.name);
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private lastError: string | undefined;

  constructor(
    @Inject(GAP_STORE) private readonly gaps: GapStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(GAP_SETTINGS) private readonly settings: GapSettings,
    @Inject(GAP_ID_GENERATOR) private readonly newId: () => string,
  ) {}

  onApplicationBootstrap(): void {
    if (this.settings.checkIntervalMs > 0) this.schedule();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  /** Records every settled gap; returns how many gaps were recorded. */
  async detectOnce(now: Date = new Date()): Promise<number> {
    const settledBefore = new Date(now.getTime() - this.settings.graceMs);
    let recorded = 0;
    for (;;) {
      const found = await this.gaps.findGaps(settledBefore, BATCH);
      for (const gap of found) {
        const stored = await this.events.transaction(gap.workspaceId, async (tx) => {
          // Found outside the lock: an ingestion may have filled the hole since.
          const filled = await tx.hasSequenceIn(
            gap.connectionId,
            gap.externalSessionId,
            gap.fromSequence,
            gap.toSequence,
          );
          if (filled) return 0;
          // Computed under the lock too: an agent may have disconnected since the scan.
          const affected = await tx.agentsAffectedByGap(
            gap.connectionId,
            gap.externalSessionId,
            gap.fromSequence,
          );
          const agents = affected.length > 0 ? affected : [undefined];
          let appended = 0;
          for (const agentInstanceId of agents) {
            const event = gapEvent(gap, agentInstanceId, now, this.newId);
            const outcome = await tx.append(event);
            if (outcome.status === 'stored') {
              await applyProjections(tx, { ...event, storeSequence: outcome.storeSequence });
              appended += 1;
            }
          }
          return appended;
        });
        // Another process may have recorded the same gap first (same idempotency keys).
        if (stored > 0) recorded += 1;
      }
      if (found.length < BATCH) break;
    }
    if (recorded > 0) this.logger.log(`recorded ${recorded} event gap(s)`);
    return recorded;
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.detectOnce()
        .then(() => {
          this.lastError = undefined;
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (message !== this.lastError) this.logger.warn(`gap detection failed: ${message}`);
          this.lastError = message;
        })
        .finally(() => this.schedule());
    }, this.settings.checkIntervalMs);
  }
}
