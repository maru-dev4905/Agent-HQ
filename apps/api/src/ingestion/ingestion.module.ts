import { Module, type DynamicModule } from '@nestjs/common';
import { IngestionController } from './ingestion.controller.js';
import { IngestionService } from './ingestion.service.js';
import { EventRateLimiter, type RateLimitSettings } from './rate-limiter.js';
import { EVENT_RATE_LIMITER } from './tokens.js';

/**
 * Event ingestion (HQ-105). `connections` must be the same ConnectionsModule instance the
 * app imports, so the token guard, clock and ID generator are shared rather than duplicated.
 */
@Module({})
export class IngestionModule {
  static register(connections: DynamicModule, rate: RateLimitSettings): DynamicModule {
    return {
      module: IngestionModule,
      imports: [connections],
      controllers: [IngestionController],
      providers: [
        { provide: EVENT_RATE_LIMITER, useValue: new EventRateLimiter(rate, () => Date.now()) },
        IngestionService,
      ],
    };
  }
}
