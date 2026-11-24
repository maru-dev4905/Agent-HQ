import type { StoredEvent } from '@agent-hq/database';
import { generate, SCENARIO_NAMES } from '@agent-hq/simulator';
import { describe, expect, it } from 'vitest';
import { foldAll, publicView, storeStream } from './projection.test-helpers.js';
import { isNewer, projectAgent } from './projector.js';

describe('projector — scenarios', () => {
  it('single-agent ends idle through explicit signals and its task succeeds', () => {
    const { agents, tasks } = foldAll(storeStream(generate({ scenario: 'single-agent', seed: 1 })));
    expect(agents.get('agent:agent_main')).toMatchObject({
      observedStatus: 'idle',
      rawStatus: 'completed',
      agentName: 'main',
    });
    expect(tasks.get('task:task_main')).toMatchObject({
      status: 'succeeded',
      title: 'Implement feature',
      agentInstanceId: 'agent:agent_main',
    });
  });

  it('delegation records parent links, roles and subtask ownership', () => {
    const { agents, tasks } = foldAll(storeStream(generate({ scenario: 'delegation', seed: 1 })));
    expect(agents.get('agent:agent_reviewer')).toMatchObject({
      roleHint: 'reviewer',
      parentExternalAgentId: 'agent_main',
      observedStatus: 'idle',
    });
    expect(tasks.get('task:task_impl')).toMatchObject({
      status: 'succeeded',
      parentExternalTaskId: 'task_feature',
      agentInstanceId: 'agent:agent_worker',
    });
    expect(tasks.get('task:task_feature')).toMatchObject({
      status: 'succeeded',
      parentExternalTaskId: null,
    });
  });

  it('failure-gap ends with an explicitly disconnected agent and a failed task', () => {
    const { agents, tasks } = foldAll(storeStream(generate({ scenario: 'failure-gap', seed: 1 })));
    expect(agents.get('agent:agent_main')).toMatchObject({
      observedStatus: 'disconnected',
      rawStatus: 'connection lost',
    });
    expect(tasks.get('task:task_flaky')).toMatchObject({ status: 'failed' });
  });

  it('never infers idle from silence: a stream cut short keeps the last explicit status', () => {
    const { agents } = foldAll(
      storeStream(generate({ scenario: 'single-agent', seed: 1, cutAfter: 6 })),
    );
    expect(agents.get('agent:agent_main')?.observedStatus).toBe('working');
  });

  it('counts task events of the owning agent as activity without changing its status', () => {
    const stream = storeStream(generate({ scenario: 'single-agent', seed: 1 }));
    const lastTaskEvent = stream.filter((e) => e.type.startsWith('task.')).at(-1)!;
    const beforeTask = foldAll(stream.slice(0, stream.indexOf(lastTaskEvent)));
    const agent = beforeTask.agents.get('agent:agent_main')!;
    const next = projectAgent(agent, lastTaskEvent)!;
    expect(next.observedStatus).toBe(agent.observedStatus);
    expect(next.lastEventAt >= lastTaskEvent.occurredAt).toBe(true);
    expect(next.lastEventType).toBe(lastTaskEvent.type);
  });

  it('marks an agent first seen through a tool call as unknown, not idle or connected', () => {
    const [toolEvent] = storeStream(generate({ scenario: 'single-agent', seed: 1 })).filter(
      (e) => e.type === 'tool.call.started',
    );
    expect(projectAgent(null, toolEvent!)?.observedStatus).toBe('unknown');
  });
});

describe('projector — order independence on simulator streams (TS-04)', () => {
  it.each(SCENARIO_NAMES)(
    'gives the same state for shuffled and duplicated delivery (%s)',
    (scenario) => {
      for (let seed = 1; seed <= 25; seed += 1) {
        const ordered = publicView(foldAll(storeStream(generate({ scenario, seed }))));
        const shuffled = publicView(
          foldAll(storeStream(generate({ scenario, seed, shuffle: true, duplicateRate: 0.3 }))),
        );
        expect(shuffled).toEqual(ordered);
      }
    },
  );
});

