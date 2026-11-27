import {
  parseIncomingEvent,
  type EventPayload,
  type EventType,
  type IncomingAgentEvent,
} from '@agent-hq/events';
import { isIdToken, pickAllowed } from './allowlist.js';

/**
 * Claude Code hook → common Event mapping (RES-002 §4–§6, ADR-0007 §3, §7, §10).
 * Pure and deterministic: the same inputs in the same order give the same events,
 * idempotency keys included. The caller (the Bridge) persists the returned state.
 */

export const ADAPTER_ID = 'claude-code';
export const RUNTIME = 'claude-code';

/** Hooks whose arrival proves the session moved on (RES-002 §5.4 rule 2). */
const PROGRESS_HOOKS = new Set(['PreToolUse', 'UserPromptSubmit', 'Stop', 'SessionEnd']);
/** Notifications that mean "waiting for the user" (RES-002 §4). */
const WAITING_NOTIFICATIONS = new Set(['permission_prompt', 'agent_needs_input']);
/** Finished tool calls remembered per session, to tell "already done" from "never started". */
const FINISHED_MEMORY = 500;

export interface ToolCallState {
  agentId: string;
  toolName: string;
  /** `pending`: listed in a PostToolBatch without a Post yet (not_executed candidate). */
  phase: 'started' | 'pending';
  permissionRequested: boolean;
  /** When a pending call is confirmed as not executed if no Post arrives (ISO). */
  deadline?: string;
}

export type FinishedPhase = 'completed' | 'failed' | 'not_executed';

export interface SubagentState {
  /** Runs started so far; part of the idempotency key of each run. */
  runs: number;
  /** The run the next SubagentStop belongs to, if that is unambiguous. */
  open: number | null;
  /**
   * A run started while an earlier one was still open: the next Stop may belong to either
   * (a delayed Stop of the earlier run, or the new run's own). Its key then names no run.
   */
  ambiguous: boolean;
}

export interface SessionState {
  nextSequence: number;
  subagents: Record<string, SubagentState>;
  /** Open tool calls by `tool_use_id`, in arrival order. */
  tools: Record<string, ToolCallState>;
  /** Recently finished calls `[tool_use_id, toolName, agentId, phase]`, oldest first. */
  finished: [string, string, string, FinishedPhase][];
  /** Collected time of SessionEnd, so `pruneSessions` can compact the session later. */
  endedAt?: string;
}

/** JSON-serializable adapter state, keyed by Claude Code `session_id`. */
export type AdapterState = Record<string, SessionState>;

export interface MapOptions {
  /** How long a batch-listed call may wait for its Post before it counts as not executed. */
  notExecutedGraceMs: number;
}

export const DEFAULT_MAP_OPTIONS: MapOptions = { notExecutedGraceMs: 5000 };

export type IgnoredReason =
  | 'invalid_input'
  | 'unsupported_hook'
  | 'unsupported_notification'
  | 'duplicate'
  | 'unknown_session'
  | 'contract_violation';

export interface MapResult {
  state: AdapterState;
  events: IncomingAgentEvent[];
  /**
   * Why (part of) the input produced no event. `detail` holds field or hook names and
   * allowlisted tokens only — never free text — but callers should still log it sparingly.
   */
  ignored: { reason: IgnoredReason; detail: string }[];
}

export const mainAgentId = (sessionId: string) => `main:${sessionId}`;

function emptySession(): SessionState {
  return { nextSequence: 0, subagents: {}, tools: {}, finished: [] };
}

const isTimestamp = (value: string) => !Number.isNaN(Date.parse(value));

/** Copies only the session being changed; other sessions are shared, never mutated. */
function withSession(state: AdapterState, sessionId: string) {
  const current = state[sessionId];
  const session = current === undefined ? emptySession() : structuredClone(current);
  return { next: { ...state, [sessionId]: session }, session };
}

class Builder {
  readonly events: IncomingAgentEvent[] = [];
  readonly ignored: MapResult['ignored'] = [];

  constructor(
    private readonly sessionId: string,
    private readonly session: SessionState,
  ) {}

  /** `key` is prefixed with the session ID; `#seq` becomes this event's sequence (RES-002 §5.5). */
  emit<T extends EventType>(
    type: T,
    agentId: string,
    payload: EventPayload<T>,
    occurredAt: string,
    key: string,
  ): boolean {
    const sequence = this.session.nextSequence;
    const parsed = parseIncomingEvent({
      schemaVersion: 1,
      type,
      occurredAt,
      timestampQuality: 'collected',
      source: {
        adapterId: ADAPTER_ID,
        runtime: RUNTIME,
        externalSessionId: this.sessionId,
        externalAgentId: agentId,
      },
      correlationId: this.sessionId,
      idempotencyKey: `${this.sessionId}:${key.replace('#seq', String(sequence))}`,
      sequence,
      payload,
    });
    if (!parsed.ok) {
      this.ignored.push({
        reason: 'contract_violation',
        detail: `${type}: ${parsed.issues.map((i) => i.path).join(',')}`,
      });
      return false;
    }
    this.session.nextSequence += 1;
    this.events.push(parsed.event);
    return true;
  }
}

