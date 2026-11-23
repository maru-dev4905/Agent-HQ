import type { AgentEvent } from '@agent-hq/events';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EventStore } from '../src/index.js';

/**
 * Behaviour every EventStore implementation must satisfy (HQ-104). Kept separate from the
 * PostgreSQL implementation so another backend can reuse it (RSK-003).
 */
export interface EventStoreFixture {
  store: () => EventStore;
  /**
   * Empties all tables and seeds workspace `ws_a` (connections `conn_1`, `conn_2`) and
   * workspace `ws_b` (connection `ws_b_conn_1`).
   */
  reset: () => Promise<void>;
  outboxCount: () => Promise<number>;
  /** Attempts a raw UPDATE of one stored event, bypassing the EventStore interface. */
  rawUpdateFirstEvent: () => Promise<void>;
}

let counter = 0;
export function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  counter += 1;
  return {
    id: `evt_${counter}`,
    schemaVersion: 1,
    type: 'task.started',
    occurredAt: '2026-11-20T05:00:00.000Z',
    receivedAt: '2026-11-20T05:00:01.000Z',
    workspaceId: 'ws_a',
    connectionId: 'conn_1',
    source: {
      adapterId: 'simulator',
      runtime: 'simulator',
      externalSessionId: 's1',
      externalTaskId: 't1',
    },
    correlationId: 'run_1',
    idempotencyKey: `key_${counter}`,
    sequence: counter,
    payload: {},
    ...overrides,
  } as AgentEvent;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function eventStoreContract(name: string, fixture: EventStoreFixture): void {
  describe(`EventStore contract — ${name}`, () => {
    beforeEach(() => fixture.reset());

    it('exposes no update or delete operation (append-only)', () => {
      expect(Object.keys(fixture.store()).sort()).toEqual(['readFrom', 'transaction']);
    });

    it('stores events with increasing sequences and reads them back unchanged', async () => {
      const store = fixture.store();
      const first = makeEvent();
      const second = makeEvent({
        type: 'task.completed',
        payload: { summary: 'done' },
      });
      const outcomes = await store.transaction('ws_a', async (tx) => [
        await tx.append(first),
        await tx.append(second),
      ]);
      expect(outcomes.map((o) => o.status)).toEqual(['stored', 'stored']);

      const read = await store.readFrom('ws_a', 0n, 10);
      expect(read.map((e) => e.id)).toEqual([first.id, second.id]);
      expect(read[0]!.storeSequence < read[1]!.storeSequence).toBe(true);
      const { storeSequence: _s, ...roundTripped } = read[1]!;
      expect(roundTripped).toEqual(second);
      expect(await fixture.outboxCount()).toBe(2);
    });

    it('does not store a duplicate idempotency key and reports whether content differs', async () => {
      const store = fixture.store();
      const original = makeEvent({ idempotencyKey: 'same' });
      const retry = { ...original, id: 'evt_retry', receivedAt: '2026-11-20T06:00:00.000Z' };
      const tampered = { ...original, id: 'evt_tampered', correlationId: 'other' };

      const [stored, again, changed] = await store.transaction('ws_a', async (tx) => [
        await tx.append(original),
        await tx.append(retry),
        await tx.append(tampered),
      ]);
      if (stored?.status !== 'stored') throw new Error('expected first append to store');
      expect(again).toEqual({
        status: 'duplicate',
        storeSequence: stored.storeSequence,
        conflict: false,
      });
      expect(changed).toEqual({
        status: 'duplicate',
        storeSequence: stored.storeSequence,
        conflict: true,
      });

      const read = await store.readFrom('ws_a', 0n, 10);
      expect(read.map((e) => e.correlationId)).toEqual(['run_1']);
      expect(await fixture.outboxCount()).toBe(1);
    });

    it('scopes idempotency keys by connection', async () => {
      const store = fixture.store();
      const outcomes = await store.transaction('ws_a', async (tx) => [
        await tx.append(makeEvent({ idempotencyKey: 'k', connectionId: 'conn_1' })),
        await tx.append(makeEvent({ idempotencyKey: 'k', connectionId: 'conn_2' })),
      ]);
      expect(outcomes.map((o) => o.status)).toEqual(['stored', 'stored']);
    });

    it('reports an id reused by a different event', async () => {
      const store = fixture.store();
      const outcomes = await store.transaction('ws_a', async (tx) => [
        await tx.append(makeEvent({ id: 'evt_dup' })),
        await tx.append(makeEvent({ id: 'evt_dup' })),
      ]);
      expect(outcomes.map((o) => o.status)).toEqual(['stored', 'id_conflict']);
    });

    it('reads after a cursor with a limit, isolated per workspace', async () => {
      const store = fixture.store();
      await store.transaction('ws_a', async (tx) => {
        for (let i = 0; i < 5; i += 1) await tx.append(makeEvent());
      });
      await store.transaction('ws_b', (tx) =>
        tx.append(makeEvent({ workspaceId: 'ws_b', connectionId: 'ws_b_conn_1' })),
      );

      const all = await store.readFrom('ws_a', 0n, 100);
      expect(all).toHaveLength(5);
      const page = await store.readFrom('ws_a', all[1]!.storeSequence, 2);
      expect(page.map((e) => e.id)).toEqual([all[2]!.id, all[3]!.id]);
      expect((await store.readFrom('ws_b', 0n, 100)).map((e) => e.workspaceId)).toEqual(['ws_b']);
    });

    it('never lets a cursor reader skip an event that commits late', async () => {
      const store = fixture.store();
      // A appends (taking its sequence) and then waits for permission to commit.
      let appended!: () => void;
      const aAppended = new Promise<void>((resolve) => (appended = resolve));
      let allowCommit!: () => void;
      const commitGate = new Promise<void>((resolve) => (allowCommit = resolve));

      const slow = store.transaction('ws_a', async (tx) => {
        const outcome = await tx.append(makeEvent({ id: 'evt_slow' }));
        appended();
        await commitGate;
        return outcome;
      });
      await aAppended;
      // B starts only after A holds the lock and its sequence.
      const fast = store.transaction('ws_a', (tx) => tx.append(makeEvent({ id: 'evt_fast' })));
      await sleep(150);
      // B must still be blocked: if it were visible, a cursor would move past A's sequence.
      expect(await store.readFrom('ws_a', 0n, 10)).toEqual([]);

      allowCommit();
      await Promise.all([slow, fast]);
      expect((await store.readFrom('ws_a', 0n, 10)).map((e) => e.id)).toEqual([
        'evt_slow',
        'evt_fast',
      ]);
    });

    it('keeps sequences unique and ordered under concurrent appends', async () => {
      const store = fixture.store();
      await Promise.all(
        Array.from({ length: 20 }, () => store.transaction('ws_a', (tx) => tx.append(makeEvent()))),
      );
      const read = await store.readFrom('ws_a', 0n, 100);
      expect(read).toHaveLength(20);
      const sequences = read.map((e) => e.storeSequence);
      expect([...sequences].sort((a, b) => (a < b ? -1 : 1))).toEqual(sequences);
      expect(new Set(sequences).size).toBe(20);
    });

    it('maps external IDs to stable HQ IDs scoped by connection', async () => {
      const store = fixture.store();
      let n = 0;
      const newId = () => `agt_hq_${(n += 1)}`;
      const ids = await store.transaction('ws_a', async (tx) => [
        await tx.resolveAgentInstance(
          { workspaceId: 'ws_a', connectionId: 'conn_1', externalId: 'agt_1' },
          newId,
        ),
        await tx.resolveAgentInstance(
          { workspaceId: 'ws_a', connectionId: 'conn_1', externalId: 'agt_1' },
          newId,
        ),
        await tx.resolveAgentInstance(
          { workspaceId: 'ws_a', connectionId: 'conn_2', externalId: 'agt_1' },
          newId,
        ),
        await tx.resolveTask(
          { workspaceId: 'ws_a', connectionId: 'conn_1', externalId: 'agt_1' },
          () => 'task_hq_1',
        ),
      ]);
      expect(ids[0]).toBe(ids[1]);
      expect(ids[2]).not.toBe(ids[0]);
      expect(ids[3]).toBe('task_hq_1');
    });

    it('rejects an event whose connection belongs to another workspace', async () => {
      const store = fixture.store();
      await expect(
        store.transaction('ws_b', (tx) =>
          tx.append(makeEvent({ workspaceId: 'ws_b', connectionId: 'conn_1' })),
        ),
      ).rejects.toThrow();
    });

    it('refuses data for a workspace other than the locked one', async () => {
      const store = fixture.store();
      await expect(
        store.transaction('ws_a', (tx) =>
          tx.append(makeEvent({ workspaceId: 'ws_b', connectionId: 'ws_b_conn_1' })),
        ),
      ).rejects.toThrow(/locked workspace "ws_a"/);
      await expect(
        store.transaction('ws_a', (tx) =>
          tx.resolveAgentInstance(
            { workspaceId: 'ws_b', connectionId: 'ws_b_conn_1', externalId: 'x' },
            () => 'id',
          ),
        ),
      ).rejects.toThrow(/locked workspace "ws_a"/);
    });

    it('allows the same event id in different workspaces', async () => {
      const store = fixture.store();
      const a = await store.transaction('ws_a', (tx) => tx.append(makeEvent({ id: 'shared' })));
      const b = await store.transaction('ws_b', (tx) =>
        tx.append(makeEvent({ id: 'shared', workspaceId: 'ws_b', connectionId: 'ws_b_conn_1' })),
      );
      expect([a.status, b.status]).toEqual(['stored', 'stored']);
    });

    it('treats equal instants written with different precision as the same content', async () => {
      const store = fixture.store();
      const original = makeEvent({ idempotencyKey: 'k', occurredAt: '2026-11-20T05:00:00Z' });
      const retry = { ...original, id: 'evt_retry2', occurredAt: '2026-11-20T05:00:00.000Z' };
      const [, again] = await store.transaction('ws_a', async (tx) => [
        await tx.append(original),
        await tx.append(retry),
      ]);
      expect(again).toMatchObject({ status: 'duplicate', conflict: false });
      expect((await store.readFrom('ws_a', 0n, 10))[0]?.occurredAt).toBe(
        '2026-11-20T05:00:00.000Z',
      );
    });

    it('rejects out-of-range read limits and cursors', async () => {
      const store = fixture.store();
      await expect(store.readFrom('ws_a', 0n, 0)).rejects.toThrow(RangeError);
      await expect(store.readFrom('ws_a', 0n, -5)).rejects.toThrow(RangeError);
      await expect(store.readFrom('ws_a', 0n, 1001)).rejects.toThrow(RangeError);
      await expect(store.readFrom('ws_a', -1n, 10)).rejects.toThrow(RangeError);
    });

    it('blocks updates of stored events even outside the EventStore interface', async () => {
      const store = fixture.store();
      await store.transaction('ws_a', (tx) => tx.append(makeEvent()));
      await expect(fixture.rawUpdateFirstEvent()).rejects.toThrow(/append-only/);
    });

    it('rolls back appends when the transaction fails', async () => {
      const store = fixture.store();
      await expect(
        store.transaction('ws_a', async (tx) => {
          await tx.append(makeEvent());
          throw new Error('projection failed');
        }),
      ).rejects.toThrow('projection failed');
      expect(await store.readFrom('ws_a', 0n, 10)).toEqual([]);
      expect(await fixture.outboxCount()).toBe(0);
    });
  });
}
