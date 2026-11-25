import type {
  AgentView,
  ConnectionView as ConnectionViewDto,
  EventView,
  TaskView,
} from '@agent-hq/contracts';
import type { AgentStateRow, ConnectionView, StoredEvent, TaskStateRow } from '@agent-hq/database';
import { shownAgentStatus } from '../projection/projector.js';

// Mappers from storage rows to the wire contract. Internal fields (order keys, workspace
// IDs already in the path, token hashes) never leave the API.

export function agentView(row: AgentStateRow, now: Date, staleThresholdMs: number): AgentView {
  const { orderKeys: _o, workspaceId: _w, lastStoreSequence, observedStatus, ...rest } = row;
  // Server receive time, not the source clock (event-schema N8): skewed sources stay honest.
  const stale = now.getTime() - new Date(row.lastReceivedAt).getTime() > staleThresholdMs;
  // Safe: statuses are only written by the projector from AGENT_OBSERVED_STATUSES.
  return {
    ...rest,
    observedStatus: shownAgentStatus(row),
    reportedStatus: observedStatus,
    lastStoreSequence: lastStoreSequence.toString(),
    stale,
  } as AgentView;
}

export function taskView(row: TaskStateRow): TaskView {
  const { orderKeys: _o, workspaceId: _w, lastStoreSequence, ...rest } = row;
  // Safe: status is only written by the projector from TASK_STATUSES.
  return { ...rest, lastStoreSequence: lastStoreSequence.toString() } as TaskView;
}

export function connectionView(row: ConnectionView): ConnectionViewDto {
  return {
    connectionId: row.id,
    adapterId: row.adapterId,
    runtime: row.runtime,
    displayName: row.displayName,
    status: row.status,
    lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
    tokenExpiresAt: row.tokenExpiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function eventView(event: StoredEvent): EventView {
  return { ...event, storeSequence: event.storeSequence.toString() };
}
