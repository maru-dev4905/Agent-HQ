import { describe, expect, it } from 'vitest';
import { AGENT_OBSERVED_STATUSES, isAgentObservedStatus } from './agent-status.js';

describe('isAgentObservedStatus', () => {
  it('accepts every normalized status', () => {
    for (const status of AGENT_OBSERVED_STATUSES) {
      expect(isAgentObservedStatus(status)).toBe(true);
    }
  });

  it('rejects UI-only labels and non-strings', () => {
    expect(isAgentObservedStatus('reviewing')).toBe(false);
    expect(isAgentObservedStatus('stale')).toBe(false);
    expect(isAgentObservedStatus(undefined)).toBe(false);
    expect(isAgentObservedStatus(1)).toBe(false);
  });
});
