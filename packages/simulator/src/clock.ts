/** Simulated clock: advances only when told to, emits millisecond-precision UTC ISO strings. */
export interface SimClock {
  now(): string;
  advance(ms: number): string;
}

export function createClock(startAt: string): SimClock {
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
