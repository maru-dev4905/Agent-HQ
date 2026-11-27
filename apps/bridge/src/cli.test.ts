import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseApiUrl } from './api.js';
import { runCli, type CliIo } from './cli.js';
import { readCredentials } from './credentials.js';
import { backoffMs, HeartbeatLoop, type HeartbeatDeps, type HeartbeatState } from './heartbeat.js';
import { bridgePaths } from './home.js';

const euid = process.geteuid?.() ?? -1;
const TOKEN = 'hqc_secret_token_value_0001';
let root: string;
let out: string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hq-bridge-cli-'));
  chmodSync(root, 0o700);
  out = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

type Handler = (url: string, init: RequestInit) => Response;

function io(handler: Handler, extra: Partial<CliIo> = {}): CliIo {
  return {
    env: { AGENT_HQ_BRIDGE_HOME: join(root, 'home') },
    userHome: root,
    euid,
    stdout: (text) => out.push(text),
    readStdin: () => Promise.resolve('hqr_code_1\n'),
    fetch: ((url: string, init: RequestInit) =>
      Promise.resolve(handler(url, init))) as typeof fetch,
    now: () => new Date('2026-11-27T12:00:00.000Z'),
    stopSignal: new AbortController().signal,
    ...extra,
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const registered = () =>
  json(201, {
    connectionId: 'conn-1',
    workspaceId: 'local',
    token: TOKEN,
    tokenExpiresAt: '2026-12-27T12:00:00.000Z',
  });

describe('pair', () => {
  it('registers with the code from stdin and stores the token only in a 0600 file', async () => {
    const seen: { url: string; body: unknown }[] = [];
    await runCli(
      ['pair', '--api', 'http://127.0.0.1:4100/'],
      io((url, init) => {
        seen.push({ url, body: JSON.parse(init.body as string) });
        return registered();
      }),
    );
    expect(seen).toEqual([
      {
        url: 'http://127.0.0.1:4100/connections',
        body: { registrationCode: 'hqr_code_1', adapterId: 'claude-code', runtime: 'claude-code' },
      },
    ]);
    const paths = bridgePaths({ AGENT_HQ_BRIDGE_HOME: join(root, 'home') }, root);
    expect(statSync(paths.credentials).mode & 0o777).toBe(0o600);
    expect(readCredentials(paths, euid)).toMatchObject({ connectionId: 'conn-1', token: TOKEN });
    expect(out.join('')).toContain('conn-1');
    expect(out.join('')).not.toContain(TOKEN);
  });

  it('reports an invalid, used or expired code and writes nothing', async () => {
    await expect(
      runCli(
        ['pair'],
        io(() => json(401, { error: {} })),
      ),
    ).rejects.toThrow(/invalid, already used or expired/);
    const paths = bridgePaths({ AGENT_HQ_BRIDGE_HOME: join(root, 'home') }, root);
    expect(readCredentials(paths, euid)).toBeNull();
  });

  it('refuses to replace an existing pairing without --replace', async () => {
    await runCli(['pair'], io(registered));
    await expect(runCli(['pair'], io(registered))).rejects.toThrow(
      /already paired as connection conn-1/,
    );
    await runCli(['pair', '--replace'], io(registered));
  });

  it('does not take the code from the command line', async () => {
    await expect(runCli(['pair', 'hqr_code_1'], io(registered))).rejects.toThrow();
    await expect(
      runCli(['pair'], io(registered, { readStdin: () => Promise.resolve('\n') })),
    ).rejects.toThrow(/no registration code/);
  });

  it('never puts the token into an error', async () => {
    await runCli(['pair'], io(registered));
    const failures = [() => json(500, { leaked: TOKEN }), () => json(403, { leaked: TOKEN })];
    for (const failure of failures) {
      const error = await runCli(['pair', '--replace'], io(failure)).catch((e: unknown) => e);
      expect(String(error)).not.toContain(TOKEN);
    }
  });
});

describe('parseApiUrl', () => {
  it('accepts http(s) and refuses credentials, other schemes and queries', () => {
    expect(parseApiUrl('http://127.0.0.1:4000/')).toBe('http://127.0.0.1:4000');
    expect(() => parseApiUrl('http://u:p@127.0.0.1:4000')).toThrow(/credentials/);
    expect(() => parseApiUrl('file:///etc/passwd')).toThrow(/http/);
    expect(() => parseApiUrl('http://127.0.0.1:4000/?x=1')).toThrow(/query/);
    // The token must not travel in clear text beyond this machine.
    expect(() => parseApiUrl('http://hq.example.com')).toThrow(/loopback/);
    expect(parseApiUrl('https://hq.example.com')).toBe('https://hq.example.com');
    expect(parseApiUrl('http://localhost:4000')).toBe('http://localhost:4000');
    expect(parseApiUrl('http://[::1]:4000')).toBe('http://[::1]:4000');
  });
});

/** A manual scheduler: timers run only when the test says so. */
function scheduler() {
  const queue: { fn: () => void; ms: number }[] = [];
  return {
    queue,
    setTimer: (fn: () => void, ms: number) => {
      const entry = { fn, ms };
      queue.push(entry);
      return entry;
    },
    clearTimer: (timer: unknown) => {
      const i = queue.indexOf(timer as (typeof queue)[number]);
      if (i >= 0) queue.splice(i, 1);
    },
    async next() {
      const entry = queue.shift();
      entry?.fn();
      // Let the async beat settle.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return entry?.ms;
    },
  };
}

describe('HeartbeatLoop (ADR-0007 §6)', () => {
  it('beats on the interval, backs off with jitter, honours Retry-After, stops on 401', async () => {
    const replies = [
      { kind: 'ok' as const, value: {} },
      { kind: 'retry' as const, reason: 'unreachable' },
      { kind: 'retry' as const, reason: 'HTTP 503', retryAfterMs: 2000 },
      { kind: 'ok' as const, value: {} },
      { kind: 'unauthorized' as const },
    ];
    const states: HeartbeatState[] = [];
    const s = scheduler();
    const loop = new HeartbeatLoop({
      send: () => Promise.resolve(replies.shift() ?? { kind: 'ok', value: {} }),
      onState: (state) => states.push(state),
      intervalMs: 15_000,
      maxBackoffMs: 60_000,
      now: () => new Date('2026-11-27T12:00:00.000Z'),
      random: () => 0.5,
      setTimer: s.setTimer,
      clearTimer: s.clearTimer,
    });
    loop.start();
    const delays: (number | undefined)[] = [];
    for (let i = 0; i < 5; i++) delays.push(await s.next());
    expect(delays).toEqual([0, 15_000, 1000, 2000, 15_000]);
    expect(states.map((x) => x.kind)).toEqual([
      'connected',
      'retrying',
      'retrying',
      'connected',
      'unauthorized',
    ]);
    // Nothing is scheduled after a revoked token.
    expect(s.queue).toEqual([]);
  });

  it('keeps retrying slowly on a Host/Origin refusal and can be stopped', async () => {
    const states: HeartbeatState[] = [];
    const s = scheduler();
    const loop = new HeartbeatLoop({
      send: () => Promise.resolve({ kind: 'config', status: 403 }),
      onState: (state) => states.push(state),
      intervalMs: 15_000,
      maxBackoffMs: 60_000,
      now: () => new Date(),
      random: () => 0.5,
      setTimer: s.setTimer,
      clearTimer: s.clearTimer,
    });
    loop.start();
    await s.next();
    expect(s.queue.map((q) => q.ms)).toEqual([60_000]);
    loop.stop();
    expect(s.queue).toEqual([]);
    expect(states.map((x) => x.kind)).toEqual(['config_error', 'stopped']);
  });

  it('backoff grows to the cap and never goes below 1 s', () => {
    expect(backoffMs(0, 60_000, () => 0)).toBe(1000);
    expect(backoffMs(10, 60_000, () => 0.999)).toBe(59_940);
    expect(backoffMs(3, 60_000, () => 0.5)).toBe(4000);
  });
});

describe('HeartbeatLoop robustness (review)', () => {
  const base = (
    s: ReturnType<typeof scheduler>,
    send: () => Promise<never> | Promise<unknown>,
  ) => ({
    send: send as HeartbeatDeps['send'],
    intervalMs: 15_000,
    maxBackoffMs: 60_000,
    now: () => new Date(),
    random: () => 0,
    setTimer: s.setTimer,
    clearTimer: s.clearTimer,
  });

  it('never retries immediately on Retry-After: 0', async () => {
    const s = scheduler();
    const loop = new HeartbeatLoop({
      ...base(s, () => Promise.resolve({ kind: 'retry', reason: 'HTTP 503', retryAfterMs: 0 })),
      onState: () => undefined,
    });
    loop.start();
    await s.next();
    expect(s.queue.map((q) => q.ms)).toEqual([1000]);
    loop.stop();
  });

  it('keeps going when sending throws', async () => {
    const s = scheduler();
    const states: HeartbeatState[] = [];
    const loop = new HeartbeatLoop({
      ...base(s, () => Promise.reject(new Error('boom'))),
      onState: (x) => states.push(x),
    });
    loop.start();
    await s.next();
    expect(states).toEqual([{ kind: 'retrying', reason: 'internal error', nextInMs: 1000 }]);
    expect(s.queue).toHaveLength(1);
    loop.stop();
  });

  it('ignores a beat still in flight from before a stop and restart', async () => {
    const s = scheduler();
    let release: (value: unknown) => void = () => undefined;
    const loop = new HeartbeatLoop({
      ...base(s, () => new Promise((resolve) => (release = resolve))),
      onState: () => undefined,
    });
    loop.start();
    const first = s.queue.shift();
    first?.fn(); // beat in flight
    loop.stop();
    loop.start(); // schedules a new beat at 0
    release({ kind: 'ok', value: {} }); // the old beat answers late
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Only the new loop's beat is pending: the late answer scheduled nothing.
    expect(s.queue.map((q) => q.ms)).toEqual([0]);
    loop.stop();
  });
});

describe('cli details (review)', () => {
  it('--help prints usage and succeeds', async () => {
    await runCli(['--help'], io(registered));
    expect(out.join('')).toContain('Usage: agent-hq-bridge');
  });

  it('does not echo an unexpected argument (it may be a code)', async () => {
    const error = await runCli(['pair', '--code', 'hqr_typed_secret'], io(registered)).catch(
      (e: unknown) => e,
    );
    expect(String(error)).not.toContain('hqr_typed_secret');
  });

  it('removes credential temp files left by an interrupted write', async () => {
    await runCli(['pair'], io(registered));
    const paths = bridgePaths({ AGENT_HQ_BRIDGE_HOME: join(root, 'home') }, root);
    const leftover = join(paths.home, 'credentials.json.123.abcdef.tmp');
    writeFileSync(leftover, TOKEN, { mode: 0o600 });
    await runCli(['pair', '--replace'], io(registered));
    expect(existsSync(leftover)).toBe(false);
  });

  it('refuses credentials.json replaced by a symlink', async () => {
    await runCli(['pair'], io(registered));
    const paths = bridgePaths({ AGENT_HQ_BRIDGE_HOME: join(root, 'home') }, root);
    const elsewhere = join(root, 'elsewhere.json');
    writeFileSync(elsewhere, readFileSync(paths.credentials), { mode: 0o600 });
    rmSync(paths.credentials);
    symlinkSync(elsewhere, paths.credentials);
    expect(() => readCredentials(paths, euid)).toThrow(/symlink/);
  });
});

describe('run', () => {
  it('refuses to start when not paired', async () => {
    await expect(runCli(['run'], io(registered))).rejects.toThrow(/not paired|does not exist/);
  });

  it('reports a revoked token without printing it and exits', async () => {
    await runCli(['pair'], io(registered));
    out = [];
    const error = await runCli(
      ['run'],
      io(() => json(401, {})),
    ).catch((e: unknown) => e);
    expect(String(error)).toMatch(/pair again/);
    expect(out.join('')).toMatch(/revoked or has expired/);
    expect(out.join('')).not.toContain(TOKEN);
    const paths = bridgePaths({ AGENT_HQ_BRIDGE_HOME: join(root, 'home') }, root);
    expect(readFileSync(paths.credentials, 'utf8')).toContain('conn-1');
  });
});
