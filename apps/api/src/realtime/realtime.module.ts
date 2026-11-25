import { Module, type DynamicModule } from '@nestjs/common';
import { createOutboxStore, type DatabaseClient } from '@agent-hq/database';
import { QueryModule } from '../query/query.module.js';
import { DATABASE_CLIENT } from '../tokens.js';
import { OutboxRelay } from './outbox-relay.js';
import { StreamController } from './stream.controller.js';
import { StreamService } from './stream.service.js';
import { OUTBOX_STORE, REALTIME_SETTINGS, type RealtimeSettings } from './tokens.js';
import { WorkspaceSignals } from './workspace-signals.js';

/** Outbox relay and SSE streams with cursor replay (HQ-107). */
@Module({})
export class RealtimeModule {
  static forSettings(settings: RealtimeSettings): DynamicModule {
    return {
      module: RealtimeModule,
      imports: [QueryModule],
      controllers: [StreamController],
      providers: [
        { provide: REALTIME_SETTINGS, useValue: settings },
        {
          provide: OUTBOX_STORE,
          useFactory: (db: DatabaseClient) => createOutboxStore(db),
          inject: [DATABASE_CLIENT],
        },
        { provide: WorkspaceSignals, useValue: new WorkspaceSignals() },
        OutboxRelay,
        StreamService,
      ],
      exports: [OutboxRelay, StreamService],
    };
  }
}
