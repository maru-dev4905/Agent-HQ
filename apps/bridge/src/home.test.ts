import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bridgePaths,
  checkAncestors,
  checkHome,
  checkOwnedFile,
  ensureHome,
  InsecurePathError,
} from './home.js';

const euid = process.geteuid?.() ?? -1;
let root: string;

beforeEach(() => {
  // The OS temp directory for this user is private (0700 on macOS).
  root = mkdtempSync(join(tmpdir(), 'hq-bridge-home-'));
  chmodSync(root, 0o700);
});

afterEach(() => {
  chmodSync(root, 0o700);
  rmSync(root, { recursive: true, force: true });
});

const custom = (dir: string) => bridgePaths({ AGENT_HQ_BRIDGE_HOME: dir }, '/unused');

describe('bridgePaths', () => {
  it('defaults to ~/.agent-hq/bridge and checks ~/.agent-hq too', () => {
    const paths = bridgePaths({}, '/Users/someone');
    expect(paths.home).toBe('/Users/someone/.agent-hq/bridge');
    expect(paths.owned).toEqual([
      '/Users/someone/.agent-hq',
      '/Users/someone/.agent-hq/bridge',
      '/Users/someone/.agent-hq/bridge/spool',
      '/Users/someone/.agent-hq/bridge/spool/tmp',
      '/Users/someone/.agent-hq/bridge/outbox',
    ]);
    expect(paths.credentials).toBe('/Users/someone/.agent-hq/bridge/credentials.json');
  });

  it('rejects a relative AGENT_HQ_BRIDGE_HOME', () => {
    expect(() => bridgePaths({ AGENT_HQ_BRIDGE_HOME: 'bridge' }, '/x')).toThrow(/absolute/);
  });
});

describe('ensureHome and checkHome (ADR-0007 §2)', () => {
  it('creates every directory as 0700 regardless of umask', () => {
    const previous = process.umask(0o000);
    try {
      const paths = custom(join(root, 'home'));
      ensureHome(paths, euid);
      for (const dir of paths.owned) expect(statSync(dir).mode & 0o777).toBe(0o700);
      expect(() => checkHome(paths, euid)).not.toThrow();
    } finally {
      process.umask(previous);
    }
  });

  it('refuses an existing directory that group or others can enter', () => {
    const home = join(root, 'home');
    mkdirSync(home, { mode: 0o755 });
    chmodSync(home, 0o755);
    expect(() => ensureHome(custom(home), euid)).toThrow(InsecurePathError);
  });

  it('refuses a symlink in place of a Bridge directory', () => {
    const real = join(root, 'real');
    mkdirSync(real, { mode: 0o700 });
    const link = join(root, 'home');
    symlinkSync(real, link);
    expect(() => ensureHome(custom(link), euid)).toThrow(/symlink/);
  });

  it('refuses a group- or world-writable parent that is not sticky', () => {
    const shared = join(root, 'shared');
    mkdirSync(shared);
    chmodSync(shared, 0o777);
    expect(() => ensureHome(custom(join(shared, 'home')), euid)).toThrow(
      /writable by group or others/,
    );
  });

  it('accepts a sticky shared parent when our entry in it is ours', () => {
    const shared = join(root, 'sticky');
    mkdirSync(shared);
    chmodSync(shared, 0o1777);
    const paths = custom(join(shared, 'home'));
    ensureHome(paths, euid);
    expect(() => checkAncestors(paths.home, euid)).not.toThrow();
  });

  it('checkHome fails when the directories were never created', () => {
    expect(() => checkHome(custom(join(root, 'missing')), euid)).toThrow(/does not exist/);
  });
});

describe('symlinks on the way (review M1)', () => {
  it('uses the real location, so swapping a link afterwards redirects nothing', () => {
    const real = join(root, 'real');
    mkdirSync(real, { mode: 0o700 });
    const link = join(root, 'link');
    symlinkSync(real, link);
    const paths = ensureHome(custom(join(link, 'home')), euid);
    expect(paths.home).toBe(join(realpathSync(real), 'home'));
    expect(paths.credentials.startsWith(realpathSync(real))).toBe(true);
    // The link now points elsewhere; the resolved paths do not follow it.
    const other = join(root, 'other');
    mkdirSync(other, { mode: 0o700 });
    rmSync(link);
    symlinkSync(other, link);
    expect(checkHome(paths, euid).home).toBe(paths.home);
  });

  it('reports a missing parent of a custom home plainly', () => {
    expect(() => ensureHome(custom(join(root, 'nope', 'home')), euid)).toThrow(/does not exist/);
  });
});

describe('checkOwnedFile', () => {
  it('accepts 0600 and refuses a readable file', () => {
    const file = join(root, 'f');
    writeFileSync(file, 'x', { mode: 0o600 });
    expect(() => checkOwnedFile(file, euid)).not.toThrow();
    chmodSync(file, 0o644);
    expect(() => checkOwnedFile(file, euid)).toThrow(/0600/);
  });
});