function remember(
  session: SessionState,
  toolUseId: string,
  call: { toolName: string; agentId: string },
  phase: FinishedPhase,
): void {
  delete session.tools[toolUseId];
  session.finished = session.finished.filter(([id]) => id !== toolUseId);
  session.finished.push([toolUseId, call.toolName, call.agentId, phase]);
  if (session.finished.length > FINISHED_MEMORY) session.finished.shift();
}

function finishedCall(session: SessionState, toolUseId: string) {
  const found = session.finished.find(([id]) => id === toolUseId);
  return found === undefined
    ? undefined
    : { toolName: found[1], agentId: found[2], phase: found[3] };
}

function notExecuted(
  b: Builder,
  session: SessionState,
  toolUseId: string,
  call: { agentId: string; toolName: string },
  occurredAt: string,
): void {
  const sent = b.emit(
    'tool.call.failed',
    call.agentId,
    { toolName: call.toolName, externalToolCallId: toolUseId, errorCode: 'not_executed' },
    occurredAt,
    `${toolUseId}:not_executed`,
  );
  if (sent) remember(session, toolUseId, call, 'not_executed');
}

const str = (input: Record<string, unknown>, key: string): string | undefined =>
  typeof input[key] === 'string' ? input[key] : undefined;

/**
 * Maps one hook input. The input is filtered through the allowlist first, so raw spool
 * content that bypassed the hook command is treated the same way.
 */
