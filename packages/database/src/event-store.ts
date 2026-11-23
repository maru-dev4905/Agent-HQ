import type { AgentEvent } from '@agent-hq/events';
import type { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient } from './index.js';
import { canonicalJson, sha256 } from './canonical-json.js';

/** An event as read back from the log, with its replay cursor. */
export type StoredEvent = AgentEvent & { storeSequence: bigint };

export type AppendOutcome =
  | { status: 'stored'; storeSequence: bigint }
  /** Same idempotency key already stored. `conflict` is true when the content differs. */
  | { status: 'duplicate'; storeSequence: bigint; conflict: boolean }
  /** The event `id` is already used in this workspace by a different event (different key). */
  | { status: 'id_conflict' };

/** Operations available inside one append transaction. */
export interface EventStoreTransaction {
  append(event: AgentEvent): Promise<AppendOutcome>;
  /** Returns the HQ ID for an external agent, creating the mapping with `newId` if absent. */
  resolveAgentInstance(ref: ExternalRef, newId: () => string): Promise<string>;
  /** Returns the HQ ID for an external task, creating the mapping with `newId` if absent. */
  resolveTask(ref: ExternalRef, newId: () => string): Promise<string>;
  /**
   * Compare-and-set of a connection's status in the same transaction as the event that
   * records the change. The status is changed only if status, last heartbeat and revocation
   * are all still what the caller evaluated; otherwise returns false (a newer heartbeat or a
   * revocation won the race).
   */
  setConnectionStatus(expected: ExpectedConnectionState, to: string): Promise<boolean>;
}

export interface ExpectedConnectionState {
  id: string;
  status: string;
  lastHeartbeatAt: Date | null;
  revokedAt: Date | null;
}

export interface ExternalRef {
  workspaceId: string;
  connectionId: string;
  externalId: string;
}

export interface EventStore {
  /**
   * Runs `work` in one database transaction holding a per-workspace lock, so events of a
   * workspace commit in `storeSequence` order and a cursor reader never skips a row that
   * commits late (ADR-0002, M1 milestone notes).
   */
  transaction<T>(workspaceId: string, work: (tx: EventStoreTransaction) => Promise<T>): Promise<T>;
  /** Events of a workspace with `storeSequence > after`, oldest first. */
  readFrom(workspaceId: string, after: bigint, limit: number): Promise<StoredEvent[]>;
}

type Tx = Prisma.TransactionClient;

/** Upper bound for one `readFrom` page; callers page with the returned cursor. */
export const MAX_READ_LIMIT = 1000;

/**
 * Explicit interactive-transaction limits. Appends of one workspace are serialized by the
 * advisory lock, so a waiting transaction must give up instead of holding a pool connection
 * indefinitely (RSK-019).
 */
const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;

/** Thrown when a transaction touches a workspace other than the one it locked. */
export class WorkspaceMismatchError extends Error {
  constructor(locked: string, actual: string) {
    super(`Transaction locked workspace "${locked}" but received data for "${actual}"`);
    this.name = 'WorkspaceMismatchError';
  }
}

function assertWorkspace(locked: string, actual: string): void {
  if (actual !== locked) throw new WorkspaceMismatchError(locked, actual);
}

/** Storage keeps milliseconds; normalizing first makes equal instants hash identically. */
function normalizeTimestamps(event: AgentEvent): AgentEvent {
  return {
    ...event,
    occurredAt: new Date(event.occurredAt).toISOString(),
    receivedAt: new Date(event.receivedAt).toISOString(),
  };
}

/** Body fields that define an event's content for conflict detection (not server-owned ones). */
function contentHash(event: AgentEvent): string {
  const {
    id: _id,
    receivedAt: _receivedAt,
    agentInstanceId: _agent,
    taskId: _task,
    ...body
  } = event;
  return sha256(canonicalJson(body));
}

