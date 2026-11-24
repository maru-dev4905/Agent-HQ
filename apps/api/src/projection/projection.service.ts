import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EventStore, EventStoreTransaction, StoredEvent } from '@agent-hq/database';
import { EVENT_STORE } from '../tokens.js';
import { projectAgent, projectTask } from './projector.js';

const REPLAY_PAGE = 1000;
const REPLAY_TIMEOUT_MS = 10 * 60_000;

/** Applies events to read models inside the event's own transaction, and rebuilds them. */
export async function applyProjections(
  tx: EventStoreTransaction,
  event: StoredEvent,
): Promise<void> {
  if (event.agentInstanceId !== undefined) {
    const next = projectAgent(await tx.projections.getAgent(event.agentInstanceId), event);
    if (next !== null) await tx.projections.putAgent(next);
  }
  if (event.taskId !== undefined) {
    const next = projectTask(await tx.projections.getTask(event.taskId), event);
    if (next !== null) await tx.projections.putTask(next);
  }
}

/**
 * Rebuilds all read models of a workspace from the event log, in storeSequence order, in one
 * transaction holding the workspace lock (so no append interleaves). Returns events applied.
 */
export async function replayProjections(events: EventStore, workspaceId: string): Promise<number> {
  return events.transaction(
    workspaceId,
    async (tx) => {
      await tx.projections.clear();
      let after = 0n;
      let applied = 0;
      for (;;) {
        const page = await tx.readFrom(after, REPLAY_PAGE);
        for (const event of page) {
          await applyProjections(tx, event);
          applied += 1;
        }
        const last = page.at(-1);
        if (last === undefined) return applied;
        after = last.storeSequence;
      }
    },
    { timeoutMs: REPLAY_TIMEOUT_MS },
  );
}

@Injectable()
export class ProjectionService {
  private readonly logger = new Logger(ProjectionService.name);

  constructor(@Inject(EVENT_STORE) private readonly events: EventStore) {}

  apply(tx: EventStoreTransaction, event: StoredEvent): Promise<void> {
    return applyProjections(tx, event);
  }

  async replay(workspaceId: string): Promise<number> {
    const applied = await replayProjections(this.events, workspaceId);
    this.logger.log(`replayed ${applied} events into read models of workspace ${workspaceId}`);
    return applied;
  }
}
