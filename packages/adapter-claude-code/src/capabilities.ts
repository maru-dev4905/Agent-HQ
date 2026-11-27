/**
 * What the Claude Code adapter can observe and control (adapter-spec §4). Observation only:
 * no control is offered, and features hooks cannot report are declared unsupported rather
 * than left out. The transport and stored form are decided in HQ-208.
 */
export const CLAUDE_CODE_CAPABILITIES = {
  modes: { attached: true, managed: false },
  events: [
    'agent.connected',
    'agent.disconnected',
    'agent.started',
    'agent.status.changed',
    'agent.completed',
    'agent.failed',
    'tool.call.started',
    'tool.call.completed',
    'tool.call.failed',
    'event.gap.detected',
  ],
  controls: { pause: 'unsupported', resume: 'unsupported', cancel: 'unsupported' },
  features: {
    subagents: true,
    toolEvents: true,
    messageEvents: false,
    tokenUsage: false,
    artifacts: false,
    replay: false,
    reconciliation: false,
  },
} as const;
