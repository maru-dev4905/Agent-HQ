import { parseIncomingEvent, type IncomingAgentEvent } from '@agent-hq/events';
import { describe, expect, it } from 'vitest';
import { pickAllowed } from './allowlist.js';
import { CLAUDE_CODE_CAPABILITIES } from './capabilities.js';
import {
  expirePending,
  mainAgentId,
  mapDropped,
  mapHook,
  pruneSessions,
  type AdapterState,
  type MapResult,
} from './map.js';

const SESSION = '3f2a9c1e-0000-4000-8000-000000000001';
const MAIN = mainAgentId(SESSION);
/** Free text a real session could carry; it must never reach an event. */
const MARKER = 'SECRET_MARKER_7f3a';

const hook = (name: string, fields: Record<string, unknown> = {}) => ({
  session_id: SESSION,
  hook_event_name: name,
  transcript_path: `/Users/someone/${MARKER}/transcript.jsonl`,
  cwd: `/Users/someone/${MARKER}`,
  permission_mode: 'default',
  ...fields,
});

const at = (i: number) => new Date(Date.UTC(2026, 10, 27, 9, 0, 0) + i * 1000).toISOString();

/** Feeds inputs in order, one second apart. */
function run(inputs: unknown[], start: AdapterState = {}) {
  let state = start;
  const events: IncomingAgentEvent[] = [];
  const ignored: MapResult['ignored'] = [];
  inputs.forEach((input, i) => {
    const result = mapHook(state, input, { occurredAt: at(i) });
    state = result.state;
    events.push(...result.events);
    ignored.push(...result.ignored);
  });
  return { state, events, ignored };
}

const summary = (events: IncomingAgentEvent[]) =>
  events.map((e) => [e.type, e.source.externalAgentId, e.payload]);

