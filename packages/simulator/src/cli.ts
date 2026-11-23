import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generate, toJsonLines } from './generate.js';
import { SCENARIO_NAMES, type ScenarioName } from './scenarios.js';
import { sendEvents } from './send.js';

const USAGE = `Usage: agent-hq-sim --scenario <${SCENARIO_NAMES.join('|')}> [--seed <int>]
       [--shuffle] [--duplicate-rate <0..1>] [--cut-after <n>]
       [--out <file|->] | [--url <ingestion endpoint>] [--batch-size <n>]
The connection token for --url is read from the AGENT_HQ_TOKEN environment variable.`;

export interface CliIo {
  env: NodeJS.ProcessEnv;
  stdout: (text: string) => void;
  writeFile: (path: string, text: string) => void;
  fetch?: typeof fetch;
}

const DECIMAL = /^\d+(\.\d+)?$/;

function isScenario(value: string): value is ScenarioName {
  return (SCENARIO_NAMES as string[]).includes(value);
}

/** Strict: rejects '', hex, exponents and padding, which Number() would silently accept. */
function parseNumber(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  if (!DECIMAL.test(raw)) throw new Error(`--${name} must be a non-negative decimal number`);
  return Number(raw);
}

/** Rejects URLs with embedded credentials so they can never reach error output or logs. */
function parseEndpoint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('--url is not a valid URL');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('--url must not contain credentials; pass the token via AGENT_HQ_TOKEN');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('--url must use http or https');
  }
  return url.toString();
}

export async function runCli(argv: string[], io: CliIo): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      scenario: { type: 'string' },
      seed: { type: 'string' },
      shuffle: { type: 'boolean' },
      'duplicate-rate': { type: 'string' },
      'cut-after': { type: 'string' },
      out: { type: 'string' },
      url: { type: 'string' },
      'batch-size': { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
  });
  if (values.help === true) {
    io.stdout(`${USAGE}\n`);
    return;
  }
  if (values.scenario === undefined || !isScenario(values.scenario)) {
    throw new Error(`--scenario is required.\n${USAGE}`);
  }
  if (values.out !== undefined && values.url !== undefined) {
    throw new Error('Use either --out or --url, not both');
  }

  const cutAfter = values['cut-after'];
  const events = generate({
    scenario: values.scenario,
    seed: parseNumber('seed', values.seed, 1),
    shuffle: values.shuffle === true,
    duplicateRate: parseNumber('duplicate-rate', values['duplicate-rate'], 0),
    ...(cutAfter === undefined ? {} : { cutAfter: parseNumber('cut-after', cutAfter, 0) }),
  });

  if (values.url !== undefined) {
    const url = parseEndpoint(values.url);
    const token = io.env['AGENT_HQ_TOKEN'];
    if (token === undefined || token === '') {
      throw new Error('AGENT_HQ_TOKEN is not set (connection token, see HQ-103)');
    }
    const report = await sendEvents(events, {
      url,
      token,
      batchSize: parseNumber('batch-size', values['batch-size'], 100),
      ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
    });
    io.stdout(`sent ${report.events} events in ${report.batches} batches\n`);
    return;
  }

  const lines = toJsonLines(events);
  if (values.out === undefined || values.out === '-') {
    io.stdout(lines);
  } else {
    // `pnpm simulate` runs in the package directory; only then resolve from where the user
    // ran it. Other callers (e.g. spawned by a test harness) keep their own cwd.
    const base =
      io.env['npm_lifecycle_event'] === 'simulate'
        ? (io.env['INIT_CWD'] ?? process.cwd())
        : process.cwd();
    io.writeFile(resolve(base, values.out), lines);
  }
}

/** Entry point when run as a binary. */
export async function main(): Promise<void> {
  try {
    await runCli(process.argv.slice(2), {
      env: process.env,
      stdout: (text) => process.stdout.write(text),
      writeFile: (path, text) => writeFileSync(path, text),
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
