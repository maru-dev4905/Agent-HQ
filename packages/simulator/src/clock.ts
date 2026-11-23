/** Simulated clock: advances only when told to, emits millisecond-precision UTC ISO strings. */
export interface SimClock {
  now(): string;
  advance(ms: number): string;
}

/** Requires an explicit zone so output never depends on the machine's local time zone. */
const EXPLICIT_ZONE = /(Z|[+-]\d{2}:\d{2})$/;

export function createClock(startAt: string): SimClock {
  if (!EXPLICIT_ZONE.test(startAt)) {
    throw new Error(`Start time must include a time zone (e.g. "Z"): ${startAt}`);
  }
  let current = Date.parse(startAt);
  if (Number.isNaN(current)) throw new Error(`Invalid start time: ${startAt}`);
  return {
    now: () => new Date(current).toISOString(),
    advance: (ms) => {
      current += ms;
      return new Date(current).toISOString();
    },
  };
}
