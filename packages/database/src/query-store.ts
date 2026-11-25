import type { ConnectionStatus } from '@agent-hq/domain';
import type { DatabaseClient } from './index.js';

/** A connection as shown to the UI: never the token hash. */
export interface ConnectionView {
  id: string;
  adapterId: string;
  runtime: string;
  displayName: string | null;
  status: ConnectionStatus;
  lastHeartbeatAt: Date | null;
  tokenExpiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Read-only queries for the Query API (HQ-107). Read models come from `readProjections`. */
export interface QueryStore {
  workspaceExists(workspaceId: string): Promise<boolean>;
  listConnections(workspaceId: string): Promise<ConnectionView[]>;
  /** Highest storeSequence of the workspace, or 0 when it has no events. */
  headSequence(workspaceId: string): Promise<bigint>;
}

export function createQueryStore(db: DatabaseClient): QueryStore {
  return {
    async workspaceExists(workspaceId) {
      return (await db.workspace.count({ where: { id: workspaceId } })) > 0;
    },
    async listConnections(workspaceId) {
      const rows = await db.connection.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          adapterId: true,
          runtime: true,
          displayName: true,
          status: true,
          lastHeartbeatAt: true,
          tokenExpiresAt: true,
          revokedAt: true,
          createdAt: true,
        },
      });
      // Safe: status is only ever written from ConnectionStatus values (HQ-103).
      return rows.map((row) => ({ ...row, status: row.status as ConnectionStatus }));
    },
    async headSequence(workspaceId) {
      const head = await db.event.aggregate({
        where: { workspaceId },
        _max: { storeSequence: true },
      });
      return head._max.storeSequence ?? 0n;
    },
  };
}
