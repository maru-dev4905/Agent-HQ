import type { StoredEvent } from '@agent-hq/database';
import { generate, SCENARIO_NAMES } from '@agent-hq/simulator';
import { describe, expect, it } from 'vitest';
import { foldAll, publicView, storeStream } from './projection.test-helpers.js';
import { isNewer, projectAgent, projectConnectionLoss, shownAgentStatus } from './projector.js';

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

describe('projector — gaps and connection loss (HQ-108)', () => {
  const fold = (events: StoredEvent[]) =>
    events.reduce<ReturnType<typeof projectAgent>>((row, e) => projectAgent(row, e) ?? row, null);

  it('a recorded gap makes the agent unknown until a later known event', () => {
    const started = event(1, {
      type: 'agent.status.changed',
      occurredAt: '2026-11-25T00:00:01.000Z',
      session: 's',
      sequence: 1,
      payload: { status: 'working' },
    });
    const gap = event(2, {
      type: 'event.gap.detected',
      occurredAt: '2026-11-25T00:00:05.000Z',
      session: 's',
      sequence: 3,
      payload: { reason: 'gap', fromSequence: 2, toSequence: 3 },
    });
    const tool = event(3, {
      type: 'tool.call.started',
      occurredAt: '2026-11-25T00:00:05.000Z',
      session: 's',
      sequence: 4,
      payload: { toolName: 'Bash', externalToolCallId: 'c1' },
    });
    const later = event(4, {
      type: 'agent.status.changed',
      occurredAt: '2026-11-25T00:00:06.000Z',
      session: 's',
      sequence: 5,
      payload: { status: 'waiting' },
    });
    // A tool event after the hole does not tell the status: it stays unknown.
    expect(fold([started, gap, tool])?.observedStatus).toBe('unknown');
    // An explicit status after the hole decides again, whatever the arrival order.
    for (const order of permutations([started, gap, tool, later])) {
      expect(fold(order)?.observedStatus).toBe('waiting');
    }
  });

  /** Delivers events in order; each is received one second after the previous one. */
  function deliver(events: StoredEvent[]) {
    let row: ReturnType<typeof projectAgent> = null;
    events.forEach((e, i) => {
      const received = {
        ...e,
        receivedAt: new Date(Date.UTC(2026, 10, 25, 1, 0, i)).toISOString(),
      } as StoredEvent;
      if (received.type === 'connection.health.changed') {
        if (row !== null) row = projectConnectionLoss(row, received) ?? row;
      } else {
        row = projectAgent(row, received) ?? row;
      }
    });
    return row!;
  }
  const lost = event(9, {
    type: 'connection.health.changed',
    occurredAt: '2026-11-25T00:10:00.000Z',
    payload: { status: 'disconnected' },
  });
  const started = event(1, { type: 'agent.started', occurredAt: '2026-11-25T00:00:00.000Z' });
  const working = event(2, {
    type: 'agent.status.changed',
    occurredAt: '2026-11-25T00:01:00.000Z',
    payload: { status: 'working' },
  });
  const disconnected = event(3, {
    type: 'agent.disconnected',
    occurredAt: '2026-11-25T00:05:00.000Z',
  });

  it('an explicit agent.disconnected wins however late it arrives (review M1)', () => {
    for (const order of permutations([started, working, disconnected, lost])) {
      const row = deliver(order);
      expect(row.observedStatus).toBe('disconnected');
      expect(shownAgentStatus(row)).toBe('disconnected');
    }
  });

  it('shows unknown exactly when the loss came after the last thing received from the agent', () => {
    for (const order of permutations([started, working, lost])) {
      const row = deliver(order);
      expect(row.observedStatus).toBe('working'); // what the agent reported, order-independent
      expect(shownAgentStatus(row)).toBe(order.at(-1) === lost ? 'unknown' : 'working');
    }
    // Never idle: an agent that reported idle still becomes unknown when its connection is lost.
    const idle = deliver([
      started,
      event(4, { type: 'agent.completed', occurredAt: '2026-11-25T00:02:00.000Z' }),
      lost,
    ]);
    expect([idle.observedStatus, shownAgentStatus(idle)]).toEqual(['idle', 'unknown']);
  });

  it('is not fooled by a source clock that runs ahead of the server (review M1)', () => {
    const future = event(5, {
      type: 'agent.status.changed',
      occurredAt: '2099-01-01T00:00:00.000Z',
      payload: { status: 'working' },
    });
    expect(shownAgentStatus(deliver([started, future, lost]))).toBe('unknown');
  });

  it('HQ gap records neither refresh activity times nor undo a connection loss', () => {
    const gap = {
      ...event(6, {
        type: 'event.gap.detected',
        occurredAt: '2026-11-25T00:03:00.000Z',
        payload: { reason: 'gap' },
      }),
      source: { adapterId: 'hq', runtime: 'hq' },
    } as StoredEvent;
    const before = deliver([started, working, lost]);
    const after = deliver([started, working, lost, gap]);
    expect(after.lastReceivedAt).toBe(before.lastReceivedAt);
    expect(after.lastEventAt).toBe(before.lastEventAt);
    expect(shownAgentStatus(after)).toBe('unknown');
  });
});
