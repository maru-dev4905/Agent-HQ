import type { IncomingAgentEvent } from '@agent-hq/events';
import { generate, MAX_SEED } from './generate.js';
import { SCENARIO_NAMES, type ScenarioName } from './scenarios.js';

export interface LoadOptions {
  /** How many independent runs (sessions with their own agents and tasks) to generate. */
  runs: number;
  seed: number;
  /** Scenarios cycled through, run by run. Defaults to all scenarios. */
  scenarios?: readonly ScenarioName[];
  duplicateRate?: number;
}

/**
 * External IDs that must be unique per run so runs never merge into the same agent/task.
 * (`externalEventId` is not emitted by the scenarios today; add it here if that changes.)
 */
const SOURCE_IDS = ['externalSessionId', 'externalAgentId', 'externalTaskId'] as const;
const PAYLOAD_IDS = [
  'parentExternalAgentId',
  'parentExternalTaskId',
  'externalToolCallId',
] as const;

function suffixed(event: IncomingAgentEvent, run: number): IncomingAgentEvent {
  const tag = (value: string) => `${value}#${run}`;
  const source = { ...event.source };
  for (const key of SOURCE_IDS) {
    const value = source[key];
    if (typeof value === 'string') source[key] = tag(value);
  }
  const payload: Record<string, unknown> = { ...event.payload };
  for (const key of PAYLOAD_IDS) {
    const value = payload[key];
    if (typeof value === 'string') payload[key] = tag(value);
  }
  // Safe: only identifier strings were rewritten; shape and types are unchanged.
  return {
    ...event,
    source,
    payload,
    correlationId: tag(event.correlationId),
    idempotencyKey: tag(event.idempotencyKey),
  } as IncomingAgentEvent;
}

/**
 * Load mode (HQ-112): many independent runs of the deterministic scenarios, each with its own
 * session, agents, tasks and idempotency keys. Same options → same stream, byte for byte.
 */
export function generateLoad(options: LoadOptions): IncomingAgentEvent[] {
  if (!Number.isInteger(options.runs) || options.runs < 1) {
    throw new RangeError('runs must be a positive integer');
  }
  if (!Number.isInteger(options.seed) || options.seed < 0) {
    throw new RangeError('seed must be a non-negative integer');
  }
  if (options.seed + options.runs - 1 > MAX_SEED) {
    throw new RangeError(`seed + runs - 1 must be at most ${MAX_SEED}`);
  }
  const scenarios = options.scenarios ?? SCENARIO_NAMES;
  if (scenarios.length === 0) throw new RangeError('scenarios must not be empty');
  const events: IncomingAgentEvent[] = [];
  for (let run = 0; run < options.runs; run++) {
    const scenario = scenarios[run % scenarios.length]!;
    const stream = generate({
      scenario,
      seed: options.seed + run,
      ...(options.duplicateRate === undefined ? {} : { duplicateRate: options.duplicateRate }),
    });
    for (const event of stream) events.push(suffixed(event, run));
  }
  return events;
}