export function mapHook(
  state: AdapterState,
  raw: unknown,
  meta: { occurredAt: string },
  options: MapOptions = DEFAULT_MAP_OPTIONS,
): MapResult {
  const input = pickAllowed(raw);
  if (input === null) {
    return { state, events: [], ignored: [{ reason: 'invalid_input', detail: 'session_id' }] };
  }
  const at = meta.occurredAt;
  if (!isTimestamp(at)) {
    return { state, events: [], ignored: [{ reason: 'invalid_input', detail: 'occurredAt' }] };
  }
  const sessionId = input['session_id'] as string;
  const hook = input['hook_event_name'] as string;
  const { next, session } = withSession(state, sessionId);
  const b = new Builder(sessionId, session);
  const main = mainAgentId(sessionId);
  const agent = str(input, 'agent_id') ?? main;

  // A progress signal confirms calls that waited on a permission prompt (RES-002 §5.4 rule 2).
  if (PROGRESS_HOOKS.has(hook)) {
    for (const [id, call] of Object.entries(session.tools)) {
      if (call.phase === 'pending' && call.permissionRequested)
        notExecuted(b, session, id, call, at);
    }
  }

  switch (hook) {
    case 'SessionStart':
      b.emit(
        'agent.connected',
        main,
        { agentName: 'main', executionLocation: 'local' },
        at,
        'SessionStart:#seq',
      );
      break;
    case 'SessionEnd': {
      const reason = str(input, 'reason');
      b.emit(
        'agent.disconnected',
        main,
        reason === undefined ? {} : { reason },
        at,
        'SessionEnd:#seq',
      );
      session.endedAt = at;
      break;
    }
    case 'UserPromptSubmit':
      b.emit('agent.status.changed', main, { status: 'working' }, at, 'UserPromptSubmit:#seq');
      break;
    case 'Stop':
      // User decision 2026-11-25: the main agent waits for the user's next input.
      b.emit(
        'agent.status.changed',
        main,
        { status: 'waiting', rawStatus: 'stop' },
        at,
        'Stop:#seq',
      );
      break;
    case 'StopFailure': {
      // `error` here is the failure kind (matcher value such as `rate_limit`), not free text.
      const errorCode = str(input, 'error');
      b.emit(
        'agent.failed',
        main,
        errorCode === undefined ? {} : { errorCode },
        at,
        'StopFailure:#seq',
      );
      break;
    }
    case 'Notification': {
      const type = str(input, 'notification_type');
      if (type === undefined || !WAITING_NOTIFICATIONS.has(type)) {
        b.ignored.push({ reason: 'unsupported_notification', detail: type ?? 'missing' });
        break;
      }
      b.emit(
        'agent.status.changed',
        agent,
        { status: 'waiting', rawStatus: type },
        at,
        'Notification:#seq',
      );
      break;
    }
    case 'PermissionRequest': {
      // No tool_use_id here (RES-002 §3). Mark the call only when exactly one open call of
      // that tool and agent could be meant; otherwise leave it to the grace period (rule 3)
      // rather than guess, since a wrong not_executed can never be taken back.
      const toolName = str(input, 'tool_name');
      const candidates = Object.values(session.tools).filter(
        (c) => c.agentId === agent && c.toolName === toolName && !c.permissionRequested,
      );
      if (candidates.length === 1 && candidates[0] !== undefined) {
        candidates[0].permissionRequested = true;
      }
      b.emit(
        'agent.status.changed',
        agent,
        { status: 'waiting', rawStatus: 'permission_request' },
        at,
        'PermissionRequest:#seq',
      );
      break;
    }
    case 'PreToolUse': {
      const id = str(input, 'tool_use_id');
      const toolName = str(input, 'tool_name');
      if (id === undefined || toolName === undefined) {
        b.ignored.push({ reason: 'invalid_input', detail: 'tool_use_id,tool_name' });
        break;
      }
      if (session.tools[id] !== undefined || finishedCall(session, id) !== undefined) {
        // The same hook delivered twice (e.g. installed in two settings files): nothing new.
        b.ignored.push({ reason: 'duplicate', detail: `${hook}:${id}` });
        break;
      }
      const server = input['mcp_server'] as { name?: string } | undefined;
      const sent = b.emit(
        'tool.call.started',
        agent,
        {
          toolName,
          externalToolCallId: id,
          ...(server?.name === undefined ? {} : { serverName: server.name }),
        },
        at,
        `${id}:started`,
      );
      if (sent)
        session.tools[id] = {
          agentId: agent,
          toolName,
          phase: 'started',
          permissionRequested: false,
        };
      break;
    }
    case 'PostToolUse':
    case 'PostToolUseFailure': {
      const id = str(input, 'tool_use_id');
      const done = id === undefined ? undefined : finishedCall(session, id);
      const known = id === undefined ? undefined : (session.tools[id] ?? done);
      const toolName = str(input, 'tool_name') ?? known?.toolName;
      if (id === undefined || toolName === undefined) {
        b.ignored.push({ reason: 'invalid_input', detail: 'tool_use_id,tool_name' });
        break;
      }
      const phase: FinishedPhase = hook === 'PostToolUse' ? 'completed' : 'failed';
      // A Post after not_executed is still recorded under its own key (RES-002 §5.4);
      // a second Post of an already finished call is a duplicate.
      if (done !== undefined && done.phase !== 'not_executed') {
        b.ignored.push({ reason: 'duplicate', detail: `${hook}:${id}` });
        break;
      }
      const owner = str(input, 'agent_id') ?? known?.agentId ?? main;
      const duration =
        typeof input['duration_ms'] === 'number' ? { durationMs: input['duration_ms'] } : {};
      const sent =
        phase === 'completed'
          ? b.emit(
              'tool.call.completed',
              owner,
              { toolName, externalToolCallId: id, ...duration },
              at,
              `${id}:completed`,
            )
          : b.emit(
              'tool.call.failed',
              owner,
              {
                toolName,
                externalToolCallId: id,
                ...duration,
                ...(input['is_interrupt'] === true ? { errorCode: 'interrupted' } : {}),
              },
              at,
              `${id}:failed`,
            );
      if (sent) remember(session, id, { toolName, agentId: owner }, phase);
      break;
    }
    case 'PostToolBatch': {
      const calls = Array.isArray(input['tool_calls'])
        ? (input['tool_calls'] as { tool_use_id: string; tool_name?: string }[])
        : [];
      for (const call of calls) {
        const id = call.tool_use_id;
        const open = session.tools[id];
        if (open !== undefined) {
          // Started but no Post yet: wait (rules 2 and 3), never guess now.
          open.phase = 'pending';
          open.deadline = new Date(Date.parse(at) + options.notExecutedGraceMs).toISOString();
        } else if (finishedCall(session, id) === undefined) {
          // Rule 1: no PreToolUse at all — refused before it ran. The batch may not name
          // the tool; the contract requires one, so it is reported as `unknown`.
          notExecuted(
            b,
            session,
            id,
            { agentId: agent, toolName: call.tool_name ?? 'unknown' },
            at,
          );
        }
      }
      break;
    }
    case 'SubagentStart': {
      const id = str(input, 'agent_id');
      if (id === undefined) {
        b.ignored.push({ reason: 'invalid_input', detail: 'agent_id' });
        break;
      }
      const sub = (session.subagents[id] ??= { runs: 0, open: null, ambiguous: false });
      sub.runs += 1;
      // An earlier run still open (its Stop lost or late): the next Stop is ambiguous (ADR-0007 §10).
      sub.ambiguous = sub.open !== null;
      sub.open = sub.runs;
      const role = str(input, 'agent_type');
      b.emit(
        'agent.started',
        id,
        {
          ...(role === undefined ? {} : { agentName: role, roleHint: role }),
          parentExternalAgentId: main,
        },
        at,
        `${id}:${sub.runs}:started`,
      );
      break;
    }
    case 'SubagentStop': {
      const id = str(input, 'agent_id');
      if (id === undefined) {
        b.ignored.push({ reason: 'invalid_input', detail: 'agent_id' });
        break;
      }
      const sub = session.subagents[id];
      let key = `${id}:unmatched:#seq`;
      if (sub !== undefined && sub.open !== null) {
        if (sub.ambiguous) {
          // Either the earlier run's late Stop or this run's own: name no run, keep the new
          // run open so its own Stop (if this was the late one) still finds it.
          sub.ambiguous = false;
        } else {
          key = `${id}:${sub.open}:completed`;
          sub.open = null;
        }
      }
      b.emit('agent.completed', id, {}, at, key);
      break;
    }
    default:
      b.ignored.push({ reason: 'unsupported_hook', detail: hook });
  }
  return { state: next, events: b.events, ignored: b.ignored };
}

