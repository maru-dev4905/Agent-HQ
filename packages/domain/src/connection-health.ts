import type { ConnectionStatus } from './statuses.js';

export interface HeartbeatThresholds {
  /** No heartbeat for this long → `degraded`. */
  degradedAfterMs: number;
  /** No heartbeat for this long → `disconnected`. */
  disconnectedAfterMs: number;
}

export const DEFAULT_HEARTBEAT_THRESHOLDS: HeartbeatThresholds = {
  degradedAfterMs: 30_000,
  disconnectedAfterMs: 90_000,
};

export interface ConnectionHealthInput {
  /** Last heartbeat, or null when the connection never sent one. */
  lastHeartbeatAt: Date | null;
  revoked: boolean;
  now: Date;
}

/**
 * Connection status from heartbeat recency (spec domain-model §4). A connection that never
 * sent a heartbeat stays `pending`; silence is never read as healthy.
 */
export function evaluateConnectionHealth(
  input: ConnectionHealthInput,
  thresholds: HeartbeatThresholds = DEFAULT_HEARTBEAT_THRESHOLDS,
): ConnectionStatus {
  if (thresholds.degradedAfterMs >= thresholds.disconnectedAfterMs) {
    throw new RangeError('degradedAfterMs must be smaller than disconnectedAfterMs');
  }
  if (input.revoked) return 'disconnected';
  if (input.lastHeartbeatAt === null) return 'pending';
  const silentFor = input.now.getTime() - input.lastHeartbeatAt.getTime();
  if (silentFor >= thresholds.disconnectedAfterMs) return 'disconnected';
  if (silentFor >= thresholds.degradedAfterMs) return 'degraded';
  return 'connected';
}
