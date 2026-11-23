import type { IncomingAgentEvent } from '@agent-hq/events';
import type { SimClock } from './clock.js';
import type { Random } from './random.js';
import { SimSession } from './session.js';

export interface ScenarioContext {
  clock: SimClock;
  random: Random;
}

export type Scenario = (ctx: ScenarioContext) => IncomingAgentEvent[];

function session(name: string, id: string, ctx: ScenarioContext): SimSession {
  return new SimSession(name, id, `run_${name}`, ctx.clock, ctx.random);
}

/** Milliseconds between an earlier event and a timestamp, so durations match the timeline. */
function elapsed(from: IncomingAgentEvent, to: string): number {
  return Date.parse(to) - Date.parse(from.occurredAt);
}

/** A tool call that starts and then completes or fails, with a consistent duration. */
function toolCall(
  s: SimSession,
  agent: string,
  toolName: string,
  callId: string,
  outcome: 'completed' | 'failed' = 'completed',
): IncomingAgentEvent[] {
  const refs = { externalAgentId: agent };
  const started = s.emit('tool.call.started', refs, { toolName, externalToolCallId: callId });
  const finished = s.emitAt((occurredAt) =>
    outcome === 'completed'
      ? {
          type: 'tool.call.completed' as const,
          refs,
          payload: {
            toolName,
            externalToolCallId: callId,
            durationMs: elapsed(started, occurredAt),
          },
        }
      : {
          type: 'tool.call.failed' as const,
          refs,
          payload: {
            toolName,
            externalToolCallId: callId,
            durationMs: elapsed(started, occurredAt),
            errorCode: 'EXIT_1',
          },
        },
  );
  return [started, finished];
}

/** One agent works one task with a few tool calls. */
const singleAgent: Scenario = (ctx) => {
  const s = session('single-agent', 'sess_single', ctx);
  const agent = 'agent_main';
  const refs = { externalAgentId: agent, externalTaskId: 'task_main' };
  const tools = ['Read', 'Edit', 'Bash'];
  const rounds = ctx.random.int(2, 4);
  return [
    s.emit(
      'agent.connected',
      { externalAgentId: agent },
      { agentName: 'main', executionLocation: 'local' },
    ),
    s.emit('agent.status.changed', { externalAgentId: agent }, { status: 'working' }),
    s.emit('task.created', refs, { title: 'Implement feature' }),
    s.emit('task.started', refs, {}),
    ...Array.from({ length: rounds }, (_, i) =>
      toolCall(s, agent, tools[i % tools.length] ?? 'Read', `call_${i + 1}`),
    ).flat(),
    s.emit('task.completed', refs, { summary: 'done' }),
    s.emit(
      'agent.status.changed',
      { externalAgentId: agent },
      { status: 'idle', rawStatus: 'Stop' },
    ),
    s.emit('agent.completed', { externalAgentId: agent }, {}),
  ];
};

/** A main agent delegates subtasks to two subagents (worker, reviewer) that report back. */
const delegation: Scenario = (ctx) => {
  const s = session('delegation', 'sess_delegation', ctx);
  const main = 'agent_main';
  const mainTask = 'task_feature';
  const mainRefs = { externalAgentId: main, externalTaskId: mainTask };
  const subagents = [
    { id: 'agent_worker', role: 'worker', task: 'task_impl', title: 'Implement change' },
    { id: 'agent_reviewer', role: 'reviewer', task: 'task_review', title: 'Review change' },
  ];
  const events: IncomingAgentEvent[] = [
    s.emit(
      'agent.connected',
      { externalAgentId: main },
      { agentName: 'main', executionLocation: 'local' },
    ),
    s.emit('agent.status.changed', { externalAgentId: main }, { status: 'working' }),
    s.emit('task.created', mainRefs, { title: 'Deliver feature' }),
    s.emit('task.started', mainRefs, {}),
  ];
  for (const sub of subagents) {
    // Task events name both the task and the agent that owns it.
    const refs = { externalAgentId: sub.id, externalTaskId: sub.task };
    events.push(
      s.emit(
        'agent.started',
        { externalAgentId: sub.id },
        { agentName: sub.role, roleHint: sub.role, parentExternalAgentId: main },
      ),
      s.emit('task.created', refs, { title: sub.title, parentExternalTaskId: mainTask }),
      s.emit('agent.status.changed', { externalAgentId: sub.id }, { status: 'working' }),
      s.emit('task.started', refs, {}),
      ...toolCall(s, sub.id, sub.role === 'reviewer' ? 'Read' : 'Edit', `call_${sub.id}`),
      s.emit('task.completed', refs, { summary: `${sub.role} finished` }),
      s.emit('agent.completed', { externalAgentId: sub.id }, {}),
    );
  }
  events.push(
    s.emit('task.completed', mainRefs, { summary: 'feature delivered' }),
    s.emit(
      'agent.status.changed',
      { externalAgentId: main },
      { status: 'idle', rawStatus: 'Stop' },
    ),
    s.emit('agent.completed', { externalAgentId: main }, {}),
  );
  return events;
};

/** A tool fails and is retried, events are lost in transit (sequence gap), then the agent disconnects explicitly. */
const failureGap: Scenario = (ctx) => {
  const s = session('failure-gap', 'sess_failure', ctx);
  const agent = 'agent_main';
  const refs = { externalAgentId: agent, externalTaskId: 'task_flaky' };
  const events: IncomingAgentEvent[] = [
    s.emit(
      'agent.connected',
      { externalAgentId: agent },
      { agentName: 'main', executionLocation: 'local' },
    ),
    s.emit('task.created', refs, { title: 'Run flaky command' }),
    s.emit('task.started', refs, {}),
    ...toolCall(s, agent, 'Bash', 'call_1', 'failed'),
    ...toolCall(s, agent, 'Bash', 'call_2'),
  ];
  // Events lost in transit: the receiver will see a sequence jump.
  s.skip(ctx.random.int(2, 5));
  events.push(
    s.emit('agent.status.changed', { externalAgentId: agent }, { status: 'working' }),
    s.emit('task.failed', refs, { errorCode: 'RUNTIME_TIMEOUT', message: 'no response' }),
    s.emit('agent.disconnected', { externalAgentId: agent }, { reason: 'connection lost' }),
  );
  return events;
};

export const SCENARIOS = {
  'single-agent': singleAgent,
  delegation,
  'failure-gap': failureGap,
} as const satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof SCENARIOS;
export const SCENARIO_NAMES = Object.keys(SCENARIOS) as ScenarioName[];
