import { describe, expect, it } from 'vitest';
import { busyReason, WorkspaceBusyError } from './event-store.js';

describe('busyReason (HQ-113)', () => {
  it('recognises lock, pool and transaction time-outs, including nested causes', () => {
    expect(busyReason(new Error('canceling statement due to lock timeout'))).toBe('lock');
    expect(busyReason({ code: 'P2010', meta: { code: '55P03' } })).toBe('lock');
    expect(busyReason({ code: 'P2024', message: 'Timed out fetching a new connection' })).toBe(
      'pool',
    );
    expect(busyReason({ message: 'Unable to start a transaction in the given time.' })).toBe(
      'pool',
    );
    expect(busyReason({ code: 'P2028', message: 'Transaction already closed' })).toBe('timeout');
    expect(
      busyReason({
        message: 'wrapper',
        cause: { message: 'canceling statement due to lock timeout' },
      }),
    ).toBe('lock');
    expect(busyReason(new WorkspaceBusyError('pool'))).toBe('pool');
  });

  it('leaves every other error alone, including payload text that merely mentions timeouts', () => {
    for (const error of [
      new Error('duplicate key value'),
      { code: 'P2002' },
      'boom',
      null,
      // e.g. a validation error echoing a user-provided value
      new Error('Invalid value "lock timeout transaction timeout P2024" for field x'),
      { code: 'P2010', message: 'raw query failed', meta: { code: '23505' } },
    ]) {
      expect(busyReason(error)).toBeNull();
    }
  });

  it('never throws on cyclic or BigInt-bearing errors', () => {
    const cyclic: { message: string; cause?: unknown; meta?: unknown } = {
      message: 'x',
      meta: { n: 1n },
    };
    cyclic.cause = cyclic;
    expect(busyReason(cyclic)).toBeNull();
  });
});
