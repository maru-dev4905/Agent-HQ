import { describe, expect, it } from 'vitest';
import { fakeConnectionStore } from '../connections/fakes.test-helpers.js';
import { hashSecret } from '../connections/secrets.js';
import { runAdmin, type AdminIo } from './cli.js';

const now = new Date('2026-11-23T02:00:00.000Z');
const thresholds = { degradedAfterMs: 30_000, disconnectedAfterMs: 90_000 };

function adminIo(store: AdminIo['store']) {
  const out: string[] = [];
  const transactions: string[] = [];
  const events = {
    transaction: (workspaceId: string) => {
      transactions.push(workspaceId);
      return Promise.resolve({ status: 'disconnected', changed: true });
    },
    readFrom: () => Promise.resolve([]),
  } as unknown as AdminIo['events'];
  const io: AdminIo = { store, events, thresholds, stdout: (t) => out.push(t), now: () => now };
  return { io, out, transactions };
}

describe('runAdmin', () => {
  it('prints a one-time registration code and stores only its hash', async () => {
    const fake = fakeConnectionStore();
    const { io, out } = adminIo(fake.store);
    await runAdmin(['registration-code'], io);
    const code = out.join('').split('\n')[0]!;
    expect(code).toMatch(/^ahq_rc_/);
    expect([...fake.codes.keys()]).toEqual([hashSecret(code)]);
    expect(fake.codes.get(hashSecret(code))?.expiresAt).toEqual(new Date(now.getTime() + 600_000));
  });

  it('revokes a connection and records the status change in an event transaction', async () => {
    const fake = fakeConnectionStore([
      {
        id: 'conn_1',
        workspaceId: 'local',
        status: 'connected',
        tokenExpiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
        lastHeartbeatAt: now,
      },
    ]);
    const { io, out, transactions } = adminIo(fake.store);
    await runAdmin(['revoke', 'conn_1'], io);
    expect(out.join('')).toBe('revoked conn_1\n');
    expect(transactions).toEqual(['local']);
  });

  it('reports an unknown or already revoked connection without recording anything', async () => {
    const { io, out, transactions } = adminIo(fakeConnectionStore().store);
    await runAdmin(['revoke', 'missing'], io);
    expect(out.join('')).toBe('no active connection missing\n');
    expect(transactions).toEqual([]);
  });

  it('replays the local workspace by default and a named one on request', async () => {
    const { io, out, transactions } = adminIo(fakeConnectionStore().store);
    await runAdmin(['replay'], io);
    await runAdmin(['replay', 'ws_other'], io);
    expect(transactions).toEqual(['local', 'ws_other']);
    expect(out.join('')).toContain('read models of local');
  });

  it('rejects unknown commands', async () => {
    await expect(runAdmin(['nope'], adminIo(fakeConnectionStore().store).io)).rejects.toThrow(
      /Usage/,
    );
  });
});