describe('mapHook — RES-002 §4 rows', () => {
  it('maps the session lifecycle and status hooks of the main agent', () => {
    const { events } = run([
      hook('SessionStart', { source: 'startup' }),
      hook('UserPromptSubmit', { prompt: `do it ${MARKER}` }),
      hook('Notification', { notification_type: 'permission_prompt', message: MARKER }),
      hook('Stop', { last_assistant_message: MARKER }),
      hook('StopFailure', { error: 'rate_limit', error_details: MARKER }),
      hook('SessionEnd', { reason: 'prompt_input_exit' }),
    ]);
    expect(summary(events)).toEqual([
      ['agent.connected', MAIN, { agentName: 'main', executionLocation: 'local' }],
      ['agent.status.changed', MAIN, { status: 'working' }],
      ['agent.status.changed', MAIN, { status: 'waiting', rawStatus: 'permission_prompt' }],
      ['agent.status.changed', MAIN, { status: 'waiting', rawStatus: 'stop' }],
      ['agent.failed', MAIN, { errorCode: 'rate_limit' }],
      ['agent.disconnected', MAIN, { reason: 'prompt_input_exit' }],
    ]);
  });

  it('maps tool start, completion, failure and interruption with the runtime call ID', () => {
    const { events } = run([
      hook('PreToolUse', {
        tool_name: 'Bash',
        tool_use_id: 'toolu_1',
        tool_input: { command: `cat ${MARKER}` },
      }),
      hook('PostToolUse', {
        tool_name: 'Bash',
        tool_use_id: 'toolu_1',
        duration_ms: 12,
        tool_response: MARKER,
      }),
      hook('PreToolUse', {
        tool_name: 'mcp__docs__search',
        tool_use_id: 'toolu_2',
        mcp_server: { name: 'docs', url: MARKER },
      }),
      hook('PostToolUseFailure', {
        tool_name: 'mcp__docs__search',
        tool_use_id: 'toolu_2',
        duration_ms: 30,
        is_interrupt: false,
        error: MARKER,
      }),
      hook('PreToolUse', { tool_name: 'Read', tool_use_id: 'toolu_3' }),
      hook('PostToolUseFailure', {
        tool_name: 'Read',
        tool_use_id: 'toolu_3',
        is_interrupt: true,
      }),
    ]);
    expect(summary(events)).toEqual([
      ['tool.call.started', MAIN, { toolName: 'Bash', externalToolCallId: 'toolu_1' }],
      [
        'tool.call.completed',
        MAIN,
        { toolName: 'Bash', externalToolCallId: 'toolu_1', durationMs: 12 },
      ],
      [
        'tool.call.started',
        MAIN,
        { toolName: 'mcp__docs__search', externalToolCallId: 'toolu_2', serverName: 'docs' },
      ],
      [
        'tool.call.failed',
        MAIN,
        { toolName: 'mcp__docs__search', externalToolCallId: 'toolu_2', durationMs: 30 },
      ],
      ['tool.call.started', MAIN, { toolName: 'Read', externalToolCallId: 'toolu_3' }],
      [
        'tool.call.failed',
        MAIN,
        { toolName: 'Read', externalToolCallId: 'toolu_3', errorCode: 'interrupted' },
      ],
    ]);
  });

  it('maps subagents with their parent, role and their own tool calls', () => {
    const { events } = run([
      hook('SessionStart'),
      hook('SubagentStart', { agent_id: 'agent_a1', agent_type: 'general-purpose' }),
      hook('PreToolUse', {
        agent_id: 'agent_a1',
        agent_type: 'general-purpose',
        tool_name: 'Read',
        tool_use_id: 'toolu_9',
      }),
      hook('PostToolUse', { agent_id: 'agent_a1', tool_name: 'Read', tool_use_id: 'toolu_9' }),
      hook('SubagentStop', { agent_id: 'agent_a1', last_assistant_message: MARKER }),
    ]);
    expect(summary(events).slice(1)).toEqual([
      [
        'agent.started',
        'agent_a1',
        { agentName: 'general-purpose', roleHint: 'general-purpose', parentExternalAgentId: MAIN },
      ],
      ['tool.call.started', 'agent_a1', { toolName: 'Read', externalToolCallId: 'toolu_9' }],
      ['tool.call.completed', 'agent_a1', { toolName: 'Read', externalToolCallId: 'toolu_9' }],
      ['agent.completed', 'agent_a1', {}],
    ]);
  });

  it('every event passes the contract, carries the envelope rules and a per-session sequence', () => {
    const { events } = run([
      hook('SessionStart'),
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_1' }),
      hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_1' }),
      hook('Stop'),
    ]);
    for (const event of events) {
      expect(parseIncomingEvent(event)).toMatchObject({ ok: true, ignoredFields: [] });
      expect(event).toMatchObject({
        timestampQuality: 'collected',
        correlationId: SESSION,
        source: { adapterId: 'claude-code', runtime: 'claude-code', externalSessionId: SESSION },
      });
    }
    expect(events.map((e) => e.sequence)).toEqual([0, 1, 2, 3]);
    expect(events.map((e) => e.idempotencyKey)).toEqual([
      `${SESSION}:SessionStart:0`,
      `${SESSION}:toolu_1:started`,
      `${SESSION}:toolu_1:completed`,
      `${SESSION}:Stop:3`,
    ]);
  });
});

