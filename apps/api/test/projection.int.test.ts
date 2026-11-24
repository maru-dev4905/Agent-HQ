import { createDatabaseClient, createEventStore, readProjections } from '@agent-hq/database';
import type { AgentEvent, IncomingAgentEvent } from '@agent-hq/events';
import { generate, SCENARIO_NAMES } from '@agent-hq/simulator';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyProjections, replayProjections } from '../src/projection/projection.service.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
if (databaseUrl === undefined)
  throw new Error('TEST_DATABASE_URL is set by test/integration-setup.ts');

const db = createDatabaseClient(databaseUrl);
const events = createEventStore(db);
afterAll(() => db.$disconnect());

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE agent_current_state, task_current_state, event_outbox, events, agent_instances, tasks, connections, registration_codes, workspaces RESTART IDENTITY CASCADE',
  );
  for (const ws of ['ws_ordered', 'ws_shuffled']) {
    await db.workspace.create({ data: { id: ws, name: ws } });
    await db.connection.create({
      data: {
        id: `${ws}_conn`,
        workspaceId: ws,
        adapterId: 'simulator',
        runtime: 'simulator',
        tokenHash: `hash_${ws}`,
        tokenExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    });
  }
});

/**
 * Stand-in for ingestion (HQ-105): map external IDs, append, and project in the same
 * transaction — the exact path ingestion will take.
 */
async function ingest(workspaceId: string, stream: IncomingAgentEvent[]): Promise<void> {
  const connectionId = `${workspaceId}_conn`;
  let n = 0;
  for (const incoming of stream) {
    await events.transaction(workspaceId, async (tx) => {
      const { externalAgentId, externalTaskId } = incoming.source as {
        externalAgentId?: string;
        externalTaskId?: string;
      };
      const ref = (externalId: string) => ({ workspaceId, connectionId, externalId });
      const agentInstanceId =
        externalAgentId === undefined
          ? undefined
          : await tx.resolveAgentInstance(
              ref(externalAgentId),
              () => `${workspaceId}:agent:${externalAgentId}`,
            );
      const taskId =
        externalTaskId === undefined
          ? undefined
          : await tx.resolveTask(
              ref(externalTaskId),
              () => `${workspaceId}:task:${externalTaskId}`,
            );
      n += 1;
      const event = {
        ...incoming,
        id: `${workspaceId}:evt:${n}`,
        workspaceId,
        connectionId,
        receivedAt: incoming.occurredAt,
        ...(agentInstanceId === undefined ? {} : { agentInstanceId }),
        ...(taskId === undefined ? {} : { taskId }),
      } as AgentEvent;
      const outcome = await tx.append(event);
      if (outcome.status === 'stored')
        await applyProjections(tx, { ...event, storeSequence: outcome.storeSequence });
    });
  }
}

/** Read models with workspace-specific IDs and log positions removed, for cross-workspace comparison. */
async function comparable(workspaceId: string) {
  const strip = (value: string | null) =>
    value === null ? null : value.replace(`${workspaceId}:`, '');
  const { agents, tasks } = await readProjections(db, workspaceId);
  return {
    agents: agents.map(
      ({
        orderKeys: _o,
        lastStoreSequence: _l,
        lastReceivedAt: _r,
        workspaceId: _w,
        connectionId: _c,
        ...rest
      }) => ({
        ...rest,
        agentInstanceId: strip(rest.agentInstanceId),
      }),
    ),
    tasks: tasks.map(
      ({
        orderKeys: _o,
        lastStoreSequence: _l,
        lastReceivedAt: _r,
        workspaceId: _w,
        connectionId: _c,
        ...rest
      }) => ({
        ...rest,
        taskId: strip(rest.taskId),
        agentInstanceId: strip(rest.agentInstanceId),
      }),
    ),
  };
}

describe('projections (PostgreSQL)', () => {
  it.each(SCENARIO_NAMES)(
    'replay rebuilds exactly the live read models (TS-03, %s)',
    async (scenario) => {
      await ingest(
        'ws_shuffled',
        generate({ scenario, seed: 7, shuffle: true, duplicateRate: 0.4 }),
      );
      const live = await readProjections(db, 'ws_shuffled');
      expect(live.agents.length).toBeGreaterThan(0);

      const applied = await replayProjections(events, 'ws_shuffled');
      expect(applied).toBe((await events.readFrom('ws_shuffled', 0n, 1000)).length);
      expect(await readProjections(db, 'ws_shuffled')).toEqual(live);
    },
  );

  it.each(SCENARIO_NAMES)(
    'reaches the same state whatever the arrival order (TS-04, %s)',
    async (scenario) => {
      await ingest('ws_ordered', generate({ scenario, seed: 3 }));
      await ingest(
        'ws_shuffled',
        generate({ scenario, seed: 3, shuffle: true, duplicateRate: 0.4 }),
      );
      expect(await comparable('ws_shuffled')).toEqual(await comparable('ws_ordered'));
    },
  );

  it('replay of one workspace leaves other workspaces untouched', async () => {
    await ingest('ws_ordered', generate({ scenario: 'delegation', seed: 1 }));
    await ingest('ws_shuffled', generate({ scenario: 'single-agent', seed: 1 }));
    const other = await readProjections(db, 'ws_shuffled');
    await replayProjections(events, 'ws_ordered');
    expect(await readProjections(db, 'ws_shuffled')).toEqual(other);
  });
});
