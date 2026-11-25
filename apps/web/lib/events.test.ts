import type { EventView } from '@agent-hq/contracts';
import { describe, expect, it } from 'vitest';
import { mergeEvents, summarize } from './events';

const event = (n: number, type = 'tool.call.started', payload: Record<string, unknown> = {}) =>
  ({
    storeSequence: String(n),
    id: `e${n}`,
    workspaceId: 'local',
    connectionId: 'c',
    type,
    schemaVersion: 1,
    occurredAt: '2026-11-25T00:00:00.000Z',
    receivedAt: '2026-11-25T00:00:00.000Z',
    idempotencyKey: `k${n}`,
    correlationId: 'r',
    source: {},
    payload,
  }) as EventView;

describe('summarize', () => {
  it('joins known text fields and ignores non-text values', () => {
    expect(summarize(event(1, 'tool.call.started', { toolName: 'Bash', durationMs: 5 }))).toBe(
      'Bash',
    );
    expect(summarize(event(2, 'task.created', { title: 'Build', summary: 'ok' }))).toBe(
      'Build · ok',
    );
  });

  it('names the missing range of a gap', () => {
    expect(
      summarize(event(3, 'event.gap.detected', { reason: 'lost', fromSequence: 2, toSequence: 4 })),
    ).toBe('sequence 2–4 누락 · lost');
  });
});

describe('mergeEvents', () => {
  it('keeps the newest first, drops duplicates and caps the list', () => {
    let list = mergeEvents([], [event(1), event(2)], 3);
    list = mergeEvents(list, [event(2), event(3), event(4)], 3);
    expect(list.map((e) => e.storeSequence)).toEqual(['4', '3', '2']);
    // Sequences are compared as integers, not text ("10" > "9").
    expect(mergeEvents([event(9)], [event(10)], 5).map((e) => e.storeSequence)).toEqual([
      '10',
      '9',
    ]);
  });
});