describe('mapHook — determinism and duplicates (RES-002 §5.5)', () => {
  const inputs = [
    hook('SessionStart'),
    hook('SubagentStart', { agent_id: 'agent_a1', agent_type: 'worker' }),
    hook('SubagentStop', { agent_id: 'agent_a1' }),
    // The same subagent is resumed: a new run, not a duplicate of the first.
    hook('SubagentStart', { agent_id: 'agent_a1', agent_type: 'worker' }),
    hook('SubagentStop', { agent_id: 'agent_a1' }),
  ];

  it('gives the same events for the same input order', () => {
    expect(run(inputs).events).toEqual(run(inputs).events);
  });

  it('keys a resumed subagent run separately so it is not dropped as a duplicate', () => {
    const keys = run(inputs).events.map((e) => e.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.slice(1)).toEqual([
      `${SESSION}:agent_a1:1:started`,
      `${SESSION}:agent_a1:1:completed`,
      `${SESSION}:agent_a1:2:started`,
      `${SESSION}:agent_a1:2:completed`,
    ]);
  });

  it('names no run for a Stop that may belong to either of two open runs (ADR-0007 §10)', () => {
    const keys = run([
      hook('SubagentStart', { agent_id: 'agent_a1' }),
      // The first run's Stop is lost or late: the next Stop could be either run's.
      hook('SubagentStart', { agent_id: 'agent_a1' }),
      hook('SubagentStop', { agent_id: 'agent_a1' }),
      // A further Stop can only be the second run's own.
      hook('SubagentStop', { agent_id: 'agent_a1' }),
    ]).events.map((e) => e.idempotencyKey);
    expect(keys).toEqual([
      `${SESSION}:agent_a1:1:started`,
      `${SESSION}:agent_a1:2:started`,
      `${SESSION}:agent_a1:unmatched:2`,
      `${SESSION}:agent_a1:2:completed`,
    ]);
  });

  it('ignores the same hook delivered twice instead of re-keying it', () => {
    const pre = hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_1' });
    const post = hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_1' });
    const { events, ignored } = run([pre, pre, post, post, pre]);
    expect(events.map((e) => e.idempotencyKey)).toEqual([
      `${SESSION}:toolu_1:started`,
      `${SESSION}:toolu_1:completed`,
    ]);
    expect(ignored).toEqual([
      { reason: 'duplicate', detail: 'PreToolUse:toolu_1' },
      { reason: 'duplicate', detail: 'PostToolUse:toolu_1' },
      { reason: 'duplicate', detail: 'PreToolUse:toolu_1' },
    ]);
  });

  it('a duplicate Pre does not reset a call that is waiting to be confirmed', () => {
    const pre = hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_w' });
    const { state } = run([
      pre,
      hook('PostToolBatch', { tool_calls: [{ tool_use_id: 'toolu_w' }] }),
      pre,
    ]);
    expect(expirePending(state, at(60)).events.map((e) => e.idempotencyKey)).toEqual([
      `${SESSION}:toolu_w:not_executed`,
    ]);
  });

  it('pairs parallel tool calls by call ID when Posts arrive in completion order', () => {
    const { events } = run([
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_slow' }),
      hook('PreToolUse', { tool_name: 'Read', tool_use_id: 'toolu_fast' }),
      hook('PostToolUse', { tool_name: 'Read', tool_use_id: 'toolu_fast' }),
      hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_slow' }),
    ]);
    const done = events.filter((e) => e.type === 'tool.call.completed');
    expect(done.map((e) => [e.payload, e.idempotencyKey])).toEqual([
      [{ toolName: 'Read', externalToolCallId: 'toolu_fast' }, `${SESSION}:toolu_fast:completed`],
      [{ toolName: 'Bash', externalToolCallId: 'toolu_slow' }, `${SESSION}:toolu_slow:completed`],
    ]);
  });

  it('keeps sessions apart', () => {
    const other = { ...hook('SessionStart'), session_id: 'other-session' };
    const { state, events } = run([hook('SessionStart'), other]);
    expect(events.map((e) => e.sequence)).toEqual([0, 0]);
    expect(Object.keys(state)).toEqual([SESSION, 'other-session']);
  });

  it('does not mutate the state it was given', () => {
    const { state } = run([hook('SessionStart')]);
    const frozen = structuredClone(state);
    mapHook(state, hook('Stop'), { occurredAt: at(5) });
    expect(state).toEqual(frozen);
  });
});

