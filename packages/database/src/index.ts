import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export type DatabaseClient = PrismaClient;

export interface DatabaseOptions {
  /** Fail a connection attempt instead of hanging (pg default is no limit). */
  connectionTimeoutMs?: number;
}

/** One client per process: each instance owns a connection pool. */
export function createDatabaseClient(
  connectionString: string,
  options: DatabaseOptions = {},
): DatabaseClient {
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 2000,
  });
  return new PrismaClient({ adapter });
}

/** Returns true when the database answers a trivial query within the timeout. */
export async function pingDatabase(
  client: Pick<DatabaseClient, '$queryRaw'>,
  timeoutMs = 2000,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    const query = client.$queryRaw`SELECT 1`.then(() => true as const);
    return await Promise.race([query, timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export {
  busyReason,
  createEventStore,
  MAX_READ_LIMIT,
  WorkspaceBusyError,
  WorkspaceMismatchError,
} from './event-store.js';
export type {
  AppendOutcome,
  EventStore,
  EventStoreTransaction,
  ExpectedConnectionState,
  ExternalRef,
  StoredEvent,
  TransactionOptions,
} from './event-store.js';
export { readProjections } from './projection-store.js';
export type {
  AgentStateRow,
  OrderKey,
  ProjectionTransaction,
  TaskStateRow,
} from './projection-store.js';

export { createConnectionStore } from './connection-store.js';
export type { ConnectionRecord, ConnectionStore, NewConnection } from './connection-store.js';

export { createOutboxStore } from './outbox-store.js';
export type { OutboxEntry, OutboxStore } from './outbox-store.js';
export { createQueryStore } from './query-store.js';
export type { ConnectionView, QueryStore } from './query-store.js';
export { createGapStore } from './gap-store.js';
export type { GapStore, SequenceGap } from './gap-store.js';
