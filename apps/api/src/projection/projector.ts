import type { AgentObservedStatus, TaskStatus } from '@agent-hq/domain';
import type { AgentStateRow, OrderKey, StoredEvent, TaskStateRow } from '@agent-hq/database';

/**
 * Pure projection of events into current-state rows (HQ-106, ADR-0002).
 *
 * Order independence (TS-04): every field remembers the OrderKey of the event that set it,
 * and only a newer event overwrites it. `isNewer` is a strict TOTAL order over events —
 * lexicographic (occurredAt, session, sequence, idempotencyKey) — so the same set of events
 * gives the same state in any arrival order, including timestamp ties and events from
 * several sessions. `sequence` therefore orders events of one session that share a
 * timestamp; if a session's clock goes backwards, the timestamp wins (documented in
 * event-schema integration note N8). Fields an event does not carry are never touched.
 *
 * Arrival-dependent by definition (excluded from order-independence checks):
 * `lastStoreSequence` (log position) and `lastReceivedAt` (server time).
 *
 * Status rules (domain-model integration note N1, N4): status only changes on an explicit
 * signal; silence never makes an agent idle. A recorded gap makes it `unknown` (HQ-108).
 *
 * Connection loss is kept apart (`connectionLostAt`, server time) instead of competing with
 * source-reported statuses: comparing a server-time loss with source-time statuses would
 * make the result depend on arrival order and clock skew. `shownAgentStatus` combines them.
 */

export function orderKeyOf(event: StoredEvent): OrderKey {
  return {
    occurredAt: new Date(event.occurredAt).toISOString(),
    session: event.source.externalSessionId ?? null,
    sequence: event.sequence ?? null,
    idempotencyKey: event.idempotencyKey,
    storeSequence: event.storeSequence.toString(),
  };
}

function compareNullable<T>(a: T | null, b: T | null, compare: (x: T, y: T) => number): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return compare(a, b);
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const compareNumber = (a: number, b: number) => a - b;

/** Total order: true when `a` is strictly after `b` (or `b` is absent). */
export function isNewer(a: OrderKey, b: OrderKey | undefined): boolean {
  if (b === undefined) return true;
  const order =
    compareText(a.occurredAt, b.occurredAt) ||
    compareNullable(a.session, b.session, compareText) ||
    compareNullable(a.sequence, b.sequence, compareNumber) ||
    compareText(a.idempotencyKey, b.idempotencyKey);
  return order > 0;
}

const maxIso = (a: string, b: string) => (a >= b ? a : b);
const maxBig = (a: bigint, b: bigint) => (a >= b ? a : b);

/** Event → agent status (domain-model integration note N4). */
function agentStatusFor(
  event: StoredEvent,
): { status: AgentObservedStatus; raw: string | null } | null {
  switch (event.type) {
    case 'agent.connected':
    case 'agent.started':
      return { status: 'connected', raw: null };
    case 'agent.status.changed':
      return { status: event.payload.status, raw: event.payload.rawStatus ?? null };
    case 'agent.completed':
      return { status: 'idle', raw: 'completed' };
    case 'agent.failed':
      return { status: 'failed', raw: event.payload.errorCode ?? null };
    case 'agent.disconnected':
      return { status: 'disconnected', raw: event.payload.reason ?? null };
    // Events are missing at this point of the session: what the agent did is not known.
    // Placed just before the next known event, so later events still decide the state.
    case 'event.gap.detected':
      return { status: 'unknown', raw: null };
    default:
      return null;
  }
}

const AGENT_EVENT_TYPES = new Set<string>([
  'agent.connected',
  'agent.disconnected',
  'agent.started',
  'agent.status.changed',
  'agent.completed',
  'agent.failed',
  'tool.call.started',
  'tool.call.completed',
  'tool.call.failed',
  'event.gap.detected',
]);

type AgentField = 'agentName' | 'roleHint' | 'parentExternalAgentId' | 'executionLocation';

/** Next agent row for an event, or null when the event does not concern an agent. */
export function projectAgent(prev: AgentStateRow | null, event: StoredEvent): AgentStateRow | null {
  if (event.agentInstanceId === undefined) return null;
  // Task events carry the owning agent: they count as its activity (timestamps only).
  const activityOnly = !AGENT_EVENT_TYPES.has(event.type);
  if (activityOnly && !event.type.startsWith('task.')) return null;
  const key = orderKeyOf(event);
  const base: AgentStateRow = prev ?? {
    agentInstanceId: event.agentInstanceId,
    workspaceId: event.workspaceId,
    connectionId: event.connectionId,
    // A row created by a tool event before any lifecycle event: we know nothing more.
    observedStatus: 'unknown',
    rawStatus: null,
    agentName: null,
    roleHint: null,
    parentExternalAgentId: null,
    executionLocation: null,
    lastEventType: event.type,
    lastEventAt: key.occurredAt,
    lastReceivedAt: new Date(event.receivedAt).toISOString(),
    lastStoreSequence: event.storeSequence,
    orderKeys: {},
    connectionLostAt: null,
  };
  const orderKeys = { ...base.orderKeys };
  const row: AgentStateRow = { ...base, orderKeys };
  // HQ's own records (gap events) are not news from the agent: they must not make it look
  // recently active (stale) or recently heard from (connection loss).
  const fromSource = event.source.adapterId !== HQ_ADAPTER_ID;

  if (activityOnly) {
    // lastEventType means "kind of the latest activity" and must stay order-independent.
    if (isNewer(key, orderKeys['last'])) {
      row.lastEventType = event.type;
      orderKeys['last'] = key;
    }
    touch(row, key, event, fromSource);
    return row;
  }

  const status = agentStatusFor(event);
  if (status !== null && isNewer(key, orderKeys['status'])) {
    row.observedStatus = status.status;
    row.rawStatus = status.raw;
    orderKeys['status'] = key;
  }

  if (event.type === 'agent.connected' || event.type === 'agent.started') {
    const fields: Record<AgentField, string | undefined> = {
      agentName: event.payload.agentName,
      roleHint: event.payload.roleHint,
      parentExternalAgentId: event.payload.parentExternalAgentId,
      executionLocation: event.payload.executionLocation,
    };
    // Per field: only an event that carries the field, and is newer for it, may set it.
    for (const [field, value] of Object.entries(fields) as [AgentField, string | undefined][]) {
      if (value !== undefined && isNewer(key, orderKeys[field])) {
        row[field] = value;
        orderKeys[field] = key;
      }
    }
  }

  if (isNewer(key, orderKeys['last'])) {
    row.lastEventType = event.type;
    orderKeys['last'] = key;
  }
  touch(row, key, event, fromSource);
  return row;
}

