import { describe, expect, it } from 'vitest';
import { evaluateConnectionHealth } from './connection-health.js';

const now = new Date('2026-11-23T00:10:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const thresholds = { degradedAfterMs: 30_000, disconnectedAfterMs: 90_000 };

describe('evaluateConnectionHealth', () => {
  it.each([
    [ago(0), 'connected'],
    [ago(29_999), 'connected'],
    [ago(30_000), 'degraded'],
    [ago(89_999), 'degraded'],
    [ago(90_000), 'disconnected'],
  ] as const)('heartbeat %s ago → %s', (lastHeartbeatAt, expected) => {
    expect(evaluateConnectionHealth({ lastHeartbeatAt, revoked: false, now }, thresholds)).toBe(
      expected,
    );
  });

  it('stays pending until the first heartbeat (silence is not health)', () => {
    expect(
      evaluateConnectionHealth({ lastHeartbeatAt: null, revoked: false, now }, thresholds),
    ).toBe('pending');
  });

  it('is disconnected once revoked, whatever the heartbeat', () => {
    expect(
      evaluateConnectionHealth({ lastHeartbeatAt: ago(0), revoked: true, now }, thresholds),
    ).toBe('disconnected');
  });

  it('rejects inconsistent thresholds', () => {
    expect(() =>
      evaluateConnectionHealth(
        { lastHeartbeatAt: null, revoked: false, now },
        { degradedAfterMs: 10, disconnectedAfterMs: 10 },
      ),
    ).toThrow(RangeError);
  });
});