/** Hand-built events for adversarial orderings the simulator never produces. */
function event(
  n: number,
  fields: {
    type: string;
    occurredAt: string;
    session?: string;
    sequence?: number;
    payload?: Record<string, unknown>;
    task?: boolean;
  },
): StoredEvent {
  return {
    id: `e${n}`,
    schemaVersion: 1,
    type: fields.type,
    occurredAt: fields.occurredAt,
    receivedAt: fields.occurredAt,
    workspaceId: 'w',
    connectionId: 'c',
    source: {
      adapterId: 'test',
      runtime: 'test',
      ...(fields.session === undefined ? {} : { externalSessionId: fields.session }),
    },
    correlationId: 'run',
    idempotencyKey: `key_${n}`,
    ...(fields.sequence === undefined ? {} : { sequence: fields.sequence }),
    payload: fields.payload ?? {},
    storeSequence: 0n,
    ...(fields.task === true
      ? { taskId: 'task_1', agentInstanceId: 'agent_1' }
      : { agentInstanceId: 'agent_1' }),
  } as unknown as StoredEvent;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

/** Applies every arrival order (assigning storeSequence by arrival) and returns the distinct outcomes. */
function outcomes(events: StoredEvent[]) {
  return new Set(
    permutations(events).map((order) =>
      JSON.stringify(
        publicView(foldAll(order.map((e, i) => ({ ...e, storeSequence: BigInt(i + 1) })))),
        (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
      ),
    ),
  );
}

describe('projector — adversarial orderings', () => {
  const t = '2026-11-24T00:00:00.000Z';

  it('resolves equal timestamps from different sessions the same way in every order', () => {
    const events = [
      event(1, { type: 'task.started', occurredAt: t, session: 's1', sequence: 1, task: true }),
      event(2, { type: 'task.completed', occurredAt: t, session: 's2', sequence: 1, task: true }),
      event(3, { type: 'task.failed', occurredAt: t, task: true }),
    ];
    expect(outcomes(events).size).toBe(1);
  });

  it('breaks a full tie (same time, no session, no sequence) by a key stable across redelivery', () => {
    const events = [
      event(1, { type: 'task.failed', occurredAt: t, task: true }),
      event(2, { type: 'task.completed', occurredAt: t, task: true }),
    ];
    expect(outcomes(events).size).toBe(1);
  });

  it('keeps fields from an older event that a newer event does not carry', () => {
    const older = event(1, {
      type: 'agent.connected',
      occurredAt: '2026-11-24T00:00:01.000Z',
      payload: { agentName: 'main' },
    });
    const newer = event(2, {
      type: 'agent.started',
      occurredAt: '2026-11-24T00:00:02.000Z',
      payload: { roleHint: 'reviewer' },
    });
    const results = outcomes([older, newer]);
    expect(results.size).toBe(1);
    const [only] = [...results];
    expect(JSON.parse(only!)).toMatchObject({
      agents: [{ agentName: 'main', roleHint: 'reviewer' }],
    });
  });

  it('has no ordering cycle between sessions and a clock that goes backwards', () => {
    const events = [
      event(1, {
        type: 'agent.status.changed',
        occurredAt: '2026-11-24T00:00:03.000Z',
        session: 's1',
        sequence: 1,
        payload: { status: 'working' },
      }),
      event(2, {
        type: 'agent.status.changed',
        occurredAt: '2026-11-24T00:00:01.000Z',
        session: 's1',
        sequence: 2,
        payload: { status: 'waiting' },
      }),
      event(3, {
        type: 'agent.status.changed',
        occurredAt: '2026-11-24T00:00:02.000Z',
        session: 's2',
        sequence: 1,
        payload: { status: 'failed' },
      }),
    ];
    const results = outcomes(events);
    expect(results.size).toBe(1);
    // Documented trade-off (event-schema N8): when a session's clock goes backwards, the
    // timestamp wins over sequence, so the latest-timestamp event (status working) decides.
    expect(JSON.parse([...results][0]!)).toMatchObject({ agents: [{ observedStatus: 'working' }] });
  });
});

describe('isNewer — total order', () => {
  const key = (
    occurredAt: string,
    session: string | null,
    sequence: number | null,
    idempotencyKey: string,
  ) => ({
    occurredAt,
    session,
    sequence,
    idempotencyKey,
    storeSequence: '1',
  });

  it('orders by occurredAt, then session, sequence and idempotency key', () => {
    expect(
      isNewer(
        key('2026-01-02T00:00:00.000Z', 'a', 1, 'k'),
        key('2026-01-01T00:00:00.000Z', 'a', 9, 'k'),
      ),
    ).toBe(true);
    expect(
      isNewer(
        key('2026-01-01T00:00:00.000Z', 'a', 2, 'k'),
        key('2026-01-01T00:00:00.000Z', 'a', 1, 'k'),
      ),
    ).toBe(true);
    expect(
      isNewer(
        key('2026-01-01T00:00:00.000Z', 'b', 1, 'k'),
        key('2026-01-01T00:00:00.000Z', 'a', 9, 'k'),
      ),
    ).toBe(true);
    expect(
      isNewer(
        key('2026-01-01T00:00:00.000Z', null, null, 'k2'),
        key('2026-01-01T00:00:00.000Z', null, null, 'k1'),
      ),
    ).toBe(true);
    expect(isNewer(key('2026-01-01T00:00:00.000Z', 'a', 1, 'k'), undefined)).toBe(true);
  });

  it('is antisymmetric and irreflexive', () => {
    const a = key('2026-01-01T00:00:00.000Z', 'a', 1, 'k1');
    const b = key('2026-01-01T00:00:00.000Z', null, null, 'k2');
    expect(isNewer(a, b)).not.toBe(isNewer(b, a));
    expect(isNewer(a, a)).toBe(false);
  });
});
