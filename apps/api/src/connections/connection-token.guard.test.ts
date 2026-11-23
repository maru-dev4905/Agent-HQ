import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConnectionRecord } from '@agent-hq/database';
import { describe, expect, it } from 'vitest';
import { ConnectionTokenGuard } from './connection-token.guard.js';
import { hashSecret } from './secrets.js';
import type { ConnectionPrincipal } from './tokens.js';

const now = new Date('2026-11-23T02:00:00.000Z');
const record = (overrides: Partial<ConnectionRecord> = {}): ConnectionRecord => ({
  id: 'conn_1',
  workspaceId: 'local',
  status: 'connected',
  tokenExpiresAt: new Date(now.getTime() + 60_000),
  revokedAt: null,
  lastHeartbeatAt: null,
  ...overrides,
});

function guardWith(stored: ConnectionRecord | null) {
  const store = {
    findByTokenHash: (hash: string) =>
      Promise.resolve(hash === hashSecret('good_token') ? stored : null),
  };
  return new ConnectionTokenGuard(store as never, () => now);
}

function context(authorization?: string) {
  const request: { headers: Record<string, string>; connectionPrincipal?: ConnectionPrincipal } = {
    headers: authorization === undefined ? {} : { authorization },
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

async function rejection(guard: ConnectionTokenGuard, authorization?: string) {
  const error = await guard.canActivate(context(authorization).ctx).then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(UnauthorizedException);
  return (error as UnauthorizedException).getResponse();
}

describe('ConnectionTokenGuard', () => {
  it('attaches the principal from the token for a valid token', async () => {
    const { ctx, request } = context('Bearer good_token');
    await expect(guardWith(record()).canActivate(ctx)).resolves.toBe(true);
    expect(request.connectionPrincipal).toEqual({ connectionId: 'conn_1', workspaceId: 'local' });
  });

  it('rejects missing, malformed, unknown, revoked and expired tokens with one identical response', async () => {
    const bodies = [
      await rejection(guardWith(record())),
      await rejection(guardWith(record()), 'Basic good_token'),
      await rejection(guardWith(record()), 'Bearer good token'),
      await rejection(guardWith(record()), 'Bearer unknown_token'),
      await rejection(guardWith(record({ revokedAt: now })), 'Bearer good_token'),
      await rejection(guardWith(record({ tokenExpiresAt: now })), 'Bearer good_token'),
    ];
    for (const body of bodies) {
      expect(body).toEqual(bodies[0]);
    }
    expect(bodies[0]).toMatchObject({ error: { code: 'AUTHENTICATION_FAILED' } });
  });
});
