import { EVENT_LIMITS } from '@agent-hq/events';
import { z } from 'zod';

/**
 * Ingestion API contract (HQ-105). One endpoint takes a batch of 1..maxBatchEvents events.
 * A batch is atomic: either every event is stored (or recognized as a duplicate) or none is.
 */
export const INGEST_PATH = '/events';

export const INGEST_LIMITS = {
  /** Upper bound of one request body. Larger batches must be split by the source. */
  maxRequestBytes: 4 * 1024 * 1024,
  maxBatchEvents: EVENT_LIMITS.maxBatchEvents,
  maxEventBytes: EVENT_LIMITS.maxEventBytes,
} as const;

/**
 * The request shape only. Each element is validated separately by `parseIncomingEvent`,
 * so one bad event is reported by its index (`events.3.payload.toolName`).
 */
export const ingestRequestSchema = z.object({
  events: z.array(z.unknown()).min(1),
});
export type IngestRequest = z.infer<typeof ingestRequestSchema>;

export const ingestResultSchema = z.object({
  idempotencyKey: z.string(),
  /** `duplicate`: the same key with the same content was stored before; nothing changed. */
  status: z.enum(['stored', 'duplicate']),
  /** Replay cursor of the stored event, as a decimal string (it is a 64-bit integer). */
  storeSequence: z.string(),
  /** Names of unknown fields that were dropped (never their values). */
  ignoredFields: z.array(z.string()),
  /** Names of fields whose text matched a secret pattern and was masked before storage. */
  redactedFields: z.array(z.string()),
});
export type IngestResult = z.infer<typeof ingestResultSchema>;

/** 200 response: one result per request event, in request order. */
export const ingestResponseSchema = z.object({
  results: z.array(ingestResultSchema),
});
export type IngestResponse = z.infer<typeof ingestResponseSchema>;
