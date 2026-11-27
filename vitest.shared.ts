import { fileURLToPath } from 'node:url';

const workspacePackages = [
  'domain',
  'events',
  'contracts',
  'database',
  'simulator',
  'adapter-claude-code',
];

/**
 * Resolve workspace packages from source so tests never run against a stale dist build.
 * Scoped to @agent-hq/* only; third-party resolution is untouched.
 */
export const workspaceAliases = workspacePackages.map((name) => ({
  find: `@agent-hq/${name}`,
  replacement: fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
}));
