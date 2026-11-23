import { parseIncomingEvent, type IncomingAgentEvent } from '@agent-hq/events';
import { describe, expect, it } from 'vitest';
import { generate, toJsonLines } from './generate.js';
import { SCENARIO_NAMES } from './scenarios.js';

describe('generate — determinism', () => {
  it.each(SCENARIO_NAMES)('produces byte-identical output for the same seed (%s)', (scenario) => {
    const a = toJsonLines(generate({ scenario, seed: 42, shuffle: true, duplicateRate: 0.3 }));
    const b = toJsonLines(generate({ scenario, seed: 42, shuffle: true, duplicateRate: 0.3 }));
    expect(a).toBe(b);
  });

  it('produces different output for a different seed', () => {
    const a = toJsonLines(generate({ scenario: 'single-agent', seed: 1 }));
    const b = toJsonLines(generate({ scenario: 'single-agent', seed: 2 }));
    expect(a).not.toBe(b);
  });

  it('never reads the wall clock (fixed default start time)', () => {
    const events = generate({ scenario: 'single-agent', seed: 7 });
    expect(events[0]?.occurredAt.startsWith('2026-11-20T05:00:')).toBe(true);
  });
});

describe('generate — contract', () => {
  it.each(SCENARIO_NAMES)(
    'emits only contract-valid events with no ignored fields (%s)',
    (scenario) => {
      for (const event of generate({ scenario, seed: 3 })) {
        const result = parseIncomingEvent(event);
        expect(result).toMatchObject({ ok: true, ignoredFields: [] });
      }
    },
  );

  it('uses unique idempotency keys and increasing sequences within a session', () => {
    const events = generate({ scenario: 'delegation', seed: 3 });
    expect(new Set(events.map((e) => e.idempotencyKey)).size).toBe(events.length);
    const sequences = events.map((e) => e.sequence ?? -1);
    expect([...sequences].sort((x, y) => x - y)).toEqual(sequences);
  });

  it('keeps occurredAt non-decreasing in emission order', () => {
    const events = generate({ scenario: 'failure-gap', seed: 9 });
    const times = events.map((e) => Date.parse(e.occurredAt));
    expect([...times].sort((x, y) => x - y)).toEqual(times);
  });
});

describe('scenarios', () => {
  const byType = (events: IncomingAgentEvent[], type: string) =>
    events.filter((e) => e.type === type);

  it('delegation links subagents to the main agent', () => {
    const started = byType(generate({ scenario: 'delegation', seed: 1 }), 'agent.started');
    expect(started).toHaveLength(2);
    for (const event of started) {
      if (event.type !== 'agent.started') throw new Error('unexpected');
      expect(event.payload.parentExternalAgentId).toBe('agent_main');
    }
  });

  it('failure-gap contains a failed tool call, a sequence gap and a disconnect', () => {
    const events = generate({ scenario: 'failure-gap', seed: 1 });
    expect(byType(events, 'tool.call.failed')).toHaveLength(1);
    expect(events.at(-1)?.type).toBe('agent.disconnected');
    const sequences = events.map((e) => e.sequence ?? 0);
    const jumps = sequences.slice(1).filter((s, i) => s - (sequences[i] ?? 0) > 1);
    expect(jumps).toHaveLength(1);
  });

  it('delegation links each subtask to its owning agent and the parent task', () => {
    const created = byType(generate({ scenario: 'delegation', seed: 1 }), 'task.created');
    const subtasks = created.filter((e) => e.source.externalTaskId !== 'task_feature');
    expect(subtasks.map((e) => e.source.externalAgentId)).toEqual([
      'agent_worker',
      'agent_reviewer',
    ]);
    for (const event of subtasks) {
      if (event.type !== 'task.created') throw new Error('unexpected');
      expect(event.payload.parentExternalTaskId).toBe('task_feature');
    }
  });

  it.each(SCENARIO_NAMES)('tool durations match the event timestamps (%s)', (scenario) => {
    const events = generate({ scenario, seed: 11 });
    for (const end of events) {
      if (end.type !== 'tool.call.completed' && end.type !== 'tool.call.failed') continue;
      const start = events.find(
        (e) =>
          e.type === 'tool.call.started' &&
          e.payload.externalToolCallId === end.payload.externalToolCallId,
      );
      expect(start).toBeDefined();
      expect(end.payload.durationMs).toBe(
        Date.parse(end.occurredAt) - Date.parse(start!.occurredAt),
      );
    }
  });

  it('single-agent ends idle only through an explicit status event', () => {
    const events = generate({ scenario: 'single-agent', seed: 1 });
    const idle = events.find(
      (e) => e.type === 'agent.status.changed' && e.payload.status === 'idle',
    );
    expect(idle).toBeDefined();
  });
});

describe('delivery options', () => {
  it('shuffle delivers the same events in a different order', () => {
    const plain = generate({ scenario: 'delegation', seed: 5 });
    const shuffled = generate({ scenario: 'delegation', seed: 5, shuffle: true });
    const keys = (events: IncomingAgentEvent[]) => events.map((e) => e.idempotencyKey);
    expect([...keys(shuffled)].sort()).toEqual([...keys(plain)].sort());
    expect(keys(shuffled)).not.toEqual(keys(plain));
  });

  it('duplicateRate 1 delivers every event twice with the same idempotency key', () => {
    const plain = generate({ scenario: 'single-agent', seed: 5 });
    const doubled = generate({ scenario: 'single-agent', seed: 5, duplicateRate: 1 });
    expect(doubled).toHaveLength(plain.length * 2);
    expect(new Set(doubled.map((e) => e.idempotencyKey)).size).toBe(plain.length);
  });

  it('rejects invalid options, including seeds that would alias into the 32-bit state', () => {
    const bad = [
      { duplicateRate: 2, seed: 1 },
      { seed: 1.5 },
      { seed: -1 },
      { seed: 4294967297 },
      { seed: 1, cutAfter: 0 },
      { seed: 1, cutAfter: 999 },
    ];
    for (const options of bad) {
      expect(() => generate({ scenario: 'single-agent', ...options })).toThrow(RangeError);
    }
  });

  it('disconnect mode stops without any closing signal', () => {
    const events = generate({ scenario: 'failure-gap', seed: 1, cutAfter: 5 });
    expect(events).toHaveLength(5);
    const closing = new Set(['agent.disconnected', 'agent.completed', 'agent.failed']);
    expect(events.some((e) => closing.has(e.type))).toBe(false);
  });
});