describe('not executed tool calls (RES-002 §5.4)', () => {
  it('rule 1: a call listed in a batch without any PreToolUse is not executed', () => {
    const { events } = run([
      hook('PostToolBatch', { tool_calls: [{ tool_use_id: 'toolu_x', tool_name: 'Bash' }] }),
    ]);
    expect(summary(events)).toEqual([
      [
        'tool.call.failed',
        MAIN,
        { toolName: 'Bash', externalToolCallId: 'toolu_x', errorCode: 'not_executed' },
      ],
    ]);
    expect(events[0]?.idempotencyKey).toBe(`${SESSION}:toolu_x:not_executed`);
  });

  it('rule 2: a permission-prompted call is confirmed by the next progress signal', () => {
    const { events } = run([
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_p' }),
      hook('PermissionRequest', { tool_name: 'Bash', tool_input: { command: MARKER } }),
      hook('PostToolBatch', { tool_calls: [{ tool_use_id: 'toolu_p' }] }),
      hook('Stop'),
    ]);
    expect(events.map((e) => [e.type, e.payload])).toEqual([
      ['tool.call.started', { toolName: 'Bash', externalToolCallId: 'toolu_p' }],
      ['agent.status.changed', { status: 'waiting', rawStatus: 'permission_request' }],
      [
        'tool.call.failed',
        { toolName: 'Bash', externalToolCallId: 'toolu_p', errorCode: 'not_executed' },
      ],
      ['agent.status.changed', { status: 'waiting', rawStatus: 'stop' }],
    ]);
  });

  it('rule 2 does not guess between parallel calls of the same tool', () => {
    const { state, events } = run([
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_a' }),
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_b' }),
      // Which of the two asked? Unknown — neither is marked.
      hook('PermissionRequest', { tool_name: 'Bash' }),
      hook('PostToolBatch', {
        tool_calls: [{ tool_use_id: 'toolu_a' }, { tool_use_id: 'toolu_b' }],
      }),
      hook('UserPromptSubmit'),
      hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_b' }),
    ]);
    expect(events.filter((e) => e.type === 'tool.call.failed')).toEqual([]);
    // toolu_a never got a Post: the grace period decides (rule 3).
    expect(expirePending(state, at(60)).events.map((e) => e.idempotencyKey)).toEqual([
      `${SESSION}:toolu_a:not_executed`,
    ]);
  });

  it('rule 3: other batch-listed calls wait for the grace period, then are not executed', () => {
    const { state, events } = run([
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_w' }),
      hook('PostToolBatch', { tool_calls: [{ tool_use_id: 'toolu_w' }] }),
      // A progress signal alone does not confirm a call that never asked for permission.
      hook('UserPromptSubmit'),
    ]);
    expect(events.map((e) => e.type)).toEqual(['tool.call.started', 'agent.status.changed']);
    // Batch at at(1), grace 5 s → deadline at(6).
    expect(expirePending(state, at(5)).events).toEqual([]);
    const expired = expirePending(state, at(6));
    expect(expired.events.map((e) => [e.type, e.payload, e.occurredAt])).toEqual([
      [
        'tool.call.failed',
        { toolName: 'Bash', externalToolCallId: 'toolu_w', errorCode: 'not_executed' },
        at(6),
      ],
    ]);
    expect(expirePending(expired.state, at(9)).events).toEqual([]);
  });

  it('a Post that arrives in time wins, and a late Post is still recorded under its own key', () => {
    const inTime = run([
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_t' }),
      hook('PostToolBatch', { tool_calls: [{ tool_use_id: 'toolu_t' }] }),
      hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_t' }),
    ]);
    expect(expirePending(inTime.state, at(60)).events).toEqual([]);

    const late = run([
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_l' }),
      hook('PostToolBatch', { tool_calls: [{ tool_use_id: 'toolu_l' }] }),
    ]);
    const expired = expirePending(late.state, at(60));
    const after = mapHook(expired.state, hook('PostToolUse', { tool_use_id: 'toolu_l' }), {
      occurredAt: at(61),
    });
    expect([...expired.events, ...after.events].map((e) => e.idempotencyKey)).toEqual([
      `${SESSION}:toolu_l:not_executed`,
      `${SESSION}:toolu_l:completed`,
    ]);
  });

  it('a batch listing already finished calls adds nothing', () => {
    const { events } = run([
      hook('PreToolUse', { tool_name: 'Read', tool_use_id: 'toolu_d' }),
      hook('PostToolUse', { tool_name: 'Read', tool_use_id: 'toolu_d' }),
      hook('PostToolBatch', { tool_calls: [{ tool_use_id: 'toolu_d' }] }),
    ]);
    expect(events.map((e) => e.type)).toEqual(['tool.call.started', 'tool.call.completed']);
  });
});

