import type { ConnectionStatus } from '@agent-hq/domain';
import type { DatabaseClient } from './index.js';

/** What authentication and health checks need to know about a connection. */
export interface ConnectionRecord {
  id: string;
  workspaceId: string;
  status: ConnectionStatus;
  tokenExpiresAt: Date;
  revokedAt: Date | null;
  lastHeartbeatAt: Date | null;
}

export interface NewConnection {
  id: string;
  adapterId: string;
  runtime: string;
  displayName?: string;
  /** SHA-256 of the token. The raw token never reaches the database. */
  tokenHash: string;
  tokenExpiresAt: Date;
}

export interface ConnectionStore {
  /** Creates the workspace if missing (Phase 1 runs one local workspace). */
  ensureWorkspace(id: string, name: string): Promise<void>;
  createRegistrationCode(input: {
    id: string;
    workspaceId: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void>;
  /**
   * Consumes an unused, unexpired registration code and creates the connection atomically.
   * Returns null when the code is unknown, used or expired; concurrent uses succeed once.
   */
  register(input: {
    codeHash: string;
    now: Date;
    connection: NewConnection;
  }): Promise<{ workspaceId: string } | null>;
  findByTokenHash(tokenHash: string): Promise<ConnectionRecord | null>;
  findById(connectionId: string): Promise<ConnectionRecord | null>;
  recordHeartbeat(connectionId: string, now: Date): Promise<ConnectionRecord>;
  /** Returns false when the connection does not exist or was already revoked. */
  revoke(connectionId: string, now: Date): Promise<boolean>;
  /**
   * Connections whose status may still change: not revoked, or revoked but not yet marked
   * `disconnected` (so revocation is always reflected in status and events).
   */
  listActive(): Promise<ConnectionRecord[]>;
}

const select = {
  id: true,
  workspaceId: true,
  status: true,
  tokenExpiresAt: true,
  revokedAt: true,
  lastHeartbeatAt: true,
} as const;

function toRecord(row: {
  id: string;
  workspaceId: string;
  status: string;
  tokenExpiresAt: Date;
  revokedAt: Date | null;
  lastHeartbeatAt: Date | null;
}): ConnectionRecord {
  // `status` is only written by this package with ConnectionStatus values.
  return { ...row, status: row.status as ConnectionStatus };
}

export function createConnectionStore(db: DatabaseClient): ConnectionStore {
  return {
    async ensureWorkspace(id, name) {
      await db.workspace.upsert({ where: { id }, create: { id, name }, update: {} });
    },

    async createRegistrationCode(input) {
      await db.registrationCode.create({ data: input });
    },

    register({ codeHash, now, connection }) {
      return db.$transaction(async (tx) => {
        const consumed = await tx.$queryRaw<{ workspace_id: string }[]>`
          UPDATE registration_codes SET used_at = ${now}::timestamptz
          WHERE code_hash = ${codeHash} AND used_at IS NULL AND expires_at > ${now}::timestamptz
          RETURNING workspace_id`;
        const workspaceId = consumed[0]?.workspace_id;
        if (workspaceId === undefined) return null;
        await tx.connection.create({
          data: {
            id: connection.id,
            workspaceId,
            adapterId: connection.adapterId,
            runtime: connection.runtime,
            displayName: connection.displayName ?? null,
            tokenHash: connection.tokenHash,
            tokenExpiresAt: connection.tokenExpiresAt,
          },
        });
        return { workspaceId };
      });
    },

    async findByTokenHash(tokenHash) {
      const row = await db.connection.findUnique({ where: { tokenHash }, select });
      return row === null ? null : toRecord(row);
    },

    async findById(connectionId) {
      const row = await db.connection.findUnique({ where: { id: connectionId }, select });
      return row === null ? null : toRecord(row);
    },

    async recordHeartbeat(connectionId, now) {
      const row = await db.connection.update({
        where: { id: connectionId },
        data: { lastHeartbeatAt: now },
        select,
      });
      return toRecord(row);
    },

    async revoke(connectionId, now) {
      const { count } = await db.connection.updateMany({
        where: { id: connectionId, revokedAt: null },
        data: { revokedAt: now },
      });
      return count === 1;
    },

    async listActive() {
      const rows = await db.connection.findMany({
        where: { OR: [{ revokedAt: null }, { status: { not: 'disconnected' } }] },
        select,
        orderBy: { id: 'asc' },
      });
      return rows.map(toRecord);
    },
  };
}
