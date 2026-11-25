import { AGENT_OBSERVED_STATUSES, CONNECTION_STATUSES, TASK_STATUSES } from '@agent-hq/domain';
import { z } from 'zod';

/**
 * Query API and realtime stream contract (HQ-107). Every path is scoped to a workspace;
 * Phase 1 has one local workspace (`local`) and no user authentication (security §5): the
 * API is protected by loopback binding and the Host/Origin guard.
 */
export const QUERY_PATHS = {
  agents: '/workspaces/:workspaceId/agents',
  tasks: '/workspaces/:workspaceId/tasks',
  connections: '/workspaces/:workspaceId/connections',
  events: '/workspaces/:workspaceId/events',
  stream: '/workspaces/:workspaceId/stream',
} as const;

export const QUERY_LIMITS = {
  defaultEventPage: 100,
  /** Bounded so one response stays small even with large events (64 KiB each). */
  maxEventPage: 500,
} as const;

const MAX_INT64 = 9_223_372_036_854_775_807n;

/**
 * storeSequence travels as a decimal string: it is a 64-bit integer (PostgreSQL bigint), so
 * values above 2^63-1 are rejected here instead of failing in the database.
 */
export const storeCursorSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/, 'Must be a non-negative integer')
  .refine(
    // Zod keeps checking after a failed regex, so only parse values that are digits.
    (value) => !/^[0-9]{1,19}$/.test(value) || BigInt(value) <= MAX_INT64,
    'Must not exceed 9223372036854775807',
  );
const cursorSchema = storeCursorSchema;
const isoSchema = z.iso.datetime();

/** Query string of `GET …/events`. `after` is exclusive; omitted means from the start. */
export const eventsQuerySchema = z.strictObject({
  after: cursorSchema.optional(),
  // Plain decimal digits only (no `1e2`, `0x10` or padding), then range-checked.
  limit: z
    .string()
    .regex(/^[1-9][0-9]{0,3}$/, 'Must be a positive integer')
    .transform(Number)
    .pipe(z.number().max(QUERY_LIMITS.maxEventPage))
    .optional(),
});
export type EventsQuery = z.infer<typeof eventsQuerySchema>;

export const agentViewSchema = z.object({
  agentInstanceId: z.string(),
  connectionId: z.string(),
  /**
   * Status to show. Equals `reportedStatus` unless the agent's connection was lost after
   * HQ last heard from it (then `unknown`, never `idle`; domain-model N5).
   */
  observedStatus: z.enum(AGENT_OBSERVED_STATUSES),
  /** Latest status derived from the agent's own events (domain-model N4). */
  reportedStatus: z.enum(AGENT_OBSERVED_STATUSES),
  rawStatus: z.string().nullable(),
  agentName: z.string().nullable(),
  roleHint: z.string().nullable(),
  parentExternalAgentId: z.string().nullable(),
  executionLocation: z.string().nullable(),
  lastEventType: z.string(),
  /** Source time of the latest event (may be skewed); see lastReceivedAt for server time. */
  lastEventAt: isoSchema,
  lastReceivedAt: isoSchema,
  lastStoreSequence: cursorSchema,
  /** Server time the agent's connection was last lost, if ever (HQ-108). */
  connectionLostAt: isoSchema.nullable(),
  /**
   * Derived display attribute: nothing about this agent was received for longer than the
   * list's `staleThresholdMs` (server time). `observedStatus` is never changed by it.
   */
  stale: z.boolean(),
});
export type AgentView = z.infer<typeof agentViewSchema>;

export const taskViewSchema = z.object({
  taskId: z.string(),
  connectionId: z.string(),
  agentInstanceId: z.string().nullable(),
  status: z.enum(TASK_STATUSES),
  title: z.string().nullable(),
  parentExternalTaskId: z.string().nullable(),
  lastEventType: z.string(),
  lastEventAt: isoSchema,
  lastReceivedAt: isoSchema,
  lastStoreSequence: cursorSchema,
});
export type TaskView = z.infer<typeof taskViewSchema>;

export const connectionViewSchema = z.object({
  connectionId: z.string(),
  adapterId: z.string(),
  runtime: z.string(),
  displayName: z.string().nullable(),
  status: z.enum(CONNECTION_STATUSES),
  lastHeartbeatAt: isoSchema.nullable(),
  tokenExpiresAt: isoSchema,
  revokedAt: isoSchema.nullable(),
  createdAt: isoSchema,
});
export type ConnectionView = z.infer<typeof connectionViewSchema>;

/**
 * A stored event as served to clients. Payloads are what ingestion stored: parsed, with
 * unknown fields dropped and secrets masked (HQ-105) — never the raw source input.
 */
export const eventViewSchema = z
  .object({
    storeSequence: cursorSchema,
    id: z.string(),
    workspaceId: z.string(),
    connectionId: z.string(),
    type: z.string(),
    schemaVersion: z.number().int(),
    occurredAt: isoSchema,
    receivedAt: isoSchema,
    idempotencyKey: z.string(),
    correlationId: z.string(),
    agentInstanceId: z.string().optional(),
    taskId: z.string().optional(),
    source: z.record(z.string(), z.unknown()),
    payload: z.record(z.string(), z.unknown()),
  })
  // Further optional envelope fields (sequence, causationId, …) pass through unchanged.
  .loose();
export type EventView = z.infer<typeof eventViewSchema>;

export const agentListSchema = z.object({
  agents: z.array(agentViewSchema),
  /** The threshold `stale` was computed with, so a client can re-evaluate it over time. */
  staleThresholdMs: z.number().int().positive(),
});
export const taskListSchema = z.object({ tasks: z.array(taskViewSchema) });
export const connectionListSchema = z.object({ connections: z.array(connectionViewSchema) });
export const eventPageSchema = z.object({
  events: z.array(eventViewSchema),
  /**
   * Pass as `after` to read the next page; equals the request's `after` when the page is
   * empty. A page shorter than `limit` means the reader has caught up.
   */
  nextCursor: cursorSchema,
});
export type AgentList = z.infer<typeof agentListSchema>;
export type TaskList = z.infer<typeof taskListSchema>;
export type ConnectionList = z.infer<typeof connectionListSchema>;
export type EventPage = z.infer<typeof eventPageSchema>;

/**
 * Server-Sent Events stream (`GET …/stream`). Each stored event is one SSE message:
 * `id: <storeSequence>`, `event: agent-event`, `data: <EventView JSON>`. On reconnect the
 * client sends `Last-Event-ID` (browsers do this automatically) and receives every event
 * after it, in order, exactly once. Without a cursor the stream starts at the current head
 * (new events only); `?after=0` replays the whole log. A cursor beyond the newest stored
 * event (e.g. after the database was reset) is answered with 409 so the client reloads instead
 * of waiting silently. Comment lines (`: keep-alive`) keep idle connections open.
 */
export const STREAM_EVENT_NAME = 'agent-event';
export const streamQuerySchema = z.strictObject({ after: cursorSchema.optional() });