describe('content never passes (data-governance, ADR-0007 §3)', () => {
  it('no free text, path or error detail from any hook reaches an event', () => {
    const everything = [
      'SessionStart',
      'SessionEnd',
      'UserPromptSubmit',
      'Stop',
      'StopFailure',
      'Notification',
      'PermissionRequest',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'PostToolBatch',
      'SubagentStart',
      'SubagentStop',
    ].map((name) =>
      hook(name, {
        prompt: MARKER,
        tool_input: { file_path: `/tmp/${MARKER}` },
        tool_response: MARKER,
        last_assistant_message: MARKER,
        message: MARKER,
        error: `failed: ${MARKER}`,
        error_details: MARKER,
        // A listed field holding free text is dropped as well.
        reason: `the user said ${MARKER}`,
        notification_type: 'agent_needs_input',
        tool_name: 'Bash',
        tool_use_id: `toolu_${name}`,
        agent_id: 'agent_a1',
        tool_calls: [{ tool_use_id: 'toolu_b', input: MARKER }],
      }),
    );
    const { events } = run(everything);
    expect(events.length).toBeGreaterThan(10);
    expect(JSON.stringify(events)).not.toContain(MARKER);
  });

  it('the allowlist keeps only tokens, counts and flags', () => {
    expect(
      pickAllowed(
        hook('PostToolUseFailure', {
          tool_name: 'Bash',
          tool_use_id: 'toolu_1',
          duration_ms: 3,
          is_interrupt: true,
          error: MARKER,
        }),
      ),
    ).toEqual({
      session_id: SESSION,
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      tool_use_id: 'toolu_1',
      duration_ms: 3,
      is_interrupt: true,
    });
    expect(pickAllowed(hook('SessionEnd', { reason: '../../etc' }))).not.toHaveProperty('reason');
    expect(pickAllowed({ hook_event_name: 'Stop' })).toBeNull();
    // Runtime IDs may not contain ':' (keeps idempotency keys unambiguous) or be overlong.
    expect(pickAllowed(hook('PreToolUse', { tool_use_id: 'a:1' }))).not.toHaveProperty(
      'tool_use_id',
    );
    expect(pickAllowed(hook('PreToolUse', { tool_use_id: 'x'.repeat(101) }))).not.toHaveProperty(
      'tool_use_id',
    );
    expect(pickAllowed('not an object')).toBeNull();
  });
});

