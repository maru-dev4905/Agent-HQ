import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createConnectionStore, createDatabaseClient, createEventStore } from '../src/index.js';

const url = process.env['TEST_DATABASE_URL'];
if (url === undefined) throw new Error('TEST_DATABASE_URL is set by test/integration-setup.ts');

const db = createDatabaseClient(url);
afterAll(() => db.$disconnect());
const store = createConnectionStore(db);

const now = new Date('2026-11-23T01:00:00.000Z');
const later = (ms: number) => new Date(now.getTime() + ms);
let n = 0;
const connection = (overrides: { tokenHash?: string } = {}) => {
  n += 1;
  return {
    id: `conn_${n}`,
    adapterId: 'simulator',
    runtime: 'simulator',
    tokenHash: overrides.tokenHash ?? `hash_${n}`,
    tokenExpiresAt: later(86_400_000),
  };
};

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE event_outbox, events, agent_instances, tasks, connections, registration_codes, workspaces RESTART IDENTITY CASCADE',
  );
  await store.ensureWorkspace('local', 'Local');
  await store.createRegistrationCode({
    id: 'code_1',
    workspaceId: 'local',
    codeHash: 'code_hash_1',
    expiresAt: later(600_000),
  });
});

describe('ConnectionStore', () => {
  it('ensureWorkspace is idempotent', async () => {
    await store.ensureWorkspace('local', 'Renamed');
    expect(await db.workspace.findUnique({ where: { id: 'local' } })).toMatchObject({
      name: 'Local',
    });
  });

  it('registers with a valid code exactly once', async () => {
    expect(
      await store.register({ codeHash: 'code_hash_1', now, connection: connection() }),
    ).toEqual({
      workspaceId: 'local',
    });
    expect(
      await store.register({ codeHash: 'code_hash_1', now, connection: connection() }),
    ).toBeNull();
  });

  it('rejects unknown and expired codes', async () => {
    expect(await store.register({ codeHash: 'nope', now, connection: connection() })).toBeNull();
    expect(
      await store.register({
        codeHash: 'code_hash_1',
        now: later(600_000),
        connection: connection(),
      }),
    ).toBeNull();
  });

  it('lets only one of several concurrent registrations consume a code', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        store.register({ codeHash: 'code_hash_1', now, connection: connection() }),
      ),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await db.connection.count()).toBe(1);
  });

  it('finds a connection by token hash and records heartbeats', async () => {
    const created = connection({ tokenHash: 'token_hash_x' });
    await store.register({ codeHash: 'code_hash_1', now, connection: created });
    const found = await store.findByTokenHash('token_hash_x');
    expect(found).toMatchObject({
      id: created.id,
      workspaceId: 'local',
      status: 'pending',
      lastHeartbeatAt: null,
    });
    expect((await store.recordHeartbeat(created.id, later(1000))).lastHeartbeatAt).toEqual(
      later(1000),
    );
    expect(await store.findByTokenHash('other')).toBeNull();
  });

  it('never moves the heartbeat backwards when requests overlap', async () => {
    const created = connection();
    await store.register({ codeHash: 'code_hash_1', now, connection: created });
    await store.recordHeartbeat(created.id, later(60_000));
    const stale = await store.recordHeartbeat(created.id, later(1_000));
    expect(stale.lastHeartbeatAt).toEqual(later(60_000));
  });

  it('revokes only once', async () => {
    const created = connection();
    await store.register({ codeHash: 'code_hash_1', now, connection: created });
    expect(await store.revoke(created.id, now)).toBe(true);
    expect(await store.revoke(created.id, now)).toBe(false);
  });

  it('changes status only if status, heartbeat and revocation are unchanged', async () => {
    const created = connection();
    await store.register({ codeHash: 'code_hash_1', now, connection: created });
    const events = createEventStore(db);
    const before = await store.findByTokenHash(created.tokenHash);
    if (before === null) throw new Error('missing');

    const [first, stale] = await events.transaction('local', async (tx) => [
      await tx.setConnectionStatus(before, 'connected'),
      await tx.setConnectionStatus(before, 'degraded'),
    ]);
    expect([first, stale]).toEqual([true, false]);

    // A heartbeat landing after an evaluation read the row must win over that evaluation.
    const evaluated = await store.findByTokenHash(created.tokenHash);
    if (evaluated === null) throw new Error('missing');
    await store.recordHeartbeat(created.id, later(5_000));
    const raced = await events.transaction('local', (tx) =>
      tx.setConnectionStatus(evaluated, 'degraded'),
    );
    expect(raced).toBe(false);
    expect((await store.findByTokenHash(created.tokenHash))?.status).toBe('connected');
  });

  it('keeps revoked connections in the active list until they are disconnected', async () => {
    const created = connection();
    await store.register({ codeHash: 'code_hash_1', now, connection: created });
    await store.revoke(created.id, now);
    expect((await store.listActive()).map((c) => c.id)).toEqual([created.id]);
    const revoked = await store.findById(created.id);
    if (revoked === null) throw new Error('missing');
    await createEventStore(db).transaction('local', (tx) =>
      tx.setConnectionStatus(revoked, 'disconnected'),
    );
    expect(await store.listActive()).toEqual([]);
  });

  it('never stores a raw token: only the hash column holds token material', async () => {
    const columns = await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'connections'`;
    const names = columns.map((c) => c.column_name);
    expect(names).toContain('token_hash');
    expect(
      names.filter(
        (name) => name.includes('token') && name !== 'token_hash' && name !== 'token_expires_at',
      ),
    ).toEqual([]);
  });
});
