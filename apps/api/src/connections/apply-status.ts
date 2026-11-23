import {
  evaluateConnectionHealth,
  type ConnectionStatus,
  type HeartbeatThresholds,
} from '@agent-hq/domain';
import type { ConnectionRecord, EventStore } from '@agent-hq/database';
import type { AgentEvent } from '@agent-hq/events';

const REASONS: Record<ConnectionStatus, string> = {
  pending: 'registered, no heartbeat yet',
  connected: 'heartbeat received',
  degraded: 'heartbeat overdue',
  disconnected: 'heartbeat missing or connection revoked',
  error: 'connection error',
};

export interface ApplyStatusDeps {
  events: EventStore;
  thresholds: HeartbeatThresholds;
  newId: () => string;
}

export interface ApplyStatusResult {
  status: ConnectionStatus;
  changed: boolean;
}

/**
 * Evaluates one connection and, if its status changes, updates it and appends a
 * `connection.health.changed` event in one transaction. Shared by the health job, heartbeat
 * handling and the admin `revoke` command so every status change is recorded the same way.
 */
export async function applyConnectionStatus(
  connection: ConnectionRecord,
  now: Date,
  deps: ApplyStatusDeps,
): Promise<ApplyStatusResult> {
  const next = evaluateConnectionHealth(
    { lastHeartbeatAt: connection.lastHeartbeatAt, revoked: connection.revokedAt !== null, now },
    deps.thresholds,
  );
  if (next === connection.status) return { status: next, changed: false };

  return deps.events.transaction(connection.workspaceId, async (tx) => {
    // Compare-and-set on status, heartbeat and revocation: if any changed since `connection`
    // was read, a newer evaluation owns the transition and nothing is recorded here.
    const updated = await tx.setConnectionStatus(connection, next);
    if (!updated) return { status: next, changed: false };
    const occurredAt = now.toISOString();
    const event = {
      id: deps.newId(),
      schemaVersion: 1,
      type: 'connection.health.changed',
      occurredAt,
      receivedAt: occurredAt,
      timestampQuality: 'source',
      workspaceId: connection.workspaceId,
      connectionId: connection.id,
      source: { adapterId: 'hq', runtime: 'hq' },
      correlationId: `connection:${connection.id}`,
      idempotencyKey: `hq:connection-health:${connection.id}:${occurredAt}:${next}`,
      payload: { status: next, reason: REASONS[next] },
    } satisfies AgentEvent;
    await tx.append(event);
    return { status: next, changed: true };
  });
}
