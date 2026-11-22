/** Contract limits shared by sources and ingestion (security T8). */
export const EVENT_LIMITS = {
  /** Maximum serialized size of one event, in bytes. */
  maxEventBytes: 64 * 1024,
  /** Maximum events per ingestion batch. */
  maxBatchEvents: 500,
  /** Maximum length of identifiers (external IDs, idempotency keys). */
  maxIdLength: 256,
  /**
   * Maximum length of summary text. Summaries are short on purpose: full content
   * (prompts, file bodies, tool output) is not captured by default (D2).
   */
  maxSummaryLength: 500,
} as const;

/** The only schema version this contract accepts (spec event-schema §11). */
export const SUPPORTED_SCHEMA_VERSION = 1;
