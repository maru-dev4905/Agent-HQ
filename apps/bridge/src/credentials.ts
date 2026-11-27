import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { InsecurePathError, type BridgePaths } from './home.js';

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
  let fd: number;
  try {
    // O_NOFOLLOW: a symlink in place of the file is refused rather than followed.
    fd = openSync(paths.credentials, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    if (code === 'ELOOP') throw new InsecurePathError(paths.credentials, 'is a symlink');
    throw error;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new InsecurePathError(paths.credentials, 'is not a regular file');
    if (stat.uid !== euid)
      throw new InsecurePathError(paths.credentials, 'is owned by another user');
    if ((stat.mode & 0o077) !== 0) {
      throw new InsecurePathError(
        paths.credentials,
        'is accessible by group or others (expected 0600)',
      );
    }
    return parse(readFileSync(fd, 'utf8'));
  } finally {
    closeSync(fd);
  }
}

const TMP_PATTERN = /^credentials\.json\.\d+\.[0-9a-f]+\.tmp$/;

/** Removes temporary credential files left by an interrupted write (they hold a token). */
export function removeStaleCredentialTmp(paths: BridgePaths): void {
  for (const name of readdirSync(paths.home)) {
    if (TMP_PATTERN.test(name)) rmSync(join(paths.home, name), { force: true });
  }
}

/** Writes atomically: a new 0600 file (never an existing one), then rename over the old. */
export function writeCredentials(paths: BridgePaths, credentials: Credentials): void {
  const tmp = join(
    paths.home,
    `credentials.json.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    try {
      writeSync(fd, `${JSON.stringify(credentials)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, paths.credentials);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}
