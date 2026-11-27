import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  createConnectionStore,
  createDatabaseClient,
  createEventStore,
  type ConnectionStore,
  type EventStore,
} from '@agent-hq/database';
import { DEFAULT_HEARTBEAT_THRESHOLDS, type HeartbeatThresholds } from '@agent-hq/domain';
import { applyConnectionStatus } from '../connections/apply-status.js';
import { replayProjections } from '../projection/projection.service.js';
import { generateSecret, hashSecret, REGISTRATION_CODE_PREFIX } from '../connections/secrets.js';

/** Phase 1 runs a single local workspace (security §5). */
export const LOCAL_WORKSPACE = { id: 'local', name: 'Local workspace' } as const;
export const REGISTRATION_CODE_TTL_MS = 10 * 60_000;

const USAGE = `Usage: agent-hq-admin <command>
  registration-code     Create a one-time code (valid 10 minutes) to register a connection
  revoke <connectionId> Revoke a connection's token
  replay [workspaceId]  Rebuild read models from the event log (default: local).
                        Run it offline: it holds the workspace lock, and fails with
                        "Workspace busy" if another writer keeps the lock for 5 s.
                        Offline operation: appends to the workspace wait (and may time out) while it runs`;

export interface AdminIo {
  store: ConnectionStore;
  events: EventStore;
  thresholds: HeartbeatThresholds;
  stdout: (text: string) => void;
  now: () => Date;
}

/** Local administration commands. They run on the user's machine with direct DB access. */
export async function runAdmin(argv: string[], io: AdminIo): Promise<void> {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true });
  const [command, ...rest] = positionals;

  if (command === 'registration-code') {
    const now = io.now();
    const code = generateSecret(REGISTRATION_CODE_PREFIX);
    const expiresAt = new Date(now.getTime() + REGISTRATION_CODE_TTL_MS);
    await io.store.ensureWorkspace(LOCAL_WORKSPACE.id, LOCAL_WORKSPACE.name);
    await io.store.createRegistrationCode({
      id: randomUUID(),
      workspaceId: LOCAL_WORKSPACE.id,
      codeHash: hashSecret(code),
      expiresAt,
    });
    // The code is printed once and stored only as a hash.
    io.stdout(`${code}\nexpires at ${expiresAt.toISOString()} (single use)\n`);
    return;
  }

  const target = rest[0];
  if (command === 'revoke' && rest.length === 1 && target !== undefined) {
    const now = io.now();
    if (!(await io.store.revoke(target, now))) {
      io.stdout(`no active connection ${target}\n`);
      return;
    }
    // Reflect the revocation in status and the event log right away. The revocation itself
    // has already taken effect; if recording the status fails, the health job reconciles it.
    try {
      const record = await io.store.findById(target);
      if (record !== null) {
        await applyConnectionStatus(record, now, {
          events: io.events,
          thresholds: io.thresholds,
          newId: randomUUID,
        });
      }
    } catch (error) {
      io.stdout(
        `revoked ${target} (status update deferred to the health job: ${error instanceof Error ? error.message : String(error)})\n`,
      );
      return;
    }
    io.stdout(`revoked ${target}\n`);
    return;
  }

  if (command === 'replay' && rest.length <= 1) {
    const workspaceId = rest[0] ?? LOCAL_WORKSPACE.id;
    const applied = await replayProjections(io.events, workspaceId);
    io.stdout(`replayed ${applied} events into read models of ${workspaceId}\n`);
    return;
  }

  throw new Error(USAGE);
}

/** Entry point: `pnpm --filter @agent-hq/api admin <command>`. */
export async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') {
    process.stderr.write('DATABASE_URL is not set (see .env.example)\n');
    process.exitCode = 1;
    return;
  }
  const db = createDatabaseClient(url);
  try {
    await runAdmin(process.argv.slice(2), {
      store: createConnectionStore(db),
      events: createEventStore(db),
      // Only revocation is evaluated here, and it always maps to `disconnected`.
      thresholds: DEFAULT_HEARTBEAT_THRESHOLDS,
      stdout: (text) => process.stdout.write(text),
      now: () => new Date(),
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
