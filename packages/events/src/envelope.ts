import { SENSITIVITY_LEVELS } from '@agent-hq/domain';
import { z } from 'zod';
import { SUPPORTED_SCHEMA_VERSION } from './limits.js';
import {
  EVENT_TYPES,
  eventPayloadSchemas,
  requiredSourceFields,
  type EventPayload,
  type EventType,
  type RequiredSourceFieldsOf,
} from './payloads.js';
import { idSchema, nonNegativeIntSchema, utcTimestampSchema } from './primitives.js';

/**
 * Fields only HQ may set. A source that sends them is rejected rather than ignored,
 * because it signals a misunderstanding of the contract (event-schema notes N1, N7).
 */
const SERVER_OWNED_FIELDS = ['receivedAt', 'storeSequence', 'agentInstanceId', 'taskId'] as const;

const sourceSchema = z.strictObject({
  adapterId: idSchema,
  runtime: idSchema,
  externalSessionId: idSchema.optional(),
  externalEventId: idSchema.optional(),
  /** The runtime's agent ID; HQ maps it to an AgentInstance (ADR-0006). */
  externalAgentId: idSchema.optional(),
  /** The runtime's task ID; HQ maps it to a Task (ADR-0006). */
  externalTaskId: idSchema.optional(),
});

/**
 * Envelope a source sends (spec event-schema §3 with integration notes N1, N2, N7).
 * `workspaceId` and `connectionId` come from the authenticated token; ingestion rejects
 * mismatches. Unknown top-level keys are stripped and reported by name.
 */
const incomingEnvelopeSchema = z.object({
  id: idSchema.optional(),
  schemaVersion: z.literal(SUPPORTED_SCHEMA_VERSION),
  type: z.enum(EVENT_TYPES as [EventType, ...EventType[]]),
  occurredAt: utcTimestampSchema,
  timestampQuality: z.enum(['source', 'collected']).optional(),

  workspaceId: idSchema.optional(),
  projectId: idSchema.optional(),
  missionId: idSchema.optional(),
  pipelineRunId: idSchema.optional(),
  nodeRunId: idSchema.optional(),
  connectionId: idSchema.optional(),

  source: sourceSchema,

  correlationId: idSchema,
  causationId: idSchema.optional(),
  idempotencyKey: idSchema,
  /** Adapter-provided order within (connectionId, source.externalSessionId). */
  sequence: nonNegativeIntSchema.optional(),

  payload: z.record(z.string(), z.unknown()),
  sensitivity: z.enum(SENSITIVITY_LEVELS).optional(),
});

type IncomingEnvelope = z.infer<typeof incomingEnvelopeSchema>;
type Source = IncomingEnvelope['source'];

/** A validated incoming event; `payload` and the required `source` IDs are narrowed by `type`. */
export type IncomingAgentEvent = {
  [T in EventType]: Omit<IncomingEnvelope, 'type' | 'payload' | 'source'> & {
    type: T;
    payload: EventPayload<T>;
    source: Source & { [K in RequiredSourceFieldsOf<T>]-?: string };
  };
}[EventType];

/**
 * An event as stored by HQ. Server-owned fields are always present; `agentInstanceId`
 * and `taskId` are the HQ IDs that ingestion mapped from the external IDs.
 */
export type AgentEvent = IncomingAgentEvent & {
  id: string;
  workspaceId: string;
  connectionId: string;
  receivedAt: string;
  agentInstanceId?: string;
  taskId?: string;
};

export interface ContractIssue {
  /** Dotted path of the offending field, e.g. `payload.toolName`. Empty for the root. */
  path: string;
  message: string;
}

export type ParseResult =
  | {
      ok: true;
      event: IncomingAgentEvent;
      /** Names (never values) of unknown keys that were dropped, e.g. `payload.command`. */
      ignoredFields: string[];
    }
  | { ok: false; issues: ContractIssue[] };

function toIssues(error: z.ZodError, prefix = ''): ContractIssue[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return {
      path: prefix === '' ? path : path === '' ? prefix : `${prefix}.${path}`,
      message: issue.message,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownKeys(value: unknown, known: readonly string[], prefix: string): string[] {
  if (!isRecord(value)) return [];
  return Object.keys(value)
    .filter((key) => !known.includes(key))
    .map((key) => (prefix === '' ? key : `${prefix}.${key}`));
}

const ENVELOPE_KEYS = Object.keys(incomingEnvelopeSchema.shape);

function payloadKeys(type: EventType): readonly string[] {
  const schema = eventPayloadSchemas[type];
  // `event.gap.detected` wraps its object in a refinement; both expose the object shape.
  return Object.keys('shape' in schema ? schema.shape : {});
}

/**
 * Validates an incoming event and reports every problem by field path in one pass.
 * Only the returned `event` may be stored or logged — never the raw input.
 */
export function parseIncomingEvent(input: unknown): ParseResult {
  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '', message: 'Event must be a JSON object' }] };
  }

  const issues: ContractIssue[] = [];
  for (const field of SERVER_OWNED_FIELDS) {
    if (field in input)
      issues.push({ path: field, message: 'Set by HQ; sources must not send it' });
  }

  const envelope = incomingEnvelopeSchema.safeParse(input);
  if (!envelope.success) issues.push(...toIssues(envelope.error));

  // Even when the envelope is invalid, check type-specific rules so the source can fix
  // everything in one round trip.
  const typeResult = incomingEnvelopeSchema.shape.type.safeParse(input['type']);
  let payload: z.ZodSafeParseResult<unknown> | undefined;
  if (typeResult.success) {
    const type = typeResult.data;
    const source = isRecord(input['source']) ? input['source'] : {};
    for (const field of requiredSourceFields[type]) {
      if (source[field] === undefined) {
        issues.push({ path: `source.${field}`, message: `Required for event type ${type}` });
      }
    }
    if ('sequence' in input && source['externalSessionId'] === undefined) {
      issues.push({
        path: 'source.externalSessionId',
        message: 'Required when sequence is set (sequence is ordered per session)',
      });
    }
    payload = eventPayloadSchemas[type].safeParse(input['payload']);
    if (!payload.success && isRecord(input['payload'])) {
      issues.push(...toIssues(payload.error, 'payload'));
    }
  }

  if (issues.length > 0 || !envelope.success || payload === undefined || !payload.success) {
    return { ok: false, issues: dedupe(issues) };
  }

  const type = envelope.data.type;
  const ignoredFields = [
    ...unknownKeys(input, ENVELOPE_KEYS, ''),
    ...unknownKeys(input['payload'], payloadKeys(type), 'payload'),
  ];
  // Safe: the envelope and the type-specific payload and source requirements were all
  // validated above; TypeScript cannot correlate them through the runtime lookup tables.
  const event = { ...envelope.data, payload: payload.data } as IncomingAgentEvent;
  return { ok: true, event, ignoredFields };
}

function dedupe(issues: ContractIssue[]): ContractIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.path}\u0000${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