async function lockWorkspace(tx: Tx, workspaceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`;
}

async function append(tx: Tx, input: AgentEvent): Promise<AppendOutcome> {
  const event = normalizeTimestamps(input);
  const hash = contentHash(event);
  const inserted = await tx.$queryRaw<{ store_sequence: bigint }[]>`
    INSERT INTO events (
      id, workspace_id, connection_id, idempotency_key, content_hash, schema_version, type,
      occurred_at, received_at, timestamp_quality, agent_instance_id, task_id, project_id,
      mission_id, pipeline_run_id, node_run_id, correlation_id, causation_id,
      external_session_id, sequence, sensitivity, source, payload
    ) VALUES (
      ${event.id}, ${event.workspaceId}, ${event.connectionId}, ${event.idempotencyKey}, ${hash},
      ${event.schemaVersion}, ${event.type}, ${new Date(event.occurredAt)}::timestamptz,
      ${new Date(event.receivedAt)}::timestamptz, ${event.timestampQuality ?? null},
      ${event.agentInstanceId ?? null}, ${event.taskId ?? null}, ${event.projectId ?? null},
      ${event.missionId ?? null}, ${event.pipelineRunId ?? null}, ${event.nodeRunId ?? null},
      ${event.correlationId}, ${event.causationId ?? null},
      ${event.source.externalSessionId ?? null}, ${event.sequence ?? null},
      ${event.sensitivity ?? null}, ${JSON.stringify(event.source)}::jsonb,
      ${JSON.stringify(event.payload)}::jsonb
    )
    ON CONFLICT DO NOTHING
    RETURNING store_sequence`;

  const row = inserted[0];
  if (row !== undefined) {
    await tx.eventOutbox.create({
      data: { storeSequence: row.store_sequence, workspaceId: event.workspaceId },
    });
    return { status: 'stored', storeSequence: row.store_sequence };
  }

  const existing = await tx.event.findUnique({
    where: {
      workspaceId_connectionId_idempotencyKey: {
        workspaceId: event.workspaceId,
        connectionId: event.connectionId,
        idempotencyKey: event.idempotencyKey,
      },
    },
    select: { storeSequence: true, contentHash: true },
  });
  if (existing === null) return { status: 'id_conflict' };
  return {
    status: 'duplicate',
    storeSequence: existing.storeSequence,
    conflict: existing.contentHash !== hash,
  };
}

function toStoredEvent(row: {
  storeSequence: bigint;
  id: string;
  workspaceId: string;
  connectionId: string;
  idempotencyKey: string;
  schemaVersion: number;
  type: string;
  occurredAt: Date;
  receivedAt: Date;
  timestampQuality: string | null;
  agentInstanceId: string | null;
  taskId: string | null;
  projectId: string | null;
  missionId: string | null;
  pipelineRunId: string | null;
  nodeRunId: string | null;
  correlationId: string;
  causationId: string | null;
  sequence: number | null;
  sensitivity: string | null;
  source: Prisma.JsonValue;
  payload: Prisma.JsonValue;
}): StoredEvent {
  const optional = {
    timestampQuality: row.timestampQuality,
    agentInstanceId: row.agentInstanceId,
    taskId: row.taskId,
    projectId: row.projectId,
    missionId: row.missionId,
    pipelineRunId: row.pipelineRunId,
    nodeRunId: row.nodeRunId,
    causationId: row.causationId,
    sequence: row.sequence,
    sensitivity: row.sensitivity,
  };
  const event = {
    storeSequence: row.storeSequence,
    id: row.id,
    workspaceId: row.workspaceId,
    connectionId: row.connectionId,
    idempotencyKey: row.idempotencyKey,
    schemaVersion: row.schemaVersion,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    correlationId: row.correlationId,
    source: row.source,
    payload: row.payload,
    ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== null)),
  };
  // Rows are only written by `append`, which receives contract-validated AgentEvents, and
  // are never updated, so the stored shape is the validated shape.
  return event as unknown as StoredEvent;
}

async function resolveIdentity(
  tx: Tx,
  kind: 'agent' | 'task',
  ref: ExternalRef,
  newId: () => string,
): Promise<string> {
  // Read first: the common case (known agent/task) performs no write. The per-workspace lock
  // held by the transaction serializes first sightings, so the insert cannot race.
  const where = {
    workspaceId: ref.workspaceId,
    connectionId: ref.connectionId,
  };
  const existing =
    kind === 'agent'
      ? await tx.agentInstance.findUnique({
          where: {
            workspaceId_connectionId_externalAgentId: { ...where, externalAgentId: ref.externalId },
          },
          select: { id: true },
        })
      : await tx.task.findUnique({
          where: {
            workspaceId_connectionId_externalTaskId: { ...where, externalTaskId: ref.externalId },
          },
          select: { id: true },
        });
  if (existing !== null) return existing.id;

  const id = newId();
  if (kind === 'agent') {
    await tx.agentInstance.create({ data: { id, ...where, externalAgentId: ref.externalId } });
  } else {
    await tx.task.create({ data: { id, ...where, externalTaskId: ref.externalId } });
  }
  return id;
}

export function createEventStore(db: DatabaseClient): EventStore {
  return {
    transaction(workspaceId, work) {
      if (workspaceId.trim() === '') throw new Error('workspaceId is required');
      return db.$transaction(async (tx) => {
        await lockWorkspace(tx, workspaceId);
        return work({
          append: (event) => {
            assertWorkspace(workspaceId, event.workspaceId);
            return append(tx, event);
          },
          resolveAgentInstance: (ref, newId) => {
            assertWorkspace(workspaceId, ref.workspaceId);
            return resolveIdentity(tx, 'agent', ref, newId);
          },
          setConnectionStatus: async (expected, to) => {
            const { count } = await tx.connection.updateMany({
              where: {
                id: expected.id,
                workspaceId,
                status: expected.status,
                lastHeartbeatAt: expected.lastHeartbeatAt,
                revokedAt: expected.revokedAt,
              },
              data: { status: to },
            });
            return count === 1;
          },
          resolveTask: (ref, newId) => {
            assertWorkspace(workspaceId, ref.workspaceId);
            return resolveIdentity(tx, 'task', ref, newId);
          },
        });
      }, TRANSACTION_OPTIONS);
    },

    async readFrom(workspaceId, after, limit) {
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_READ_LIMIT) {
        throw new RangeError(`limit must be an integer between 1 and ${MAX_READ_LIMIT}`);
      }
      if (after < 0n) throw new RangeError('after must not be negative');
      const rows = await db.event.findMany({
        where: { workspaceId, storeSequence: { gt: after } },
        orderBy: { storeSequence: 'asc' },
        take: limit,
      });
      return rows.map(toStoredEvent);
    },
  };
}
