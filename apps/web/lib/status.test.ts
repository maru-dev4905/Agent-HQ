import { describe, expect, it } from 'vitest';
import { agentLook, connectionLook, isStale, taskLook, unknownReason } from './status';

const AGENT = ['connected', 'working', 'waiting', 'idle', 'failed', 'disconnected', 'unknown'];
const TASK = ['queued', 'running', 'succeeded', 'failed', 'unknown'];
const CONNECTION = ['pending', 'connected', 'degraded', 'disconnected', 'error'];

describe('status looks', () => {
  it('give every status an icon and a distinct text label, not just a colour', () => {
    for (const [look, statuses] of [
      [agentLook, AGENT],
      [taskLook, TASK],
      [connectionLook, CONNECTION],
    ] as const) {
      const looks = statuses.map((s) => look(s));
      for (const l of looks) {
        expect(l.icon).not.toBe('');
        expect(l.label).not.toBe('');
      }
      expect(new Set(looks.map((l) => l.label)).size).toBe(statuses.length);
    }
  });

  it('shows an unexpected status as its own text instead of guessing', () => {
    expect(agentLook('reviewing')).toEqual({ icon: '?', label: 'reviewing', tone: 'unknown' });
  });
});

describe('isStale and unknownReason', () => {
  it('compares server receive time with the threshold', () => {
    const at = '2026-11-25T00:00:00.000Z';
    expect(isStale(at, 60_000, Date.parse(at) + 60_000)).toBe(false);
    expect(isStale(at, 60_000, Date.parse(at) + 60_001)).toBe(true);
  });

  it('explains why an agent is unknown', () => {
    const base = { lastEventType: 'agent.started', connectionLostAt: null, rawStatus: null };
    const lost = '2026-11-25T00:00:00.000Z';
    const reason = (fields: Partial<Parameters<typeof unknownReason>[0]>) =>
      unknownReason({ ...base, observedStatus: 'unknown', reportedStatus: 'unknown', ...fields });
    expect(reason({ observedStatus: 'working', reportedStatus: 'working' })).toBeNull();
    expect(reason({ reportedStatus: 'idle', connectionLostAt: lost })).toMatch(/연결/);
    expect(reason({ lastEventType: 'event.gap.detected' })).toMatch(/누락/);
    expect(reason({ rawStatus: 'thinking' })).toBe('알 수 없는 원본 상태: thinking');
    expect(reason({})).toMatch(/아직/);
  });
});
