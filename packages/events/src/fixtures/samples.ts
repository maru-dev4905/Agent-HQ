import type { EventType } from '../payloads.js';

/** Minimal valid payload and required IDs for every MVP event type (contract fixtures). */
export const validSamples: Record<
  EventType,
  { payload: Record<string, unknown>; source: Record<string, string> }
> = {
  'agent.connected': {
    payload: { agentName: 'main', executionLocation: 'local' },
    source: { externalAgentId: 'agt_1' },
  },
  'agent.disconnected': {
    payload: { reason: 'session ended' },
    source: { externalAgentId: 'agt_1' },
  },
  'agent.started': {
    payload: { roleHint: 'reviewer', parentExternalAgentId: 'agt_0' },
    source: { externalAgentId: 'agt_1' },
  },
  'agent.status.changed': {
    payload: { status: 'working', rawStatus: 'busy' },
    source: { externalAgentId: 'agt_1' },
  },
  'agent.completed': { payload: {}, source: { externalAgentId: 'agt_1' } },
  'agent.failed': {
    payload: { errorCode: 'RUNTIME_TIMEOUT', message: 'no response' },
    source: { externalAgentId: 'agt_1' },
  },
  'task.created': {
    payload: { title: 'Write tests', parentExternalTaskId: 'task_0' },
    source: { externalTaskId: 'task_1' },
  },
  'task.started': { payload: {}, source: { externalTaskId: 'task_1' } },
  'task.completed': { payload: { summary: 'done' }, source: { externalTaskId: 'task_1' } },
  'task.failed': { payload: { errorCode: 'X' }, source: { externalTaskId: 'task_1' } },
  'tool.call.started': {
    payload: { toolName: 'Edit', externalToolCallId: 'call_1', inputSummary: 'src/a.ts' },
    source: { externalAgentId: 'agt_1' },
  },
  'tool.call.completed': {
    payload: { toolName: 'Edit', externalToolCallId: 'call_1', durationMs: 12 },
    source: { externalAgentId: 'agt_1' },
  },
  'tool.call.failed': {
    payload: { toolName: 'Bash', externalToolCallId: 'call_2', durationMs: 3, errorCode: 'EXIT_1' },
    source: { externalAgentId: 'agt_1' },
  },
  'connection.health.changed': {
    payload: { status: 'degraded', reason: 'heartbeat late' },
    source: {},
  },
  'event.gap.detected': {
    payload: { reason: 'sequence jump', fromSequence: 4, toSequence: 9 },
    source: {},
  },
  'usage.reported': {
    payload: { metricType: 'tokens.output', quantity: 120, unit: 'token', sourceType: 'reported' },
    source: {},
  },
};

export function buildEvent(
  type: EventType,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const sample = validSamples[type];
  return {
    schemaVersion: 1,
    type,
    occurredAt: '2026-11-20T05:00:00Z',
    source: {
      adapterId: 'simulator',
      runtime: 'simulator',
      externalSessionId: 'sess_1',
      ...sample.source,
    },
    correlationId: 'run_1',
    idempotencyKey: `sim:sess_1:${type}:1`,
    sequence: 1,
    payload: sample.payload,
    ...overrides,
  };
}
