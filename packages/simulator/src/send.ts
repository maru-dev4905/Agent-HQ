import { EVENT_LIMITS, type IncomingAgentEvent } from '@agent-hq/events';

export interface SendOptions {
  /** Full ingestion endpoint URL. The final path is fixed by the ingestion contract (HQ-105). */
  url: string;
  /** Connection token (HQ-103). Read from the environment by the CLI, never from argv. */
  token: string;
  batchSize?: number;
  /** Per-request timeout, so a stalled server fails the send instead of hanging forever. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface SendReport {
  batches: number;
  events: number;
  /** HTTP status of each batch, in order. */
  statuses: number[];
}

/** Posts events in batches as `{ "events": [...] }`. Stops at the first non-2xx response. */
export async function sendEvents(
  events: readonly IncomingAgentEvent[],
  options: SendOptions,
): Promise<SendReport> {
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > EVENT_LIMITS.maxBatchEvents) {
    throw new RangeError(`batchSize must be between 1 and ${EVENT_LIMITS.maxBatchEvents}`);
  }
  const doFetch = options.fetch ?? fetch;
  const report: SendReport = { batches: 0, events: 0, statuses: [] };

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    let response: Response;
    try {
      response = await doFetch(options.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.token}`,
        },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
    } catch (error) {
      // Report the network cause (e.g. ECONNREFUSED) but never the URL or token.
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      const cause = timedOut
        ? `: timed out after ${options.timeoutMs ?? 10_000}ms`
        : error instanceof Error && error.cause instanceof Error
          ? `: ${error.cause.message}`
          : '';
      throw new Error(`Could not reach the ingestion endpoint${cause}`, { cause: error });
    }
    // The body is not needed and may echo request data; release the connection.
    await response.body?.cancel();
    report.batches += 1;
    report.statuses.push(response.status);
    if (!response.ok) {
      throw new Error(`Ingestion rejected batch ${report.batches} with HTTP ${response.status}`);
    }
    report.events += batch.length;
  }
  return report;
}