function touch(row: AgentStateRow, key: OrderKey, event: StoredEvent, fromSource: boolean): void {
  if (fromSource) {
    row.lastEventAt = maxIso(row.lastEventAt, key.occurredAt);
    row.lastReceivedAt = maxIso(row.lastReceivedAt, new Date(event.receivedAt).toISOString());
  }
  row.lastStoreSequence = maxBig(row.lastStoreSequence, event.storeSequence);
}

/** `source.adapterId` of events HQ writes itself (connection health, gaps). */
export const HQ_ADAPTER_ID = 'hq';

/**
 * Records that the agent's connection was lost (`connection.health.changed` → disconnected),
 * in server time. Agents that reported `disconnected` themselves are left alone.
 */
export function projectConnectionLoss(
  prev: AgentStateRow,
  event: StoredEvent,
): AgentStateRow | null {
  if (prev.observedStatus === 'disconnected') return null;
  const lostAt = new Date(event.receivedAt).toISOString();
  if (prev.connectionLostAt !== null && prev.connectionLostAt >= lostAt) return null;
  return { ...prev, connectionLostAt: lostAt };
}

/**
 * The status to show (domain-model integration notes N1, N5). If the connection was lost
 * after HQ last received anything from the agent, and the agent did not report
 * `disconnected` itself, its state can no longer be observed: `unknown` — never `idle`.
 * Both sides are server times, so neither arrival order nor source clock skew matters.
 */
export function shownAgentStatus(row: AgentStateRow): string {
  const lost =
    row.connectionLostAt !== null &&
    row.connectionLostAt > row.lastReceivedAt &&
    row.observedStatus !== 'disconnected';
  return lost ? 'unknown' : row.observedStatus;
}

function taskStatusFor(event: StoredEvent): TaskStatus | null {
  switch (event.type) {
    case 'task.created':
      return 'queued';
    case 'task.started':
      return 'running';
    case 'task.completed':
      return 'succeeded';
    case 'task.failed':
      return 'failed';
    default:
      return null;
  }
}

/** Next task row for an event, or null when the event does not concern a task. */
export function projectTask(prev: TaskStateRow | null, event: StoredEvent): TaskStateRow | null {
  const status = taskStatusFor(event);
  if (status === null || event.taskId === undefined) return null;
  const key = orderKeyOf(event);
  const base: TaskStateRow = prev ?? {
    taskId: event.taskId,
    workspaceId: event.workspaceId,
    connectionId: event.connectionId,
    agentInstanceId: null,
    status,
    title: null,
    parentExternalTaskId: null,
    lastEventType: event.type,
    lastEventAt: key.occurredAt,
    lastReceivedAt: new Date(event.receivedAt).toISOString(),
    lastStoreSequence: event.storeSequence,
    orderKeys: {},
  };
  const orderKeys = { ...base.orderKeys };
  const row: TaskStateRow = { ...base, orderKeys };

  if (isNewer(key, orderKeys['status'])) {
    row.status = status;
    orderKeys['status'] = key;
  }
  const title =
    event.type === 'task.created' || event.type === 'task.started'
      ? event.payload.title
      : undefined;
  if (title !== undefined && isNewer(key, orderKeys['title'])) {
    row.title = title;
    orderKeys['title'] = key;
  }
  const parent = event.type === 'task.created' ? event.payload.parentExternalTaskId : undefined;
  if (parent !== undefined && isNewer(key, orderKeys['parentExternalTaskId'])) {
    row.parentExternalTaskId = parent;
    orderKeys['parentExternalTaskId'] = key;
  }
  if (event.agentInstanceId !== undefined && isNewer(key, orderKeys['owner'])) {
    row.agentInstanceId = event.agentInstanceId;
    orderKeys['owner'] = key;
  }
  if (isNewer(key, orderKeys['last'])) {
    row.lastEventType = event.type;
    orderKeys['last'] = key;
  }
  row.lastEventAt = maxIso(row.lastEventAt, key.occurredAt);
  row.lastReceivedAt = maxIso(row.lastReceivedAt, new Date(event.receivedAt).toISOString());
  row.lastStoreSequence = maxBig(row.lastStoreSequence, event.storeSequence);
  return row;
}
