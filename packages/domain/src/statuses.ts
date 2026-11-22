/** Connection status (spec domain-model §4). */
export const CONNECTION_STATUSES = [
  'pending',
  'connected',
  'degraded',
  'disconnected',
  'error',
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Task status (spec domain-model §4). */
export const TASK_STATUSES = [
  'draft',
  'queued',
  'running',
  'waiting_approval',
  'waiting_external',
  'succeeded',
  'failed',
  'cancelled',
  'skipped',
  'unknown',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Data sensitivity (spec event-schema §3, data-governance integration note N1: D0..D3). */
export const SENSITIVITY_LEVELS = ['public', 'internal', 'sensitive', 'secret'] as const;
export type Sensitivity = (typeof SENSITIVITY_LEVELS)[number];

/** Execution location (spec architecture §4.3). */
export const EXECUTION_LOCATIONS = ['local', 'cloud'] as const;
export type ExecutionLocation = (typeof EXECUTION_LOCATIONS)[number];
