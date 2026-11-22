import {
  AGENT_OBSERVED_STATUSES,
  CONNECTION_STATUSES,
  EXECUTION_LOCATIONS,
} from '@agent-hq/domain';
import { z } from 'zod';
import { idSchema, nonNegativeIntSchema, summarySchema } from './primitives.js';

/**
 * Payload schemas for the MVP event types (event-schema integration notes N4, N7).
 * Unknown payload keys are stripped, never stored, and reported by name (not value) so
 * optional fields can be added within schemaVersion 1 without losing events.
 * Agent and task references are the source's external IDs (ADR-0006).
 */
const failure = {
  errorCode: idSchema.optional(),
  message: summarySchema.optional(),
};

const agentIdentity = {
  agentName: summarySchema.optional(),
  /** Role reported by the runtime when no AgentDefinition exists (domain-model note N1). */
  roleHint: summarySchema.optional(),
  parentExternalAgentId: idSchema.optional(),
  executionLocation: z.enum(EXECUTION_LOCATIONS).optional(),
};

const toolCall = {
  toolName: idSchema,
  /** The runtime's own tool call ID (domain-model §5 externalToolCallId). */
  externalToolCallId: idSchema,
  serverName: idSchema.optional(),
};

export const eventPayloadSchemas = {
  'agent.connected': z.object(agentIdentity),
  'agent.disconnected': z.object({ reason: summarySchema.optional() }),
  'agent.started': z.object(agentIdentity),
  'agent.status.changed': z.object({
    status: z.enum(AGENT_OBSERVED_STATUSES),
    /** Status exactly as the runtime reported it (domain-model §4). */
    rawStatus: summarySchema.optional(),
  }),
  'agent.completed': z.object({ summary: summarySchema.optional() }),
  'agent.failed': z.object(failure),
  'task.created': z.object({
    title: summarySchema.min(1),
    parentExternalTaskId: idSchema.optional(),
  }),
  'task.started': z.object({ title: summarySchema.optional() }),
  'task.completed': z.object({ summary: summarySchema.optional() }),
  'task.failed': z.object(failure),
  'tool.call.started': z.object({
    ...toolCall,
    inputSummary: summarySchema.optional(),
  }),
  'tool.call.completed': z.object({
    ...toolCall,
    durationMs: nonNegativeIntSchema.optional(),
    outputSummary: summarySchema.optional(),
  }),
  'tool.call.failed': z.object({
    ...toolCall,
    durationMs: nonNegativeIntSchema.optional(),
    ...failure,
  }),
  'connection.health.changed': z.object({
    status: z.enum(CONNECTION_STATUSES),
    reason: summarySchema.optional(),
  }),
  'event.gap.detected': z
    .object({
      reason: summarySchema.min(1),
      fromSequence: nonNegativeIntSchema.optional(),
      toSequence: nonNegativeIntSchema.optional(),
    })
    .refine(
      (gap) =>
        gap.fromSequence === undefined ||
        gap.toSequence === undefined ||
        gap.fromSequence <= gap.toSequence,
      { message: 'fromSequence must not exceed toSequence', path: ['toSequence'] },
    ),
  'usage.reported': z.object({
    metricType: idSchema,
    quantity: z.number().nonnegative(),
    unit: idSchema,
    sourceType: z.enum(['reported', 'estimated']),
  }),
} as const;

export type EventType = keyof typeof eventPayloadSchemas;
export const EVENT_TYPES = Object.keys(eventPayloadSchemas) as EventType[];

export type EventPayload<T extends EventType> = z.infer<(typeof eventPayloadSchemas)[T]>;

/** External references in `source` that each event type must carry. */
export type RequiredSourceField = 'externalAgentId' | 'externalTaskId';

export const requiredSourceFields = {
  'agent.connected': ['externalAgentId'],
  'agent.disconnected': ['externalAgentId'],
  'agent.started': ['externalAgentId'],
  'agent.status.changed': ['externalAgentId'],
  'agent.completed': ['externalAgentId'],
  'agent.failed': ['externalAgentId'],
  'task.created': ['externalTaskId'],
  'task.started': ['externalTaskId'],
  'task.completed': ['externalTaskId'],
  'task.failed': ['externalTaskId'],
  'tool.call.started': ['externalAgentId'],
  'tool.call.completed': ['externalAgentId'],
  'tool.call.failed': ['externalAgentId'],
  'connection.health.changed': [],
  'event.gap.detected': [],
  'usage.reported': [],
} as const satisfies Record<EventType, readonly RequiredSourceField[]>;

export type RequiredSourceFieldsOf<T extends EventType> = (typeof requiredSourceFields)[T][number];
