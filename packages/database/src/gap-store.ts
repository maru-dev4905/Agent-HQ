import type { DatabaseClient } from './index.js';

/** A hole in one session's `sequence` numbering that no later arrival has filled. */
export interface SequenceGap {
  workspaceId: string;
  connectionId: string;
  externalSessionId: string;
  fromSequence: number;
  toSequence: number;
  /** Source time of the first event after the hole; the gap is placed just before it. */
  nextOccurredAt: Date;
}

export interface GapStore {
  /**
   * Holes between consecutive `sequence` values of a session (HQ-108). Only holes whose next
   * event was received before `settledBefore` are returned (late events get time to arrive),
   * and holes inside a range HQ already recorded as `event.gap.detected` are skipped. A missing first event of
   * a session cannot be told apart from a session that starts above 0, so it is not reported.
   */
  findGaps(settledBefore: Date, limit: number): Promise<SequenceGap[]>;
}

interface GapRow {
  workspace_id: string;
  connection_id: string;
  external_session_id: string;
  from_sequence: number;
  to_sequence: number;
  next_occurred_at: Date;
}

export function createGapStore(db: DatabaseClient): GapStore {
  return {
    async findGaps(settledBefore, limit) {
      // HQ's own gap records carry the missing sequence; they must not count as received.
      // A source's own `event.gap.detected` is part of its numbering and does count.
      const rows = await db.$queryRaw<GapRow[]>`
        WITH ordered AS (
          SELECT workspace_id, connection_id, external_session_id, sequence, occurred_at,
                 received_at,
                 lag(sequence) OVER w AS previous,
                 lag(received_at) OVER w AS previous_received_at
          FROM events
          WHERE sequence IS NOT NULL
            AND external_session_id IS NOT NULL
            AND NOT (type = 'event.gap.detected' AND source->>'adapterId' = 'hq')
          WINDOW w AS (
            PARTITION BY workspace_id, connection_id, external_session_id
            ORDER BY sequence, store_sequence
          )
        )
        SELECT o.workspace_id, o.connection_id, o.external_session_id,
               o.previous + 1 AS from_sequence, o.sequence - 1 AS to_sequence,
               o.occurred_at AS next_occurred_at
        FROM ordered o
        WHERE o.previous IS NOT NULL
          AND o.sequence > o.previous + 1
          -- Both sides of the hole must be settled: either may have arrived late.
          AND greatest(o.received_at, o.previous_received_at) < ${settledBefore}
          AND NOT EXISTS (
            SELECT 1 FROM events g
            WHERE g.workspace_id = o.workspace_id
              AND g.connection_id = o.connection_id
              AND g.external_session_id = o.external_session_id
              AND g.type = 'event.gap.detected'
              AND g.source->>'adapterId' = 'hq'
              -- Already recorded, or inside a recorded range (a late event split it).
              -- CASE keeps the casts off source-sent gap payloads: Postgres may evaluate
              -- conditions in any order, and those may hold numbers beyond any int type.
              AND CASE WHEN g.source->>'adapterId' = 'hq'
                    THEN (g.payload->>'fromSequence')::bigint <= o.previous + 1
                     AND (g.payload->>'toSequence')::bigint >= o.sequence - 1
                    ELSE false END
          )
        ORDER BY o.workspace_id, o.connection_id, o.external_session_id, o.sequence
        LIMIT ${limit}`;
      // Affected agents are computed under the lock when the gap is recorded.
      return rows.map((row) => ({
        workspaceId: row.workspace_id,
        connectionId: row.connection_id,
        externalSessionId: row.external_session_id,
        fromSequence: Number(row.from_sequence),
        toSequence: Number(row.to_sequence),
        nextOccurredAt: row.next_occurred_at,
      }));
    },
  };
}
