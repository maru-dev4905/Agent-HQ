import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';
import { HealthService, type HealthReport } from './health.service.js';

async function controllerReturning(report: HealthReport): Promise<HealthController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: HealthService, useValue: { check: () => Promise.resolve(report) } }],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('returns the report when every dependency is up', async () => {
    const report: HealthReport = { status: 'ok', dependencies: { database: 'up', redis: 'up' } };
    await expect((await controllerReturning(report)).check()).resolves.toEqual(report);
  });

  it('responds 503 with the report body when degraded', async () => {
    const report: HealthReport = {
      status: 'degraded',
      dependencies: { database: 'up', redis: 'down' },
    };
    const error = await (await controllerReturning(report)).check().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual(report);
  });
});
