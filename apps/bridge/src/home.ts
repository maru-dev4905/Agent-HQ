import { chmodSync, lstatSync, mkdirSync, realpathSync, type Stats } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';

/**
 * Bridge home and its security checks (ADR-0007 §2). Everything the Bridge keeps lives
 * under one directory that only the current OS user can enter. Another OS user must not be
 * able to read the token, write spool entries, or plant a symlink on the way there.
 */

export interface BridgePaths {
  /** Directories the Bridge owns, outermost first (checked strictly). */
  owned: string[];
  home: string;
  spool: string;
  spoolTmp: string;
  outbox: string;
  credentials: string;
  droppedLog: string;
}

export class InsecurePathError extends Error {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`${path}: ${reason}`);
    this.name = 'InsecurePathError';
  }
}

const OWNER_ONLY = 0o077;
const GROUP_OTHER_WRITE = 0o022;
const STICKY = 0o1000;

/** `AGENT_HQ_BRIDGE_HOME` (absolute) or `~/.agent-hq/bridge`. */
export function bridgePaths(env: NodeJS.ProcessEnv, userHome: string): BridgePaths {
  const custom = env['AGENT_HQ_BRIDGE_HOME']?.trim();
  if (custom !== undefined && custom !== '' && !isAbsolute(custom)) {
    throw new Error('AGENT_HQ_BRIDGE_HOME must be an absolute path');
  }
  const base = join(userHome, '.agent-hq');
  const home = custom !== undefined && custom !== '' ? custom : join(base, 'bridge');
  const spool = join(home, 'spool');
  const outbox = join(home, 'outbox');
  const top = home === join(base, 'bridge') ? [base] : [];
  return {
    owned: [...top, home, spool, join(spool, 'tmp'), outbox],
    home,
    spool,
    spoolTmp: join(spool, 'tmp'),
    outbox,
    credentials: join(home, 'credentials.json'),
    droppedLog: join(home, 'dropped.log'),
  };
}

function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** A directory the Bridge owns: not a symlink, owned by `euid`, no group/other access. */
export function checkOwnedDir(path: string, euid: number): void {
  const stat = lstatOrNull(path);
  if (stat === null) throw new InsecurePathError(path, 'does not exist');
  if (stat.isSymbolicLink()) throw new InsecurePathError(path, 'is a symlink');
  if (!stat.isDirectory()) throw new InsecurePathError(path, 'is not a directory');
  if (stat.uid !== euid) throw new InsecurePathError(path, 'is owned by another user');
  if ((stat.mode & OWNER_ONLY) !== 0) {
    throw new InsecurePathError(path, 'is accessible by group or others (expected 0700)');
  }
}

/** A file the Bridge owns: a regular file owned by `euid`, mode 0600 or stricter. */
export function checkOwnedFile(path: string, euid: number): void {
  const stat = lstatOrNull(path);
  if (stat === null) throw new InsecurePathError(path, 'does not exist');
  if (stat.isSymbolicLink()) throw new InsecurePathError(path, 'is a symlink');
  if (!stat.isFile()) throw new InsecurePathError(path, 'is not a regular file');
  if (stat.uid !== euid) throw new InsecurePathError(path, 'is owned by another user');
  if ((stat.mode & OWNER_ONLY) !== 0) {
    throw new InsecurePathError(path, 'is accessible by group or others (expected 0600)');
  }
}

/**
 * Directories above the Bridge's own, resolved to their real path, up to `/`. Each must be
 * owned by `euid` or root and not writable by group or others — except a sticky directory
 * (such as `/tmp`), whose entry on our path must then be owned by `euid`. Otherwise another
 * user could swap a directory on the way.
 */
export function checkAncestors(firstOwned: string, euid: number, allowMissing = false): void {
  // `/tmp` is a symlink on macOS: check the real directories, not the link. Callers pass
  // paths from `resolvePaths`, so this is already the real location.
  let dir = realpathSync(dirname(firstOwned));
  let child = join(dir, basename(firstOwned));
  for (;;) {
    const stat = lstatSync(dir);
    if (stat.uid !== euid && stat.uid !== 0) {
      throw new InsecurePathError(dir, 'is owned by another user');
    }
    if ((stat.mode & GROUP_OTHER_WRITE) !== 0) {
      const childStat = lstatOrNull(child);
      const sticky = (stat.mode & STICKY) !== 0;
      // Before creation the entry may be missing; it is checked again once created.
      const ours = childStat === null ? allowMissing : childStat.uid === euid;
      if (!sticky || !ours) {
        throw new InsecurePathError(dir, 'is writable by group or others');
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    child = dir;
    dir = parent;
  }
}

/**
 * Rebuilds the paths on the real location of the Bridge's parent directory. Every later
 * operation uses these, so a symlink on the way (for example under `/tmp`) that someone
 * swaps after the checks no longer redirects where the token and spool go.
 */
export function resolvePaths(paths: BridgePaths): BridgePaths {
  const [first] = paths.owned;
  if (first === undefined) throw new Error('no Bridge directories');
  const parent = dirname(first);
  let real: string;
  try {
    real = realpathSync(parent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new InsecurePathError(parent, 'does not exist (create it first)');
    }
    throw error;
  }
  if (real === parent) return paths;
  const move = (path: string) => join(real, relative(parent, path));
  return {
    owned: paths.owned.map(move),
    home: move(paths.home),
    spool: move(paths.spool),
    spoolTmp: move(paths.spoolTmp),
    outbox: move(paths.outbox),
    credentials: move(paths.credentials),
    droppedLog: move(paths.droppedLog),
  };
}

/** Every check without creating anything (hook command, `status`). Returns the real paths. */
export function checkHome(input: BridgePaths, euid: number): BridgePaths {
  const paths = resolvePaths(input);
  const [first] = paths.owned;
  if (first === undefined) throw new Error('no Bridge directories');
  checkAncestors(first, euid);
  for (const dir of paths.owned) checkOwnedDir(dir, euid);
  return paths;
}

/**
 * Creates missing directories as 0700 (regardless of umask), then checks everything.
 * Returns the real paths, which callers must use from then on.
 */
export function ensureHome(input: BridgePaths, euid: number): BridgePaths {
  const paths = resolvePaths(input);
  const [first] = paths.owned;
  if (first === undefined) throw new Error('no Bridge directories');
  // Check the way there before creating anything under it, and again after: a directory
  // someone else created in a shared sticky parent meanwhile is then refused.
  checkAncestors(first, euid, true);
  for (const dir of paths.owned) {
    const stat = lstatOrNull(dir);
    if (stat === null) {
      mkdirSync(dir, { mode: 0o700 });
      chmodSync(dir, 0o700);
    }
    checkOwnedDir(dir, euid);
  }
  checkAncestors(first, euid);
  return paths;
}
