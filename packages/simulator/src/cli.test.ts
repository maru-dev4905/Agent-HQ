import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from './cli.js';

function io(env: NodeJS.ProcessEnv = {}) {
  const out: string[] = [];
  const files: Record<string, string> = {};
  const value: CliIo = {
    env,
    stdout: (text) => out.push(text),
    writeFile: (path, text) => {
      files[path] = text;
    },
    fetch: () => Promise.resolve(new Response(null, { status: 202 })),
  };
  return { value, out, files };
}

describe('runCli', () => {
  it('writes JSON lines to stdout by default', async () => {
    const { value, out } = io();
    await runCli(['--scenario', 'single-agent', '--seed', '3'], value);
    const lines = out.join('').trim().split('\n');
    expect(lines.length).toBeGreaterThan(5);
    expect((JSON.parse(lines[0]!) as { type: string }).type).toBe('agent.connected');
  });

  it('writes to a file with --out, relative to where the user ran the command', async () => {
    const { value, files } = io({ INIT_CWD: '/work/dir', npm_lifecycle_event: 'simulate' });
    await runCli(['--scenario', 'delegation', '--out', 'events.jsonl'], value);
    expect(files['/work/dir/events.jsonl']).toContain('agent.started');
  });

  it('ignores an inherited INIT_CWD when not run through `pnpm simulate`', async () => {
    const { value, files } = io({ INIT_CWD: '/somewhere/else' });
    await runCli(['--scenario', 'delegation', '--out', 'events.jsonl'], value);
    expect(Object.keys(files)).toEqual([`${process.cwd()}/events.jsonl`]);
  });

  it('supports disconnect mode with --cut-after', async () => {
    const { value, out } = io();
    await runCli(['--scenario', 'failure-gap', '--cut-after', '4'], value);
    expect(out.join('').trim().split('\n')).toHaveLength(4);
  });

  it('reads the token from AGENT_HQ_TOKEN, never from arguments', async () => {
    await expect(
      runCli(['--scenario', 'delegation', '--url', 'http://x'], io().value),
    ).rejects.toThrow(/AGENT_HQ_TOKEN/);
    await expect(
      runCli(
        ['--scenario', 'delegation', '--url', 'http://x', '--token', 'leak'],
        io({ AGENT_HQ_TOKEN: 't' }).value,
      ),
    ).rejects.toThrow(/Unknown option '--token'/);
    const ok = io({ AGENT_HQ_TOKEN: 't' });
    await runCli(['--scenario', 'delegation', '--url', 'http://x'], ok.value);
    expect(ok.out.join('')).toMatch(/^sent \d+ events/);
  });

  it('rejects URLs with embedded credentials without echoing them', async () => {
    const error = await runCli(
      ['--scenario', 'delegation', '--url', 'http://user:secret@127.0.0.1/x'],
      io({ AGENT_HQ_TOKEN: 't' }).value,
    ).then(
      () => {
        throw new Error('expected a rejection');
      },
      (e: unknown) => e as Error,
    );
    expect(error.message).toMatch(/must not contain credentials/);
    expect(error.message).not.toContain('secret');
  });

  it('rejects malformed numbers that Number() would accept', async () => {
    for (const bad of ['', '0x10', '1e3', ' 5', '-1']) {
      await expect(
        runCli(['--scenario', 'delegation', `--seed=${bad}`], io().value),
      ).rejects.toThrow(/--seed must be/);
    }
  });

  it('rejects unknown scenarios and conflicting outputs', async () => {
    await expect(runCli(['--scenario', 'nope'], io().value)).rejects.toThrow(/--scenario/);
    await expect(
      runCli(['--scenario', 'delegation', '--out', 'a', '--url', 'http://x'], io().value),
    ).rejects.toThrow(/either/);
  });
});
