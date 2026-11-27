import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AgentStateRow,
  EventStore,
  EventStoreTransaction,
  ProjectionTransaction,
  StoredEvent,
  TaskStateRow,
} from '@agent-hq/database';
import { EVENT_STORE } from '../tokens.js';
import { projectAgent, projectConnectionLoss, projectTask } from './projector.js';

const REPLAY_PAGE = 1000;
const REPLAY_TIMEOUT_MS = 10 * 60_000;

/**
 * What applying an event to the read models needs. Implemented by the database
 * (`tx.projections`), by a per-batch write-back cache over it (ingestion), and in memory
 * (replay) — all three run the SAME `applyToProjections`, so live results and a replay
 * cannot drift apart.
 */
export type ProjectionAccess = Pick<
  ProjectionTransaction,
  | 'getAgent'
  | 'putAgent'
  | 'getTask'
  | 'putTask'
  | 'listAgentsOfConnection'
  | 'lastConnectionLossBefore'
>;

const isConnectionLoss = (event: StoredEvent) =>
  event.type === 'connection.health.changed' && event.payload.status === 'disconnected';

/** Applies one event to the read models through `access`. */
export async function applyToProjections(
  access: ProjectionAccess,
  event: StoredEvent,
): Promise<void> {
  if (event.agentInstanceId !== undefined) {
    const prev = await access.getAgent(event.agentInstanceId);
    const next = projectAgent(prev, event);
    if (next !== null) {
      if (prev === null) {
        // A loss that committed before this first event (e.g. while it waited for the lock)
        // still applies to the new row (HQ-108, PR #7 review).
        next.connectionLostAt = await access.lastConnectionLossBefore(
          event.connectionId,
          event.storeSequence,
        );
      }
      await access.putAgent(next);
    }
  }
  if (event.taskId !== undefined) {
    const next = projectTask(await access.getTask(event.taskId), event);
    if (next !== null) await access.putTask(next);
  }
  if (isConnectionLoss(event)) {
    for (const agent of await access.listAgentsOfConnection(event.connectionId)) {
      const next = projectConnectionLoss(agent, event);
      if (next !== null) await access.putAgent(next);
    }
  }
}

/** Applies events to read models inside the event's own transaction. */
export function applyProjections(tx: EventStoreTransaction, event: StoredEvent): Promise<void> {
  return applyToProjections(tx.projections, event);
}

/**
 * Write-back cache over the transaction's read models for one ingestion batch: each row is
 * read at most once and written once at `flush` (HQ-113). Reads of rows written earlier in
 * the batch see the cached value, exactly as sequential writes would.
 */
export class BatchProjections implements ProjectionAccess {
  private readonly agents = new Map<string, AgentStateRow | null>();
  private readonly tasks = new Map<string, TaskStateRow | null>();
  private readonly dirtyAgents = new Set<string>();
  private readonly dirtyTasks = new Set<string>();

  constructor(private readonly db: ProjectionTransaction) {}

  async getAgent(id: string) {
    if (!this.agents.has(id)) this.agents.set(id, await this.db.getAgent(id));
    return this.agents.get(id) ?? null;
  }

  putAgent(row: AgentStateRow) {
    this.agents.set(row.agentInstanceId, row);
    this.dirtyAgents.add(row.agentInstanceId);
    return Promise.resolve();
  }

  async getTask(id: string) {
    if (!this.tasks.has(id)) this.tasks.set(id, await this.db.getTask(id));
    return this.tasks.get(id) ?? null;
  }

  putTask(row: TaskStateRow) {
    this.tasks.set(row.taskId, row);
    this.dirtyTasks.add(row.taskId);
    return Promise.resolve();
  }

  /** Stored rows of the connection, with rows changed or created in this batch taking over. */
  async listAgentsOfConnection(connectionId: string) {
    const merged = new Map<string, AgentStateRow>();
    for (const row of await this.db.listAgentsOfConnection(connectionId)) {
      if (!this.agents.has(row.agentInstanceId)) this.agents.set(row.agentInstanceId, row);
    }
    for (const row of this.agents.values()) {
      if (row !== null && row.connectionId === connectionId) merged.set(row.agentInstanceId, row);
    }
    return [...merged.values()].sort((a, b) => (a.agentInstanceId < b.agentInstanceId ? -1 : 1));
  }

  /** Reads events, which this transaction has already appended: no cache needed. */
  lastConnectionLossBefore(connectionId: string, storeSequence: bigint) {
    return this.db.lastConnectionLossBefore(connectionId, storeSequence);
  }

  async flush(): Promise<void> {
    for (const id of this.dirtyAgents) await this.db.putAgent(this.agents.get(id)!);
    for (const id of this.dirtyTasks) await this.db.putTask(this.tasks.get(id)!);
    this.dirtyAgents.clear();
    this.dirtyTasks.clear();
  }
}

/** Read models held in memory while the log is replayed (HQ-113). */
class MemoryProjections implements ProjectionAccess {
  readonly agents = new Map<string, AgentStateRow>();
  readonly tasks = new Map<string, TaskStateRow>();
  /** Latest loss (server time) per connection among the events folded so far. */
  private readonly losses = new Map<string, string>();

  getAgent(id: string) {
    return Promise.resolve(this.agents.get(id) ?? null);
  }
  putAgent(row: AgentStateRow) {
    this.agents.set(row.agentInstanceId, row);
    return Promise.resolve();
  }
  getTask(id: string) {
    return Promise.resolve(this.tasks.get(id) ?? null);
  }
  putTask(row: TaskStateRow) {
    this.tasks.set(row.taskId, row);
    return Promise.resolve();
  }
  listAgentsOfConnection(connectionId: string) {
    const rows = [...this.agents.values()].filter((row) => row.connectionId === connectionId);
    return Promise.resolve(rows.sort((a, b) => (a.agentInstanceId < b.agentInstanceId ? -1 : 1)));
  }
  /** Events are folded in storeSequence order, so "folded so far" is "stored before". */
  lastConnectionLossBefore(connectionId: string) {
    return Promise.resolve(this.losses.get(connectionId) ?? null);
  }
  /** Called after each event is applied, mirroring the database's view of stored events. */
  observe(event: StoredEvent): void {
    if (!isConnectionLoss(event)) return;
    const at = new Date(event.receivedAt).toISOString();
    const prev = this.losses.get(event.connectionId);
    if (prev === undefined || at > prev) this.losses.set(event.connectionId, at);
  }
}

/**
 * Rebuilds all read models of a workspace from the event log, in storeSequence order, in one
 * transaction holding the workspace lock (so no append interleaves). Events are folded in
 * memory with the same projector and written once at the end (HQ-113: one round trip per
 * row instead of several per event). Returns events applied.
 */
export async function replayProjections(events: EventStore, workspaceId: string): Promise<number> {
  return events.transaction(
    workspaceId,
    async (tx) => {
      const memory = new MemoryProjections();
      let after = 0n;
      let applied = 0;
      for (;;) {
        const page = await tx.readFrom(after, REPLAY_PAGE);
        for (const event of page) {
          await applyToProjections(memory, event);
          memory.observe(event);
          applied += 1;
        }
        const last = page.at(-1);
        if (last === undefined) break;
        after = last.storeSequence;
      }
      await tx.projections.clear();
      await tx.projections.insertAll([...memory.agents.values()], [...memory.tasks.values()]);
      return applied;
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
