import type { DatabaseClient } from './index.js';

export interface OutboxEntry {
  storeSequence: bigint;
  workspaceId: string;
}

/**
 * The transactional outbox written with every appended event (HQ-104). It only signals
 * "a workspace has new events": consumers read the events themselves from the event store
 * by cursor, so an entry can be removed as soon as it has been relayed.
 */
export interface OutboxStore {
  /** Oldest entries first. */
  pending(limit: number): Promise<OutboxEntry[]>;
  /** Removes relayed entries. */
  acknowledge(storeSequences: readonly bigint[]): Promise<void>;
}

export function createOutboxStore(db: DatabaseClient): OutboxStore {
  return {
    async pending(limit) {
      return db.eventOutbox.findMany({
        orderBy: { storeSequence: 'asc' },
        take: limit,
        select: { storeSequence: true, workspaceId: true },
      });
    },
    async acknowledge(storeSequences) {
      if (storeSequences.length === 0) return;
      await db.eventOutbox.deleteMany({ where: { storeSequence: { in: [...storeSequences] } } });
    },
  };
}
