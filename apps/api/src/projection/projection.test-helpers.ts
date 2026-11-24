import type { AgentStateRow, StoredEvent, TaskStateRow } from '@agent-hq/database';
import type { IncomingAgentEvent } from '@agent-hq/events';
import { projectAgent, projectTask } from './projector.js';

/**
 * Turns a simulator delivery stream into stored events the way ingestion will (HQ-105):
 * duplicates (same idempotency key) are dropped, storeSequence follows arrival order, and
 * external IDs map to stable HQ IDs.
 */
export function storeStream(
  stream: IncomingAgentEvent[],
  workspaceId = 'w',
  connectionId = 'c',
): StoredEvent[] {
  const seen = new Set<string>();
  const stored: StoredEvent[] = [];
  for (const event of stream) {
    if (seen.has(event.idempotencyKey)) continue;
    seen.add(event.idempotencyKey);
    const { externalAgentId, externalTaskId } = event.source as {
      externalAgentId?: string;
      externalTaskId?: string;
    };
    stored.push({
      ...event,
      id: `evt_${stored.length + 1}`,
      workspaceId,
      connectionId,
      receivedAt: event.occurredAt,
      storeSequence: BigInt(stored.length + 1),
      ...(externalAgentId === undefined ? {} : { agentInstanceId: `agent:${externalAgentId}` }),
      ...(externalTaskId === undefined ? {} : { taskId: `task:${externalTaskId}` }),
    });
  }
  return stored;
}

/** Folds events into in-memory read models, as applyProjections does against the database. */
export function foldAll(events: StoredEvent[]) {
  const agents = new Map<string, AgentStateRow>();
  const tasks = new Map<string, TaskStateRow>();
  for (const event of events) {
    if (event.agentInstanceId !== undefined) {
      const next = projectAgent(agents.get(event.agentInstanceId) ?? null, event);
      if (next !== null) agents.set(next.agentInstanceId, next);
    }
    if (event.taskId !== undefined) {
      const next = projectTask(tasks.get(event.taskId) ?? null, event);
      if (next !== null) tasks.set(next.taskId, next);
    }
  }
  return { agents, tasks };
}

/**
 * Fields that must not depend on arrival order. Excluded: `orderKeys`, `lastStoreSequence` and
 * `lastReceivedAt`, which record log positions and server time — arrival-dependent by definition.
 */
export function publicView(models: ReturnType<typeof foldAll>) {
  const strip = <
    T extends { orderKeys: unknown; lastStoreSequence: bigint; lastReceivedAt: string },
  >({
    orderKeys: _o,
    lastStoreSequence: _l,
    lastReceivedAt: _r,
    ...rest
  }: T) => rest;
  return {
    agents: [...models.agents.values()]
      .map(strip)
      .sort((a, b) => a.agentInstanceId.localeCompare(b.agentInstanceId)),
    tasks: [...models.tasks.values()].map(strip).sort((a, b) => a.taskId.localeCompare(b.taskId)),
  };
}
