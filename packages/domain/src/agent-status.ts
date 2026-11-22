/**
 * Normalized agent status (spec domain-model §4, integration note N1).
 * `idle` is only set from an explicit runtime signal, never inferred from silence.
 */
export const AGENT_OBSERVED_STATUSES = [
  'connected',
  'working',
  'waiting',
  'idle',
  'failed',
  'disconnected',
  'unknown',
] as const;

export type AgentObservedStatus = (typeof AGENT_OBSERVED_STATUSES)[number];

export function isAgentObservedStatus(value: unknown): value is AgentObservedStatus {
  return (
    typeof value === 'string' && (AGENT_OBSERVED_STATUSES as readonly string[]).includes(value)
  );
}
