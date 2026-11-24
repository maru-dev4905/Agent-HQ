import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { ApiConfig } from './config.js';
import { ConnectionsModule } from './connections/connections.module.js';
import { HealthModule } from './health/health.module.js';
import { ApiExceptionFilter } from './http/api-exception.filter.js';
import { RequestOriginGuard } from './http/request-origin.guard.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { ProjectionModule } from './projection/projection.module.js';
import { InfrastructureModule } from './infrastructure.module.js';
import { HTTP_SETTINGS } from './tokens.js';

@Module({})
export class AppModule {
  static forConfig(config: ApiConfig): DynamicModule {
    const connections = ConnectionsModule.forSettings(config.connections);
    return {
      module: AppModule,
      imports: [
        InfrastructureModule.forConfig(config),
        HealthModule,
        connections,
        ProjectionModule,
        IngestionModule.register(connections, config.ingestion),
      ],
      providers: [
        { provide: HTTP_SETTINGS, useValue: config.http },
        // Global and first: Host/Origin are checked before any authentication (security T3).
        { provide: APP_GUARD, useClass: RequestOriginGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    };
  }
}
