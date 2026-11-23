import { describe, expect, it } from 'vitest';
import { buildEvent } from './fixtures/samples.js';
import { parseIncomingEvent, type ContractIssue } from './envelope.js';
import { EVENT_TYPES } from './payloads.js';

function issuesOf(input: unknown): ContractIssue[] {
  const result = parseIncomingEvent(input);
  if (result.ok) throw new Error('expected the event to be rejected');
  return result.issues;
}

function paths(input: unknown): string[] {
  return issuesOf(input).map((issue) => issue.path);
}

function withSource(type: Parameters<typeof buildEvent>[0], patch: Record<string, unknown>) {
  const event = buildEvent(type);
  return { ...event, source: { ...(event['source'] as object), ...patch } };
}

describe('parseIncomingEvent — valid samples', () => {
  it.each(EVENT_TYPES)('accepts a valid %s event', (type) => {
    const result = parseIncomingEvent(buildEvent(type));
    expect(result).toMatchObject({ ok: true, ignoredFields: [] });
  });

  it('narrows payload and required source IDs by type', () => {
    const result = parseIncomingEvent(buildEvent('tool.call.completed'));
    if (!result.ok || result.event.type !== 'tool.call.completed') throw new Error('unexpected');
    const agentId: string = result.event.source.externalAgentId;
    expect([result.event.payload.toolName, agentId]).toEqual(['Edit', 'agt_1']);
  });

  it('accepts the spec §5 example shape (task.started with a title)', () => {
    const result = parseIncomingEvent(
      buildEvent('task.started', { payload: { title: 'Research' } }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('parseIncomingEvent — forward compatibility without content capture', () => {
  it('drops unknown payload keys and reports only their names', () => {
    const event = buildEvent('tool.call.started', {
      payload: {
        toolName: 'Bash',
        externalToolCallId: 'c',
        fullCommand: 'curl -H "Authorization: x"',
      },
    });
    const result = parseIncomingEvent(event);
    if (!result.ok) throw new Error('expected acceptance');
    expect(result.ignoredFields).toEqual(['payload.fullCommand']);
    expect(JSON.stringify(result.event)).not.toContain('Authorization');
  });

  it('drops unknown envelope keys and reports their names', () => {
    const result = parseIncomingEvent(buildEvent('task.started', { prompt: 'secret plan' }));
    if (!result.ok) throw new Error('expected acceptance');
    expect(result.ignoredFields).toEqual(['prompt']);
    expect(JSON.stringify(result.event)).not.toContain('secret plan');
  });

  it('never carries a __proto__ payload key into the parsed event', () => {
    const raw = JSON.parse(
      '{"toolName":"Bash","externalToolCallId":"c","__proto__":{"fullCommand":"rm -rf /"}}',
    ) as Record<string, unknown>;
    const result = parseIncomingEvent(buildEvent('tool.call.started', { payload: raw }));
    if (!result.ok) throw new Error('expected acceptance');
    expect(result.ignoredFields).toEqual(['payload.__proto__']);
    expect(JSON.stringify(result.event)).not.toContain('rm -rf');
  });
});

describe('parseIncomingEvent — invalid samples', () => {
  it('rejects an unknown event type', () => {
    expect(paths(buildEvent('task.started', { type: 'task.teleported' }))).toContain('type');
  });

  it('rejects an unsupported schemaVersion', () => {
    expect(paths(buildEvent('task.started', { schemaVersion: 2 }))).toContain('schemaVersion');
  });

  it('rejects timestamps that are not UTC ISO-8601', () => {
    expect(
      paths(buildEvent('task.started', { occurredAt: '2026-11-20T14:00:00+09:00' })),
    ).toContain('occurredAt');
    expect(paths(buildEvent('task.started', { occurredAt: 'yesterday' }))).toContain('occurredAt');
    expect(
      paths(buildEvent('task.started', { occurredAt: '2026-11-20T05:00:00.123456Z' })),
    ).toContain('occurredAt');
    expect(
      parseIncomingEvent(buildEvent('task.started', { occurredAt: '2026-11-20T05:00:00.123Z' })).ok,
    ).toBe(true);
  });

  it.each(['receivedAt', 'storeSequence', 'agentInstanceId', 'taskId'])(
    'rejects the server-owned field %s',
    (field) => {
      expect(paths(buildEvent('task.started', { [field]: 'x' }))).toContain(field);
    },
  );

  it('reports envelope, source and payload problems together in one pass', () => {
    const event = buildEvent('tool.call.completed', {
      correlationId: '',
      payload: { durationMs: -1 },
      source: { adapterId: 'simulator', runtime: 'simulator', externalSessionId: 's' },
    });
    expect(paths(event)).toEqual(
      expect.arrayContaining([
        'correlationId',
        'source.externalAgentId',
        'payload.toolName',
        'payload.externalToolCallId',
        'payload.durationMs',
      ]),
    );
  });

  it('requires externalTaskId for task events', () => {
    const event = buildEvent('task.created', {
      source: { adapterId: 'a', runtime: 'r', externalSessionId: 's' },
    });
    expect(paths(event)).toEqual(['source.externalTaskId']);
  });

  it('rejects summaries longer than the content-capture limit', () => {
    const event = buildEvent('task.completed', { payload: { summary: 'x'.repeat(501) } });
    expect(paths(event)).toEqual(['payload.summary']);
  });

  it('rejects blank IDs and control characters that PostgreSQL cannot store', () => {
    expect(paths(buildEvent('task.started', { idempotencyKey: '   ' }))).toContain(
      'idempotencyKey',
    );
    expect(paths(buildEvent('task.started', { correlationId: 'run\u0000' }))).toContain(
      'correlationId',
    );
    expect(
      paths(buildEvent('task.completed', { payload: { summary: 'bad\u0000summary' } })),
    ).toContain('payload.summary');
  });

  it('rejects negative or fractional sequences', () => {
    expect(paths(buildEvent('task.started', { sequence: -1 }))).toContain('sequence');
    expect(paths(buildEvent('task.started', { sequence: 1.5 }))).toContain('sequence');
  });

  it('requires a session when a sequence is given', () => {
    const event = withSource('task.started', { externalSessionId: undefined });
    expect(paths(event)).toEqual(['source.externalSessionId']);
  });

  it('rejects an inverted gap range', () => {
    const event = buildEvent('event.gap.detected', {
      payload: { reason: 'jump', fromSequence: 9, toSequence: 4 },
    });
    expect(paths(event)).toEqual(['payload.toSequence']);
  });

  it('rejects an agent status outside the normalized set', () => {
    const event = buildEvent('agent.status.changed', { payload: { status: 'reviewing' } });
    expect(paths(event)).toEqual(['payload.status']);
  });

  it('rejects non-object input', () => {
    expect(paths(null)).toEqual(['']);
    expect(paths('{"type":"task.started"}')).toEqual(['']);
    expect(paths([])).toEqual(['']);
  });
});
