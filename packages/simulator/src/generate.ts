import { parseIncomingEvent, type IncomingAgentEvent } from '@agent-hq/events';
import { createClock } from './clock.js';
import { createRandom } from './random.js';
import { SCENARIOS, type ScenarioName } from './scenarios.js';

export interface GenerateOptions {
  scenario: ScenarioName;
  /** Integer in [0, MAX_SEED]. Different seeds always produce different streams. */
  seed: number;
  /** Simulated start time. Defaults to a fixed instant so output never depends on the wall clock. */
  startAt?: string;
  /** Deliver events in a random order (tests order independence, TS-04). */
  shuffle?: boolean;
  /** Probability in [0, 1] that an event is delivered a second time (tests idempotency, TS-01). */
  duplicateRate?: number;
  /**
   * Disconnect mode: stop after this many emitted events with no closing signal. Models a
   * connection lost silently, which must project to `unknown`, not `disconnected` (domain-model N1).
   */
  cutAfter?: number;
}

export const DEFAULT_START_AT = '2026-11-20T05:00:00.000Z';
/** The PRNG state is 32-bit; larger seeds would silently alias smaller ones. */
export const MAX_SEED = 0xffffffff;

/**
 * Builds the delivery stream for a scenario. Every event is validated against the contract,
 * so the simulator can never emit something ingestion would reject for being malformed.
 */
export function generate(options: GenerateOptions): IncomingAgentEvent[] {
  const duplicateRate = options.duplicateRate ?? 0;
  if (duplicateRate < 0 || duplicateRate > 1)
    throw new RangeError('duplicateRate must be in [0, 1]');
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > MAX_SEED) {
    throw new RangeError(`seed must be an integer between 0 and ${MAX_SEED}`);
  }
  if (
    options.cutAfter !== undefined &&
    (!Number.isInteger(options.cutAfter) || options.cutAfter < 1)
  ) {
    throw new RangeError('cutAfter must be a positive integer');
  }

  const random = createRandom(options.seed);
  const clock = createClock(options.startAt ?? DEFAULT_START_AT);
  const emitted = SCENARIOS[options.scenario]({ random, clock });
  if (options.cutAfter !== undefined && options.cutAfter >= emitted.length) {
    // A cut at or past the end would end with the scenario's closing events: no silent drop.
    throw new RangeError(`cutAfter must be smaller than ${emitted.length} for ${options.scenario}`);
  }
  const events = options.cutAfter === undefined ? emitted : emitted.slice(0, options.cutAfter);

  for (const event of events) {
    const result = parseIncomingEvent(event);
    if (!result.ok) {
      throw new Error(
        `Scenario ${options.scenario} produced an invalid ${event.type} event: ${JSON.stringify(result.issues)}`,
      );
    }
  }

  const delivered = events.flatMap((event) =>
    random.next() < duplicateRate ? [event, event] : [event],
  );
  return options.shuffle === true ? random.shuffle(delivered) : delivered;
}

/** One JSON object per line; deterministic because events are built in a fixed key order. */
export function toJsonLines(events: readonly IncomingAgentEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n') + '\n';
}
