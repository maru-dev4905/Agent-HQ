import { parseArgs } from 'node:util';
import { heartbeat, parseApiUrl, register } from './api.js';
import { readCredentials, writeCredentials } from './credentials.js';
import { DEFAULT_HEARTBEAT, HeartbeatLoop, type HeartbeatState } from './heartbeat.js';
import { bridgePaths, checkHome, ensureHome, InsecurePathError } from './home.js';

export const DEFAULT_API_URL = 'http://127.0.0.1:4000';

const USAGE = `Usage: agent-hq-bridge <command>
  pair [--api <url>] [--replace]  Register with HQ. Reads the registration code from stdin
                                  (never from the command line, where other users can see it).
  run                             Keep the connection alive (heartbeat) until stopped.
  status                          Show the pairing and check the Bridge directory.
The Bridge keeps its files in AGENT_HQ_BRIDGE_HOME (absolute) or ~/.agent-hq/bridge.`;

export interface CliIo {
  env: NodeJS.ProcessEnv;
  userHome: string;
  euid: number;
  stdout: (text: string) => void;
  readStdin: () => Promise<string>;
  fetch: typeof fetch;
  now: () => Date;
  /** `run` resolves when this signal fires (SIGINT/SIGTERM in the binary). */
  stopSignal: AbortSignal;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  random?: () => number;
  heartbeatIntervalMs?: number;
}

/** Human-readable heartbeat state. Never includes the token. */
export function describe(state: HeartbeatState): string {
  switch (state.kind) {
    case 'connected':
      return `connected (heartbeat ${state.at})`;
    case 'retrying':
      return `HQ not reachable (${state.reason}); retrying in ${Math.round(state.nextInMs / 1000)} s`;
    case 'config_error':
      return 'HQ refused the request (Host/Origin not allowed): check the --api address used for pair; retrying slowly';
    case 'unauthorized':
      return 'the connection token was revoked or has expired: run `agent-hq-bridge pair --replace` with a new registration code';
    case 'stopped':
      return 'stopped';
  }
}

async function pair(argv: string[], io: CliIo): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { api: { type: 'string' }, replace: { type: 'boolean' } },
    strict: true,
  });
  const apiUrl = parseApiUrl(values.api ?? DEFAULT_API_URL);
  const paths = bridgePaths(io.env, io.userHome);
  ensureHome(paths, io.euid);
  const existing = readCredentials(paths, io.euid);
  if (existing !== null && values.replace !== true) {
    throw new Error(
      `already paired as connection ${existing.connectionId}; use --replace to register again (a new connection)`,
    );
  }
  const code = (await io.readStdin()).split('\n')[0]?.trim() ?? '';
  if (code === '') throw new Error('no registration code on stdin');

  const result = await register(io.fetch, apiUrl, code);
  switch (result.kind) {
    case 'ok':
      writeCredentials(paths, {
        apiUrl,
        connectionId: result.value.connectionId,
        workspaceId: result.value.workspaceId,
        token: result.value.token,
        tokenExpiresAt: result.value.tokenExpiresAt,
      });
      io.stdout(
        `paired as connection ${result.value.connectionId} (token expires ${result.value.tokenExpiresAt})\n`,
      );
      return;
    case 'unauthorized':
      throw new Error('the registration code is invalid, already used or expired');
    case 'config':
      throw new Error('HQ refused the request (Host/Origin not allowed): check --api');
    case 'retry':
      throw new Error(`HQ is not reachable at ${apiUrl} (${result.reason})`);
    case 'rejected':
      throw new Error(`HQ rejected the registration (HTTP ${result.status})`);
  }
}

async function run(io: CliIo): Promise<void> {
  const paths = bridgePaths(io.env, io.userHome);
  checkHome(paths, io.euid);
  const credentials = readCredentials(paths, io.euid);
  if (credentials === null) throw new Error('not paired: run `agent-hq-bridge pair` first');
  io.stdout(`connection ${credentials.connectionId} → ${credentials.apiUrl}\n`);

  let last = '';
  let unauthorized = false;
  const done = new Promise<void>((resolve) => {
    const loop = new HeartbeatLoop({
      send: async () => {
        const result = await heartbeat(io.fetch, credentials);
        // The connection no longer exists: same remedy as a revoked token.
        return result.kind === 'rejected' && result.status === 404
          ? { kind: 'unauthorized' }
          : result;
      },
      onState: (state) => {
        const line = describe(state);
        // Repeated identical states are not printed again.
        if (line !== last || state.kind === 'unauthorized') io.stdout(`${line}\n`);
        last = line;
        if (state.kind === 'unauthorized') {
          unauthorized = true;
          resolve();
        }
      },
      intervalMs: io.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT.intervalMs,
      maxBackoffMs: DEFAULT_HEARTBEAT.maxBackoffMs,
      now: io.now,
      random: io.random ?? Math.random,
      setTimer: io.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: io.clearTimer ?? ((t) => clearTimeout(t as NodeJS.Timeout)),
    });
    io.stopSignal.addEventListener(
      'abort',
      () => {
        loop.stop();
        resolve();
      },
      { once: true },
    );
    if (io.stopSignal.aborted) resolve();
    else loop.start();
  });
  await done;
  if (unauthorized) throw new Error('stopped: pair again to continue');
}

function status(io: CliIo): void {
  const paths = bridgePaths(io.env, io.userHome);
  io.stdout(`home: ${paths.home}\n`);
  try {
    checkHome(paths, io.euid);
    io.stdout('directory: ok\n');
  } catch (error) {
    io.stdout(`directory: ${error instanceof Error ? error.message : String(error)}\n`);
    return;
  }
  const credentials = readCredentials(paths, io.euid);
  io.stdout(
    credentials === null
      ? 'pairing: not paired\n'
      : `pairing: connection ${credentials.connectionId} → ${credentials.apiUrl} (token expires ${credentials.tokenExpiresAt})\n`,
  );
}

export async function runCli(argv: string[], io: CliIo): Promise<void> {
  const [command, ...rest] = argv;
  if (command === 'pair') return pair(rest, io);
  if (command === 'run' && rest.length === 0) return run(io);
  if (command === 'status' && rest.length === 0) return status(io);
  throw new Error(USAGE);
}

export { InsecurePathError };
