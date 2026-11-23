import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ConnectionsService } from './connections.service.js';
import { fakeConnectionStore } from './fakes.test-helpers.js';
import { hashSecret } from './secrets.js';
import type { ConnectionSettings } from './tokens.js';

const now = new Date('2026-11-23T02:00:00.000Z');
const settings: ConnectionSettings = {
  tokenTtlMs: 86_400_000,
  thresholds: { degradedAfterMs: 30_000, disconnectedAfterMs: 90_000 },
  healthCheckIntervalMs: 0,
};

function service() {
  const fake = fakeConnectionStore();
  const health = {
    refresh: () => Promise.resolve({ status: 'connected' as const, changed: true }),
  };
  let n = 0;
  const svc = new ConnectionsService(
    fake.store,
    health as never,
    settings,
    () => now,
    () => `conn_${(n += 1)}`,
  );
  return { svc, fake };
}

describe('ConnectionsService', () => {
  it('registers with a valid code and returns a token that is stored only as a hash', async () => {
    const { svc, fake } = service();
    await fake.store.createRegistrationCode({
      id: 'c',
      workspaceId: 'local',
      codeHash: hashSecret('code'),
      expiresAt: new Date(now.getTime() + 1000),
    });
    const response = await svc.register({
      registrationCode: 'code',
      adapterId: 'simulator',
      runtime: 'simulator',
    });
    expect(response).toMatchObject({
      connectionId: 'conn_1',
      workspaceId: 'local',
      tokenExpiresAt: '2026-11-24T02:00:00.000Z',
    });
    expect(response.token).toMatch(/^ahq_ct_/);
    expect([...fake.byHash.keys()]).toEqual([hashSecret(response.token)]);
  });

  it('rejects an unknown or reused registration code', async () => {
    const { svc } = service();
    const error = await svc
      .register({ registrationCode: 'nope', adapterId: 'a', runtime: 'r' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({
      error: { code: 'REGISTRATION_CODE_INVALID' },
    });
  });

  it('refuses a heartbeat for a connection other than the caller', async () => {
    const { svc } = service();
    await expect(
      svc.heartbeat({ connectionId: 'conn_1', workspaceId: 'local' }, 'conn_2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