describe('unknown and invalid input is reported, never mis-mapped', () => {
  it('ignores unsupported hooks and notifications by name', () => {
    const { events, ignored } = run([
      hook('PreCompact', { trigger: 'auto' }),
      hook('Notification', { notification_type: 'idle_prompt' }),
      hook('PreToolUse', { tool_name: 'Bash' }),
    ]);
    expect(events).toEqual([]);
    expect(ignored).toEqual([
      { reason: 'unsupported_hook', detail: 'PreCompact' },
      { reason: 'unsupported_notification', detail: 'idle_prompt' },
      { reason: 'invalid_input', detail: 'tool_use_id,tool_name' },
    ]);
  });

  it('rejects input without a session and keeps the state', () => {
    const result = mapHook({}, { hook_event_name: 'Stop' }, { occurredAt: at(0) });
    expect(result).toEqual({
      state: {},
      events: [],
      ignored: [{ reason: 'invalid_input', detail: 'session_id' }],
    });
  });

  it('rejects an unreadable timestamp before touching the state', () => {
    const { state } = run([hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_1' })]);
    const batch = hook('PostToolBatch', { tool_calls: [{ tool_use_id: 'toolu_1' }] });
    const result = mapHook(state, batch, { occurredAt: 'yesterday' });
    expect(result).toEqual({
      state,
      events: [],
      ignored: [{ reason: 'invalid_input', detail: 'occurredAt' }],
    });
    expect(expirePending(state, 'never').ignored).toEqual([
      { reason: 'invalid_input', detail: 'now' },
    ]);
  });

  it('reports a contract violation instead of emitting it (non-UTC timestamp)', () => {
    const result = mapHook({}, hook('Stop'), { occurredAt: '2026-11-27T18:00:00+09:00' });
    expect(result.events).toEqual([]);
    expect(result.ignored).toEqual([
      { reason: 'contract_violation', detail: expect.stringContaining('occurredAt') as string },
    ]);
    // A rejected event does not consume a sequence number.
    expect(result.state[SESSION]?.nextSequence).toBe(0);
  });
});

describe('dropped hook signals (ADR-0007 §7)', () => {
  it('become a source-side gap at their place in the session, with the count in reason', () => {
    const { state } = run([hook('SessionStart')]);
    const { events } = mapDropped(state, { sessionId: SESSION, count: 3, occurredAt: at(4) });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'event.gap.detected',
        sequence: 1,
        occurredAt: at(4),
        payload: { reason: 'hook_dropped: 3 signal(s)' },
        source: expect.objectContaining({
          adapterId: 'claude-code',
          externalAgentId: MAIN,
        }) as unknown,
      }),
    ]);
  });
});

describe('review fixes (PR #16)', () => {
  it('a redelivered PreToolUse is not a progress signal', () => {
    const { events } = run([
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_p' }),
      hook('PermissionRequest', { tool_name: 'Bash' }),
      hook('PostToolBatch', { tool_calls: [{ tool_use_id: 'toolu_p' }] }),
      // The same Pre again must not confirm toolu_p as not executed.
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_p' }),
    ]);
    expect(events.filter((e) => e.type === 'tool.call.failed')).toEqual([]);
  });

  it('a second permission prompt with two open calls of the same tool marks neither', () => {
    const { events } = run([
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_a' }),
      hook('PermissionRequest', { tool_name: 'Bash' }),
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_b' }),
      // toolu_a is already marked; this prompt may be about either call.
      hook('PermissionRequest', { tool_name: 'Bash' }),
      hook('PostToolBatch', {
        tool_calls: [{ tool_use_id: 'toolu_a' }, { tool_use_id: 'toolu_b' }],
      }),
      hook('UserPromptSubmit'),
    ]);
    // Only toolu_a, marked when it was the single candidate, is confirmed by progress.
    expect(
      events.filter((e) => e.type === 'tool.call.failed').map((e) => e.idempotencyKey),
    ).toEqual([`${SESSION}:toolu_a:not_executed`]);
  });

  it('a redelivered batch keeps the first deadline', () => {
    const batch = hook('PostToolBatch', { tool_calls: [{ tool_use_id: 'toolu_w' }] });
    const { state } = run([
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_w' }),
      batch,
    ]);
    const again = mapHook(state, batch, { occurredAt: at(4) }).state;
    // First batch at at(1) → deadline at(6), not at(9).
    expect(expirePending(again, at(6)).events).toHaveLength(1);
  });

  it('runtime IDs named like Object.prototype members are ordinary IDs', () => {
    for (const id of ['toString', 'constructor', 'hasOwnProperty']) {
      const { events } = run([hook('PreToolUse', { tool_name: 'Bash', tool_use_id: id })]);
      expect(events.map((e) => e.type)).toEqual(['tool.call.started']);
    }
    expect(pickAllowed(hook('PreToolUse', { tool_use_id: '__proto__' }))).not.toHaveProperty(
      'tool_use_id',
    );
    const other = { ...hook('SessionStart'), session_id: 'toString' };
    expect(run([other]).events).toHaveLength(1);
  });

  it('an unsupported hook does not register a session', () => {
    const result = mapHook({}, hook('PreCompact'), { occurredAt: at(0) });
    expect(result.state).toEqual({});
  });

  it('a resumed session is not compacted, and a rejected SessionEnd does not end it', () => {
    const ended = run([hook('SessionStart'), hook('SessionEnd')]).state;
    const resumed = mapHook(ended, hook('SessionStart', { source: 'resume' }), {
      occurredAt: at(2),
    }).state;
    expect(resumed[SESSION]?.endedAt).toBeUndefined();
    const rejected = mapHook({}, hook('SessionEnd'), { occurredAt: '2026-11-27T18:00:00+09:00' });
    expect(rejected.state[SESSION]?.endedAt).toBeUndefined();
  });
});

