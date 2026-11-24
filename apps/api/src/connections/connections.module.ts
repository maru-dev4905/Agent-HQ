import { randomUUID } from 'node:crypto';
import { Module, type DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { createConnectionStore, type DatabaseClient } from '@agent-hq/database';
import { DATABASE_CLIENT } from '../tokens.js';
import {
  ConnectionHealthProcessor,
  CONNECTION_HEALTH_QUEUE,
} from './connection-health.processor.js';
import { ConnectionHealthService } from './connection-health.service.js';
import { ConnectionTokenGuard } from './connection-token.guard.js';
import { ConnectionsController } from './connections.controller.js';
import { ConnectionsService } from './connections.service.js';
import {
  CLOCK,
  CONNECTION_SETTINGS,
  CONNECTION_STORE,
  ID_GENERATOR,
  type ConnectionSettings,
} from './tokens.js';

/**
 * Connection registration, token authentication and health tracking (HQ-103). The EventStore
 * comes from the global InfrastructureModule.
 */
@Module({})
export class ConnectionsModule {
  static forSettings(settings: ConnectionSettings): DynamicModule {
    return {
      module: ConnectionsModule,
      imports: [BullModule.registerQueue({ name: CONNECTION_HEALTH_QUEUE })],
      controllers: [ConnectionsController],
      providers: [
        { provide: CONNECTION_SETTINGS, useValue: settings },
        { provide: CLOCK, useValue: () => new Date() },
        { provide: ID_GENERATOR, useValue: () => randomUUID() },
        {
          provide: CONNECTION_STORE,
          useFactory: (db: DatabaseClient) => createConnectionStore(db),
          inject: [DATABASE_CLIENT],
        },
        ConnectionsService,
        ConnectionHealthService,
        ConnectionHealthProcessor,
        ConnectionTokenGuard,
      ],
      // HQ-105 (ingestion) reuses the guard and its dependencies.
      exports: [ConnectionTokenGuard, CONNECTION_STORE, CLOCK, ID_GENERATOR],
    };
  }
}
