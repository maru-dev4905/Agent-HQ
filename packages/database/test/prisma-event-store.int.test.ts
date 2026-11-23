import { afterAll } from 'vitest';
import { createDatabaseClient, createEventStore } from '../src/index.js';
import { eventStoreContract } from './event-store.contract.js';

const url = process.env['TEST_DATABASE_URL'];
if (url === undefined) throw new Error('TEST_DATABASE_URL is set by test/integration-setup.ts');

const db = createDatabaseClient(url);
afterAll(() => db.$disconnect());

eventStoreContract('PostgreSQL (Prisma)', {
  store: () => createEventStore(db),
  outboxCount: () => db.eventOutbox.count(),
  rawUpdateFirstEvent: async () => {
    await db.$executeRawUnsafe("UPDATE events SET correlation_id = 'tampered'");
  },
  reset: async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE event_outbox, events, agent_instances, tasks, connections, registration_codes, workspaces RESTART IDENTITY CASCADE',
    );
    await db.workspace.createMany({
      data: [
        { id: 'ws_a', name: 'A' },
        { id: 'ws_b', name: 'B' },
      ],
    });
    const expires = new Date('2099-01-01T00:00:00.000Z');
    const connection = { adapterId: 'simulator', runtime: 'simulator', tokenExpiresAt: expires };
    await db.connection.createMany({
      data: [
        { id: 'conn_1', workspaceId: 'ws_a', tokenHash: 'h1', ...connection },
        { id: 'conn_2', workspaceId: 'ws_a', tokenHash: 'h2', ...connection },
        { id: 'ws_b_conn_1', workspaceId: 'ws_b', tokenHash: 'h3', ...connection },
      ],
    });
  },
});