describe('dropped signals — input checks', () => {
  it('gives no event for an unknown session or an invalid count', () => {
    const { state } = run([hook('SessionStart')]);
    expect(
      mapDropped(state, { sessionId: 'never-seen', count: 1, occurredAt: at(1) }),
    ).toMatchObject({
      events: [],
      ignored: [{ reason: 'unknown_session', detail: 'dropped' }],
    });
    for (const count of [0, -1, 1.5, Number.NaN]) {
      expect(mapDropped(state, { sessionId: SESSION, count, occurredAt: at(1) }).events).toEqual(
        [],
      );
    }
  });
});

describe('pruneSessions', () => {
  it('compacts ended sessions but keeps the counters, so a resumed session reuses no key', () => {
    const { state } = run([
      hook('SessionStart'),
      hook('SubagentStart', { agent_id: 'agent_a1' }),
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_open' }),
      hook('SessionEnd'),
    ]);
    expect(pruneSessions(state, at(10), 60_000)).toBe(state);
    const pruned = pruneSessions(state, at(3 + 61), 60_000);
    expect(pruned[SESSION]).toMatchObject({
      nextSequence: 4,
      tools: {},
      finished: [],
      subagents: { agent_a1: { runs: 1, open: null, ambiguous: false } },
    });
    const resumed = run(
      [hook('SessionStart'), hook('SubagentStart', { agent_id: 'agent_a1' })],
      pruned,
    );
    expect(resumed.events.map((e) => e.idempotencyKey)).toEqual([
      `${SESSION}:SessionStart:4`,
      `${SESSION}:agent_a1:2:started`,
    ]);
  });
});

describe('capability declaration (adapter-spec §4)', () => {
  it('offers no control and declares only events the mapping can emit', () => {
    expect(Object.values(CLAUDE_CODE_CAPABILITIES.controls)).toEqual([
      'unsupported',
      'unsupported',
      'unsupported',
    ]);
    expect(CLAUDE_CODE_CAPABILITIES.modes).toEqual({ attached: true, managed: false });
    expect(CLAUDE_CODE_CAPABILITIES.features).toEqual({
      subagents: true,
      toolEvents: true,
      messageEvents: false,
      tokenUsage: false,
      artifacts: false,
      replay: false,
      reconciliation: false,
    });
    const { events } = run([
      hook('SessionStart'),
      hook('UserPromptSubmit'),
      hook('SubagentStart', { agent_id: 'a' }),
      hook('SubagentStop', { agent_id: 'a' }),
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 't1' }),
      hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 't1' }),
      hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 't2' }),
      hook('PostToolUseFailure', { tool_name: 'Bash', tool_use_id: 't2' }),
      hook('StopFailure', { error: 'server_error' }),
      hook('SessionEnd'),
    ]);
    const declared = new Set<string>(CLAUDE_CODE_CAPABILITIES.events);
    for (const event of events) expect(declared.has(event.type)).toBe(true);
  });
});
