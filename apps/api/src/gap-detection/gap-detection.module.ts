import { randomUUID } from 'node:crypto';
import { Module, type DynamicModule } from '@nestjs/common';
import { createGapStore, type DatabaseClient } from '@agent-hq/database';
import { DATABASE_CLIENT } from '../tokens.js';
import { GapDetectionService } from './gap-detection.service.js';
import { GAP_ID_GENERATOR, GAP_SETTINGS, GAP_STORE, type GapSettings } from './tokens.js';

/** Sequence gap detection (HQ-108). */
@Module({})
export class GapDetectionModule {
  static forSettings(settings: GapSettings): DynamicModule {
    return {
      module: GapDetectionModule,
      providers: [
        { provide: GAP_SETTINGS, useValue: settings },
        // Injected so tests can make gap records fully reproducible (coding-standards §1.4).
        { provide: GAP_ID_GENERATOR, useValue: () => randomUUID() },
        {
          provide: GAP_STORE,
          useFactory: (db: DatabaseClient) => createGapStore(db),
          inject: [DATABASE_CLIENT],
        },
        GapDetectionService,
      ],
      exports: [GapDetectionService],
    };
  }
}
