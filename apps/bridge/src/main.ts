import { homedir } from 'node:os';
import { text } from 'node:stream/consumers';
import { runCli } from './cli.js';

/** Entry point: `agent-hq-bridge <command>`. Errors print one line, never a token. */
export async function main(): Promise<void> {
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort());
  process.once('SIGTERM', () => stop.abort());
  const euid = process.geteuid?.();
  if (euid === undefined) {
    process.stderr.write('agent-hq-bridge needs a POSIX system (macOS or Linux)\n');
    process.exitCode = 1;
    return;
  }
  try {
    await runCli(process.argv.slice(2), {
      env: process.env,
      userHome: homedir(),
      euid,
      stdout: (line) => process.stdout.write(line),
      readStdin: () => text(process.stdin),
      fetch,
      now: () => new Date(),
      stopSignal: stop.signal,
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
