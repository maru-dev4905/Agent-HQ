import { parseIncomingEvent } from '@agent-hq/events';
import { describe, expect, it } from 'vitest';
import { generateLoad } from './load.js';

describe('generateLoad', () => {
  it('is deterministic and keeps runs apart', () => {
    const a = generateLoad({ runs: 6, seed: 10 });
    expect(JSON.stringify(generateLoad({ runs: 6, seed: 10 }))).toBe(JSON.stringify(a));
    const keys = a.map((e) => e.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
    const sessions = new Set(a.map((e) => e.source.externalSessionId));
    expect(sessions.size).toBe(6);
    // Agents of different runs never share an external ID.
    const agentsOfRun = (run: number) =>
      new Set(
        a.filter((e) => e.idempotencyKey.endsWith(`#${run}`)).map((e) => e.source.externalAgentId),
      );
    for (const id of agentsOfRun(0)) expect(agentsOfRun(3).has(id)).toBe(false);
  });

  it('emits only contract-valid events, with duplicates when asked', () => {
    const stream = generateLoad({ runs: 3, seed: 1, duplicateRate: 1 });
    for (const event of stream) expect(parseIncomingEvent(event).ok).toBe(true);
    expect(new Set(stream.map((e) => e.idempotencyKey)).size).toBe(stream.length / 2);
  });

  it('rejects invalid options', () => {
    expect(() => generateLoad({ runs: 0, seed: 1 })).toThrow(/runs/);
    expect(() => generateLoad({ runs: 2, seed: 0xffffffff })).toThrow(/seed/);
    expect(() => generateLoad({ runs: 1, seed: 1, scenarios: [] })).toThrow(/scenarios/);
  });
});
