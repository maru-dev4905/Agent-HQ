import { randomBytes } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { checkOwnedFile, type BridgePaths } from './home.js';

/**
 * The connection token, stored only in `<BRIDGE_HOME>/credentials.json` (0600, ADR-0007 §5).
 * The token never appears in logs, errors or command output; only the connection ID does.
 */
export interface Credentials {
  apiUrl: string;
  connectionId: string;
  workspaceId: string;
  token: string;
  tokenExpiresAt: string;
}

const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';

function parse(text: string): Credentials {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('credentials.json is not valid JSON; pair again');
  }
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const { apiUrl, connectionId, workspaceId, token, tokenExpiresAt } = record;
  if (
    !isString(apiUrl) ||
    !isString(connectionId) ||
    !isString(workspaceId) ||
    !isString(token) ||
    !isString(tokenExpiresAt)
  ) {
    throw new Error('credentials.json is incomplete; pair again');
  }
  return { apiUrl, connectionId, workspaceId, token, tokenExpiresAt };
}

/** Returns null when the Bridge is not paired yet. Refuses a file others could read. */
export function readCredentials(paths: BridgePaths, euid: number): Credentials | null {
  let text: string;
  try {
    checkOwnedFile(paths.credentials, euid);
    text = readFileSync(paths.credentials, 'utf8');
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('does not exist')) return null;
    throw error;
  }
  return parse(text);
}

/** Writes atomically: a new 0600 file (never an existing one), then rename over the old. */
export function writeCredentials(paths: BridgePaths, credentials: Credentials): void {
  const tmp = `${paths.credentials}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    writeSync(fd, `${JSON.stringify(credentials)}\n`);
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    unlinkSync(tmp);
    throw error;
  }
  closeSync(fd);
  renameSync(tmp, paths.credentials);
}
