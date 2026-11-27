import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { runCli } from './cli.js';

/**
 * Reads one line: Enter ends the input (no EOF needed). The prompt goes to stderr so stdout
 * stays clean for scripts.
 */
function readLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) process.stderr.write(prompt);
    const lines = createInterface({ input: process.stdin, terminal: false });
    let done = false;
    const finish = (value: string) => {
      if (done) return;
      done = true;
      lines.close();
      resolve(value);
    };
    lines.once('line', finish);
    lines.once('close', () => finish(''));
  });
}

/** Entry point: `agent-hq-bridge <command>`. Errors print one line, never a token. */
export async function main(): Promise<void> {
  const euid = process.geteuid?.();
  if (euid === undefined) {
    process.stderr.write('agent-hq-bridge needs a POSIX system (macOS or Linux)\n');
    process.exitCode = 1;
    return;
  }
  const argv = process.argv.slice(2);
  const stop = new AbortController();
  // Only `run` stops gracefully; elsewhere Ctrl-C keeps its default (exit at once).
  if (argv[0] === 'run') {
    process.once('SIGINT', () => stop.abort());
    process.once('SIGTERM', () => stop.abort());
  }
  try {
    await runCli(argv, {
      env: process.env,
      userHome: homedir(),
      euid,
      stdout: (line) => process.stdout.write(line),
      readStdin: () => readLine('Registration code: '),
      fetch,
      now: () => new Date(),
      stopSignal: stop.signal,
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