/** Confirms batch-listed calls whose grace period ended without a Post (RES-002 §5.4 rule 3). */
export function expirePending(state: AdapterState, now: string): MapResult {
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) {
    return { state, events: [], ignored: [{ reason: 'invalid_input', detail: 'now' }] };
  }
  let next = state;
  const events: IncomingAgentEvent[] = [];
  const ignored: MapResult['ignored'] = [];
  for (const [sessionId, current] of Object.entries(state)) {
    const due = Object.entries(current.tools).filter(
      ([, call]) =>
        call.phase === 'pending' &&
        call.deadline !== undefined &&
        Date.parse(call.deadline) <= nowMs,
    );
    if (due.length === 0) continue;
    const touched = withSession(next, sessionId);
    next = touched.next;
    const b = new Builder(sessionId, touched.session);
    for (const [id, call] of due) notExecuted(b, touched.session, id, call, now);
    events.push(...b.events);
    ignored.push(...b.ignored);
  }
  return { state: next, events, ignored };
}

/**
 * Signals the hook could not record (ADR-0007 §7): a source-side gap where they were lost.
 * The Bridge resolves the log's session key to a known session first; an unknown session
 * gives no event (there is no agent to attach it to).
 */
export function mapDropped(
  state: AdapterState,
  dropped: { sessionId: string; count: number; occurredAt: string },
): MapResult {
  const { sessionId, count, occurredAt } = dropped;
  if (!isIdToken(sessionId) || !Number.isInteger(count) || count < 1 || !isTimestamp(occurredAt)) {
    return { state, events: [], ignored: [{ reason: 'invalid_input', detail: 'dropped' }] };
  }
  if (state[sessionId] === undefined) {
    return { state, events: [], ignored: [{ reason: 'unknown_session', detail: 'dropped' }] };
  }
  const { next, session } = withSession(state, sessionId);
  const b = new Builder(sessionId, session);
  b.emit(
    'event.gap.detected',
    mainAgentId(sessionId),
    { reason: `hook_dropped: ${count} signal(s)` },
    occurredAt,
    'dropped:#seq',
  );
  return { state: next, events: b.events, ignored: b.ignored };
}

/**
 * Compacts sessions that ended more than `retainMs` ago: open calls and the finished list
 * are dropped, but the sequence and subagent run counters stay, so a resumed session never
 * reuses an idempotency key.
 */
export function pruneSessions(state: AdapterState, now: string, retainMs: number): AdapterState {
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) return state;
  let next = state;
  for (const [sessionId, session] of Object.entries(state)) {
    if (session.endedAt === undefined || nowMs - Date.parse(session.endedAt) < retainMs) continue;
    if (Object.keys(session.tools).length === 0 && session.finished.length === 0) continue;
    const subagents = Object.fromEntries(
      Object.entries(session.subagents).map(([id, s]) => [
        id,
        { runs: s.runs, open: null, ambiguous: false },
      ]),
    );
    next = {
      ...next,
      [sessionId]: { ...session, subagents, tools: {}, finished: [] },
    };
  }
  return next;
}
