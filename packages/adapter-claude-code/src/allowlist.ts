/**
 * Allowlist filter for Claude Code hook input (ADR-0007 §3). It has no imports so the hook
 * command can run it without dependencies, before anything is written to disk.
 *
 * Only identifiers, enum-like tokens, numbers and booleans survive. Every free-text field
 * (prompt, tool input/output, assistant messages, error text, notification messages, paths
 * such as `cwd` and `transcript_path`) is dropped because it is not listed. A listed field
 * whose value does not look like a token is dropped too, so unexpected content in a known
 * field can never pass through.
 */

/** Names and enum values: no spaces, no path separators, bounded length. */
const TOKEN = /^[A-Za-z0-9_.:@-]{1,100}$/;
/**
 * Runtime IDs (session, agent, tool call): like a token but without `:`, so idempotency
 * keys built as `<session>:<id>:<phase>` cannot collide across kinds, and short enough that
 * a key stays within the contract's ID length.
 */
const ID = /^[A-Za-z0-9_.@-]{1,100}$/;

type FieldKind = 'id' | 'token' | 'count' | 'flag';

export const isIdToken = (value: unknown): value is string =>
  typeof value === 'string' && ID.test(value);

const COMMON: Readonly<Record<string, FieldKind>> = {
  session_id: 'id',
  hook_event_name: 'token',
  agent_id: 'id',
  agent_type: 'token',
};

/** Fields kept per hook, in addition to `COMMON` (RES-002 §2.3, §4). */
export const HOOK_FIELDS: Readonly<Record<string, Readonly<Record<string, FieldKind>>>> = {
  SessionStart: { source: 'token' },
  SessionEnd: { reason: 'token' },
  UserPromptSubmit: {},
  Stop: {},
  // `error` is the failure kind here (matcher value, e.g. `rate_limit`); `error_details` is dropped.
  StopFailure: { error: 'token' },
  Notification: { notification_type: 'token' },
  PermissionRequest: { tool_name: 'token' },
  PreToolUse: { tool_name: 'token', tool_use_id: 'id' },
  PostToolUse: { tool_name: 'token', tool_use_id: 'id', duration_ms: 'count' },
  PostToolUseFailure: {
    tool_name: 'token',
    tool_use_id: 'id',
    duration_ms: 'count',
    is_interrupt: 'flag',
  },
  PostToolBatch: {},
  SubagentStart: {},
  SubagentStop: {},
};

export type AllowedHookInput = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keep(kind: FieldKind, value: unknown): boolean {
  if (kind === 'id') return isIdToken(value);
  if (kind === 'token') return typeof value === 'string' && TOKEN.test(value);
  if (kind === 'count') return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  return typeof value === 'boolean';
}

function pickFields(
  raw: Record<string, unknown>,
  fields: Readonly<Record<string, FieldKind>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, kind] of Object.entries(fields)) {
    if (keep(kind, raw[name])) out[name] = raw[name];
  }
  return out;
}

/**
 * Returns the allowlisted part of one hook input, or `null` when it has no usable session
 * or event name. Unknown hook names keep only the common fields (the mapper ignores them).
 */
export function pickAllowed(raw: unknown): AllowedHookInput | null {
  if (!isRecord(raw)) return null;
  const out = pickFields(raw, COMMON);
  if (out['session_id'] === undefined || out['hook_event_name'] === undefined) return null;
  const event = out['hook_event_name'] as string;
  const fields = Object.hasOwn(HOOK_FIELDS, event) ? HOOK_FIELDS[event] : undefined;
  if (fields !== undefined) Object.assign(out, pickFields(raw, fields));

  // Nested values are rebuilt from scratch, never copied.
  if (event === 'PreToolUse' && isRecord(raw['mcp_server'])) {
    const server = pickFields(raw['mcp_server'], { name: 'token' });
    if (server['name'] !== undefined) out['mcp_server'] = server;
  }
  if (event === 'PostToolBatch' && Array.isArray(raw['tool_calls'])) {
    out['tool_calls'] = raw['tool_calls']
      .filter(isRecord)
      .map((call) => pickFields(call, { tool_use_id: 'id', tool_name: 'token' }))
      .filter((call) => call['tool_use_id'] !== undefined);
  }
  return out;
}
