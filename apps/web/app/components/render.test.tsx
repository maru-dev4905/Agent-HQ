import type { AgentView, EventView } from '@agent-hq/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentRoster } from './roster';
import { EventTimeline } from './timeline';

// Strings an agent could put in its name, task title or tool summary (HQ-109 AC, security T5).
const XSS = [
  '<img src=x onerror=alert(1)>',
  '<script>alert(1)</script>',
  '"><svg onload=alert(1)>',
  'javascript:alert(1)',
];

const agent = (name: string): AgentView => ({
  agentInstanceId: 'a1',
  connectionId: 'c1',
  observedStatus: 'unknown',
  reportedStatus: 'working',
  rawStatus: name,
  agentName: name,
  roleHint: name,
  parentExternalAgentId: null,
  executionLocation: null,
  lastEventType: 'tool.call.started',
  lastEventAt: '2026-11-25T00:00:00.000Z',
  lastReceivedAt: '2026-11-25T00:00:00.000Z',
  lastStoreSequence: '1',
  connectionLostAt: '2026-11-25T00:01:00.000Z',
  stale: false,
});

const event = (text: string): EventView => ({
  storeSequence: '1',
  id: 'e1',
  workspaceId: 'local',
  connectionId: 'c1',
  type: 'tool.call.started',
  schemaVersion: 1,
  occurredAt: '2026-11-25T00:00:00.000Z',
  receivedAt: '2026-11-25T00:00:00.000Z',
  idempotencyKey: 'k',
  correlationId: 'r',
  agentInstanceId: 'a1',
  source: {},
  payload: { toolName: text, summary: text },
});

describe('rendering agent content', () => {
  it('escapes agent-provided text instead of interpreting it as HTML', () => {
    for (const text of XSS) {
      const html =
        renderToStaticMarkup(
          <AgentRoster agents={[agent(text)]} tasks={[]} staleThresholdMs={60_000} now={0} />,
        ) + renderToStaticMarkup(<EventTimeline events={[event(text)]} agents={[agent(text)]} />);
      // No element or attribute came from the text: it is shown, escaped, as text.
      expect(html).not.toMatch(/<(img|script|svg)\b/i);
      expect(html).not.toMatch(/<[^>]*\son(error|load)=/i);
      expect(html).not.toContain('href="javascript:');
      expect(html).toContain(
        text
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;'),
      );
    }
  });

  it('shows a task waiting for approval as the current task', () => {
    const task = {
      taskId: 't1',
      connectionId: 'c1',
      agentInstanceId: 'a1',
      status: 'waiting_approval' as const,
      title: 'Deploy',
      parentExternalTaskId: null,
      lastEventType: 'task.started',
      lastEventAt: '2026-11-25T00:00:00.000Z',
      lastReceivedAt: '2026-11-25T00:00:00.000Z',
      lastStoreSequence: '2',
    };
    const html = renderToStaticMarkup(
      <AgentRoster agents={[agent('main')]} tasks={[task]} staleThresholdMs={60_000} now={0} />,
    );
    expect(html).toContain('승인 대기');
    expect(html).toContain('Deploy');
  });

  it('shows status with icon and text, and explains unknown', () => {
    const html = renderToStaticMarkup(
      <AgentRoster agents={[agent('main')]} tasks={[]} staleThresholdMs={60_000} now={0} />,
    );
    expect(html).toContain('알 수 없음');
    expect(html).toContain('연결이 끊긴 뒤 소식이 없음');
  });
});
