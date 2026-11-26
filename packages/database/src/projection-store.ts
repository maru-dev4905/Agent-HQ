import type { Prisma } from './generated/prisma/client.js';

/**
 * Which event last set a field; JSON-safe (storeSequence as string). The projector orders
 * keys by (occurredAt, session, sequence, idempotencyKey) — a total order.
 */
export interface OrderKey {
  occurredAt: string;
  session: string | null;
  sequence: number | null;
  idempotencyKey: string;
  storeSequence: string;
}

export interface AgentStateRow {
  agentInstanceId: string;
  workspaceId: string;
  connectionId: string;
  observedStatus: string;
  rawStatus: string | null;
  agentName: string | null;
  roleHint: string | null;
  parentExternalAgentId: string | null;
  executionLocation: string | null;
  lastEventType: string;
  /** Latest source time (occurredAt) of the agent's own events and of task events it owns. */
  lastEventAt: string;
  /** Latest server receive time; stale detection (HQ-108) uses this, not source clocks. */
  lastReceivedAt: string;
  lastStoreSequence: bigint;
  orderKeys: Record<string, OrderKey>;
  /**
   * Server time the agent's connection was last lost (HQ-108). `observedStatus` holds what
   * the source reported; the shown status is derived from both (apps/api `shownAgentStatus`).
   */
  connectionLostAt: string | null;
}

export interface TaskStateRow {
  taskId: string;
  workspaceId: string;
  connectionId: string;
  agentInstanceId: string | null;
  status: string;
  title: string | null;
  parentExternalTaskId: string | null;
  lastEventType: string;
  lastEventAt: string;
  lastReceivedAt: string;
  lastStoreSequence: bigint;
  orderKeys: Record<string, OrderKey>;
}

/** Read-model access inside an EventStore transaction (same commit as the event). */
export interface ProjectionTransaction {
  getAgent(agentInstanceId: string): Promise<AgentStateRow | null>;
  /**
   * Server time of the latest loss of a connection (`connection.health.changed` →
   * disconnected) stored before `storeSequence`, or null. A new agent row takes it over,
   * since the loss may have committed while that agent's first event waited for the lock.
   * Bounded by `storeSequence` so replay sees exactly what the live write saw.
   */
  lastConnectionLossBefore(connectionId: string, storeSequence: bigint): Promise<string | null>;
  /** Agents first seen on a connection, ordered by ID (connection loss, HQ-108). */
  listAgentsOfConnection(connectionId: string): Promise<AgentStateRow[]>;
  putAgent(row: AgentStateRow): Promise<void>;
  getTask(taskId: string): Promise<TaskStateRow | null>;
  putTask(row: TaskStateRow): Promise<void>;
  /** Deletes every read-model row of the workspace (used by replay before re-applying). */
  clear(): Promise<void>;
  /** Inserts rows in bulk after `clear` (replay writes the folded result at once, HQ-113). */
  insertAll(agents: AgentStateRow[], tasks: TaskStateRow[]): Promise<void>;
}

type Tx = Prisma.TransactionClient;
type Timestamps = {
  lastEventAt: Date;
  lastReceivedAt: Date;
  orderKeys: Prisma.JsonValue;
  /** Agent rows only. */
  connectionLostAt?: Date | null;
};

function fromDb<
  T extends { lastEventAt: string; lastReceivedAt: string; orderKeys: Record<string, OrderKey> },
>(
  row: Omit<T, 'lastEventAt' | 'lastReceivedAt' | 'orderKeys' | 'connectionLostAt'> & Timestamps,
): T {
  const lost = row.connectionLostAt;
  // orderKeys is only written by put* with Record<string, OrderKey>.
  return {
    ...row,
    lastEventAt: row.lastEventAt.toISOString(),
    lastReceivedAt: row.lastReceivedAt.toISOString(),
    orderKeys: row.orderKeys as unknown as Record<string, OrderKey>,
    ...(lost === undefined ? {} : { connectionLostAt: lost?.toISOString() ?? null }),
  } as unknown as T;
}

