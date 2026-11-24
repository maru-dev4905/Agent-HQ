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
  putAgent(row: AgentStateRow): Promise<void>;
  getTask(taskId: string): Promise<TaskStateRow | null>;
  putTask(row: TaskStateRow): Promise<void>;
  /** Deletes every read-model row of the workspace (used by replay before re-applying). */
  clear(): Promise<void>;
}

type Tx = Prisma.TransactionClient;
type Timestamps = { lastEventAt: Date; lastReceivedAt: Date; orderKeys: Prisma.JsonValue };

function fromDb<
  T extends { lastEventAt: string; lastReceivedAt: string; orderKeys: Record<string, OrderKey> },
>(row: Omit<T, 'lastEventAt' | 'lastReceivedAt' | 'orderKeys'> & Timestamps): T {
  // orderKeys is only written by put* with Record<string, OrderKey>.
  return {
    ...row,
    lastEventAt: row.lastEventAt.toISOString(),
    lastReceivedAt: row.lastReceivedAt.toISOString(),
    orderKeys: row.orderKeys as unknown as Record<string, OrderKey>,
  } as unknown as T;
}

function toDb<
  T extends { lastEventAt: string; lastReceivedAt: string; orderKeys: Record<string, OrderKey> },
>(row: T) {
  return {
    ...row,
    lastEventAt: new Date(row.lastEventAt),
    lastReceivedAt: new Date(row.lastReceivedAt),
    orderKeys: row.orderKeys as unknown as Prisma.InputJsonValue,
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
