import type { ConnectionRecord, ConnectionStore } from '@agent-hq/database';

/** In-memory ConnectionStore for unit tests (the real one is covered by integration tests). */
export function fakeConnectionStore(records: ConnectionRecord[] = []) {
  const byHash = new Map<string, ConnectionRecord>();
  const codes = new Map<string, { workspaceId: string; expiresAt: Date; usedAt: Date | null }>();
  for (const record of records) byHash.set(`hash-of-${record.id}`, record);
  const store: ConnectionStore = {
    ensureWorkspace: () => Promise.resolve(),
    createRegistrationCode: ({ workspaceId, codeHash, expiresAt }) => {
      codes.set(codeHash, { workspaceId, expiresAt, usedAt: null });
      return Promise.resolve();
    },
    register: ({ codeHash, now, connection }) => {
      const code = codes.get(codeHash);
      if (code === undefined || code.usedAt !== null || code.expiresAt <= now)
        return Promise.resolve(null);
      code.usedAt = now;
      byHash.set(connection.tokenHash, {
        id: connection.id,
        workspaceId: code.workspaceId,
        status: 'pending',
        tokenExpiresAt: connection.tokenExpiresAt,
        revokedAt: null,
        lastHeartbeatAt: null,
      });
      return Promise.resolve({ workspaceId: code.workspaceId });
    },
    findByTokenHash: (hash) => Promise.resolve(byHash.get(hash) ?? null),
    findById: (id) => Promise.resolve([...byHash.values()].find((r) => r.id === id) ?? null),
    recordHeartbeat: (id, now) => {
      const record = [...byHash.values()].find((r) => r.id === id);
      if (record === undefined) return Promise.reject(new Error('missing'));
      record.lastHeartbeatAt = now;
      return Promise.resolve(record);
    },
    revoke: () => Promise.resolve(true),
    listActive: () => Promise.resolve([...byHash.values()].filter((r) => r.revokedAt === null)),
  };
  return { store, byHash, codes };
}