function toDb<
  T extends { lastEventAt: string; lastReceivedAt: string; orderKeys: Record<string, OrderKey> },
>(row: T) {
  const lost = (row as { connectionLostAt?: string | null }).connectionLostAt;
  return {
    ...row,
    lastEventAt: new Date(row.lastEventAt),
    lastReceivedAt: new Date(row.lastReceivedAt),
    orderKeys: row.orderKeys as unknown as Prisma.InputJsonValue,
    ...(lost === undefined ? {} : { connectionLostAt: lost === null ? null : new Date(lost) }),
  };
}

export function projectionTransaction(tx: Tx, workspaceId: string): ProjectionTransaction {
  const guard = (rowWorkspace: string) => {
    if (rowWorkspace !== workspaceId) {
      throw new Error(
        `Projection row for workspace "${rowWorkspace}" in a "${workspaceId}" transaction`,
      );
    }
  };
  return {
    async getAgent(agentInstanceId) {
      const row = await tx.agentCurrentState.findFirst({ where: { agentInstanceId, workspaceId } });
      return row === null ? null : fromDb<AgentStateRow>(row);
    },
    async lastConnectionLossBefore(connectionId, storeSequence) {
      const rows = await tx.$queryRaw<{ lost_at: Date | null }[]>`
        SELECT max(received_at) AS lost_at FROM events
        WHERE workspace_id = ${workspaceId}
          AND connection_id = ${connectionId}
          AND type = 'connection.health.changed'
          AND payload->>'status' = 'disconnected'
          AND store_sequence < ${storeSequence}`;
      return rows[0]?.lost_at?.toISOString() ?? null;
    },
    async listAgentsOfConnection(connectionId) {
      const rows = await tx.agentCurrentState.findMany({
        where: { connectionId, workspaceId },
        orderBy: { agentInstanceId: 'asc' },
      });
      return rows.map((r) => fromDb<AgentStateRow>(r));
    },
    async putAgent(row) {
      guard(row.workspaceId);
      const data = toDb(row);
      // The composite FK (agent_instance_id, workspace_id) makes cross-workspace rows impossible.
      await tx.agentCurrentState.upsert({
        where: { agentInstanceId: row.agentInstanceId },
        create: data,
        update: data,
      });
    },
    async getTask(taskId) {
      const row = await tx.taskCurrentState.findFirst({ where: { taskId, workspaceId } });
      return row === null ? null : fromDb<TaskStateRow>(row);
    },
    async putTask(row) {
      guard(row.workspaceId);
      const data = toDb(row);
      await tx.taskCurrentState.upsert({
        where: { taskId: row.taskId },
        create: data,
        update: data,
      });
    },
    async insertAll(agents, tasks) {
      for (const row of [...agents, ...tasks]) guard(row.workspaceId);
      const CHUNK = 1000;
      for (let i = 0; i < agents.length; i += CHUNK) {
        await tx.agentCurrentState.createMany({
          data: agents.slice(i, i + CHUNK).map((r) => toDb(r)),
        });
      }
      for (let i = 0; i < tasks.length; i += CHUNK) {
        await tx.taskCurrentState.createMany({
          data: tasks.slice(i, i + CHUNK).map((r) => toDb(r)),
        });
      }
    },
    async clear() {
      await tx.agentCurrentState.deleteMany({ where: { workspaceId } });
      await tx.taskCurrentState.deleteMany({ where: { workspaceId } });
    },
  };
}

/** Read models of a workspace, ordered by ID (for queries and replay comparisons). */
export async function readProjections(
  db: Tx,
  workspaceId: string,
): Promise<{ agents: AgentStateRow[]; tasks: TaskStateRow[] }> {
  const [agents, tasks] = await Promise.all([
    db.agentCurrentState.findMany({ where: { workspaceId }, orderBy: { agentInstanceId: 'asc' } }),
    db.taskCurrentState.findMany({ where: { workspaceId }, orderBy: { taskId: 'asc' } }),
  ]);
  return {
    agents: agents.map((r) => fromDb<AgentStateRow>(r)),
    tasks: tasks.map((r) => fromDb<TaskStateRow>(r)),
  };
}
