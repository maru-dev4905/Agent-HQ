import type { AgentEvent } from '@agent-hq/events';
import type { Prisma } from './generated/prisma/client.js';
import type { DatabaseClient } from './index.js';
import { canonicalJson, sha256 } from './canonical-json.js';
import { projectionTransaction, type ProjectionTransaction } from './projection-store.js';

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
  /** Read models, written in the same commit as the events that produced them. */
  projections: ProjectionTransaction;
  /** Events of the locked workspace after `after`, oldest first (used by replay). */
  readFrom(after: bigint, limit: number): Promise<StoredEvent[]>;
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
  /**
   * Whether any source event of the session has a `sequence` in [from, to], read under the
   * workspace lock: a gap found outside the lock may have been filled since (HQ-108).
   */
  hasSequenceIn(connectionId: string, session: string, from: number, to: number): Promise<boolean>;
  /**
   * Agents of the session that a gap starting at `from` affects: all with events in the
   * session, except those whose last sequenced event before the gap is `agent.disconnected`.
   * Read under the lock, like `hasSequenceIn` (HQ-108).
   */
  agentsAffectedByGap(connectionId: string, session: string, from: number): Promise<string[]>;
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
  transaction<T>(
    workspaceId: string,
    work: (tx: EventStoreTransaction) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
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

export interface TransactionOptions {
  /** Overrides the default 10s limit, e.g. for a full projection replay. */
  timeoutMs?: number;
}

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

/** How long a transaction waits for the workspace lock before giving up (HQ-113). */
const LOCK_TIMEOUT_MS = 5_000;

async function lockWorkspace(tx: Tx, workspaceId: string): Promise<void> {
  // Bounded wait: a busy workspace is reported as WorkspaceBusyError (retryable) instead of
  // the whole transaction running into its timeout. Reset afterwards so row locks taken
  // later in the transaction keep the default behaviour.
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`;
  await tx.$executeRawUnsafe('SET LOCAL lock_timeout TO DEFAULT');
}

/**
 * The workspace was too busy: its lock was not acquired in time, no pool connection was free,
 * or the transaction ran past its timeout. Nothing was committed, so retrying is safe.
 */
export class WorkspaceBusyError extends Error {
  constructor(
    readonly reason: 'lock' | 'pool' | 'timeout',
    options?: { cause?: unknown },
  ) {
    super(`Workspace busy (${reason})`, options);
    this.name = 'WorkspaceBusyError';
  }
}

interface ErrorFields {
  codes: string[];
  messages: string[];
}

/**
 * Collects `code`, `meta.code` and `message` along the `cause` chain (bounded depth, no
 * JSON.stringify): classification never throws, even on cyclic or BigInt-bearing errors.
 */
function fieldsOf(error: unknown, depth = 0, into: ErrorFields = { codes: [], messages: [] }) {
  if (depth > 4 || typeof error !== 'object' || error === null) return into;
  const e = error as {
    code?: unknown;
    message?: unknown;
    meta?: { code?: unknown } | null;
    cause?: unknown;
  };
  if (typeof e.code === 'string') into.codes.push(e.code);
  if (typeof e.meta === 'object' && e.meta !== null && typeof e.meta.code === 'string') {
    into.codes.push(e.meta.code);
  }
  if (typeof e.message === 'string') into.messages.push(e.message);
  return fieldsOf(e.cause, depth + 1, into);
}

/** Errors raised deliberately by callers (e.g. Nest HttpException) — never "busy". */
function isOwnError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { getStatus?: unknown }).getStatus === 'function'
  );
}

/** Exact driver/Prisma texts only — free-form matching could turn a real bug into a 503. */
const LOCK_MESSAGES = ['canceling statement due to lock timeout'];
const POOL_MESSAGES = [
  'timeout exceeded when trying to connect', // pg-pool, every connection in use
  'Unable to start a transaction in the given time', // Prisma interactive transaction maxWait
  'Timed out fetching a new connection from the connection pool',
];
/**
 * Prisma 7.10.1 `TransactionExecutionTimeoutError`. Its code P2028 is shared with permanent
 * errors (committed/rolled-back transaction reuse, unknown transaction ID, invalid isolation
 * level), so the code alone never means "busy" (PR #12 review). Re-check on Prisma upgrades.
 */
const TIMEOUT_MESSAGES = ['cannot be executed on an expired transaction'];

/** Maps driver and Prisma errors that mean "busy, nothing committed" (HQ-113). */
export function busyReason(error: unknown): WorkspaceBusyError['reason'] | null {
  if (error instanceof WorkspaceBusyError) return error.reason;
  const { codes, messages } = fieldsOf(error);
  const says = (texts: string[]) => messages.some((m) => texts.some((t) => m.includes(t)));
  if (codes.includes('55P03') || says(LOCK_MESSAGES)) return 'lock';
  if (codes.includes('P2024') || says(POOL_MESSAGES)) return 'pool';
  if (says(TIMEOUT_MESSAGES)) return 'timeout';
  return null;
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

function assertReadRange(after: bigint, limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_READ_LIMIT) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_READ_LIMIT}`);
  }
  if (after < 0n) throw new RangeError('after must not be negative');
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
    transaction(workspaceId, work, options) {
      if (workspaceId.trim() === '') throw new Error('workspaceId is required');
      return db
        .$transaction(
          async (tx) => {
            await lockWorkspace(tx, workspaceId);
            return work({
              projections: projectionTransaction(tx, workspaceId),
              readFrom: async (after, limit) => {
                assertReadRange(after, limit);
                const rows = await tx.event.findMany({
                  where: { workspaceId, storeSequence: { gt: after } },
                  orderBy: { storeSequence: 'asc' },
                  take: limit,
                });
                return rows.map(toStoredEvent);
              },
              append: (event) => {
                assertWorkspace(workspaceId, event.workspaceId);
                return append(tx, event);
              },
              resolveAgentInstance: (ref, newId) => {
                assertWorkspace(workspaceId, ref.workspaceId);
                return resolveIdentity(tx, 'agent', ref, newId);
              },
              hasSequenceIn: async (connectionId, session, from, to) => {
                const rows = await tx.$queryRaw<{ found: boolean }[]>`
                SELECT EXISTS (
                  SELECT 1 FROM events
                  WHERE workspace_id = ${workspaceId}
                    AND connection_id = ${connectionId}
                    AND external_session_id = ${session}
                    AND sequence BETWEEN ${from} AND ${to}
                    AND NOT (type = 'event.gap.detected' AND source->>'adapterId' = 'hq')
                ) AS found`;
                return rows[0]?.found === true;
              },
              agentsAffectedByGap: async (connectionId, session, from) => {
                const rows = await tx.$queryRaw<{ agent_instance_id: string }[]>`
                SELECT a.agent_instance_id
                FROM (
                  SELECT DISTINCT agent_instance_id FROM events
                  WHERE workspace_id = ${workspaceId}
                    AND connection_id = ${connectionId}
                    AND external_session_id = ${session}
                    AND agent_instance_id IS NOT NULL
                ) a
                WHERE NOT EXISTS (
                  SELECT 1 FROM (
                    SELECT e.type FROM events e
                    WHERE e.workspace_id = ${workspaceId}
                      AND e.connection_id = ${connectionId}
                      AND e.external_session_id = ${session}
                      AND e.agent_instance_id = a.agent_instance_id
                      AND e.sequence IS NOT NULL
                      AND e.sequence < ${from}
                    ORDER BY e.sequence DESC, e.store_sequence DESC
                    LIMIT 1
                  ) last
                  WHERE last.type = 'agent.disconnected'
                )
                ORDER BY a.agent_instance_id`;
                return rows.map((row) => row.agent_instance_id);
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
          },
          {
            ...TRANSACTION_OPTIONS,
            ...(options?.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
          },
        )
        .catch((error: unknown) => {
          // Errors thrown by `work` itself (validation, conflicts, HTTP errors) pass through.
          const reason = isOwnError(error) ? null : busyReason(error);
          if (reason === null) throw error;
          throw new WorkspaceBusyError(reason, { cause: error });
        });
    },

    async readFrom(workspaceId, after, limit) {
      assertReadRange(after, limit);
      const rows = await db.event.findMany({
        where: { workspaceId, storeSequence: { gt: after } },
        orderBy: { storeSequence: 'asc' },
        take: limit,
      });
      return rows.map(toStoredEvent);
    },
  };
}
