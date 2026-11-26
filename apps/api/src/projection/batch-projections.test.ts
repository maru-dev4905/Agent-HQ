import type { AgentStateRow, ProjectionTransaction, TaskStateRow } from '@agent-hq/database';
import { describe, expect, it } from 'vitest';
import { BatchProjections } from './projection.service.js';

const agent = (id: string, connectionId: string, status = 'connected'): AgentStateRow => ({
  agentInstanceId: id,
  workspaceId: 'w',
  connectionId,
  observedStatus: status,
  rawStatus: null,
  agentName: null,
  roleHint: null,
  parentExternalAgentId: null,
  executionLocation: null,
  lastEventType: 'agent.started',
  lastEventAt: '2026-11-26T00:00:00.000Z',
  lastReceivedAt: '2026-11-26T00:00:00.000Z',
  lastStoreSequence: 1n,
  orderKeys: {},
  connectionLostAt: null,
});

function fakeDb(stored: AgentStateRow[]) {
  const calls: string[] = [];
  const db = {
    getAgent: (id: string) => {
      calls.push(`getAgent:${id}`);
      return Promise.resolve(stored.find((a) => a.agentInstanceId === id) ?? null);
    },
    putAgent: (row: AgentStateRow) => {
      calls.push(`putAgent:${row.agentInstanceId}:${row.observedStatus}`);
      return Promise.resolve();
    },
    getTask: (id: string) => {
      calls.push(`getTask:${id}`);
      return Promise.resolve(null);
    },
    putTask: (row: TaskStateRow) => {
      calls.push(`putTask:${row.taskId}`);
      return Promise.resolve();
    },
    listAgentsOfConnection: (c: string) => {
      calls.push(`list:${c}`);
      return Promise.resolve(stored.filter((a) => a.connectionId === c));
    },
    lastConnectionLossBefore: () => Promise.resolve(null),
  } as unknown as ProjectionTransaction;
  return { db, calls };
}

describe('BatchProjections (ingestion write-back cache, HQ-113)', () => {
  it('reads each row once and writes each changed row once, at flush', async () => {
    const { db, calls } = fakeDb([agent('a1', 'c')]);
    const batch = new BatchProjections(db);
    const first = (await batch.getAgent('a1'))!;
    await batch.putAgent({ ...first, observedStatus: 'working' });
    expect((await batch.getAgent('a1'))?.observedStatus).toBe('working');
    await batch.putAgent({ ...first, observedStatus: 'waiting' });
    expect(calls).toEqual(['getAgent:a1']);
    await batch.flush();
    expect(calls).toEqual(['getAgent:a1', 'putAgent:a1:waiting']);
    // A second flush writes nothing new.
    await batch.flush();
    expect(calls).toHaveLength(2);
  });

  it('lists agents of a connection with rows changed or created in the batch taking over', async () => {
    const { db } = fakeDb([agent('a1', 'c'), agent('a2', 'c'), agent('b1', 'other')]);
    const batch = new BatchProjections(db);
    await batch.putAgent(agent('a2', 'c', 'working'));
    await batch.putAgent(agent('a0', 'c', 'idle')); // first seen in this batch
    const rows = await batch.listAgentsOfConnection('c');
    expect(rows.map((r) => `${r.agentInstanceId}:${r.observedStatus}`)).toEqual([
      'a0:idle',
      'a1:connected',
      'a2:working',
    ]);
  });
});
