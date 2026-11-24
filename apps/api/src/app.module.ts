import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { ApiConfig } from './config.js';
import { ConnectionsModule } from './connections/connections.module.js';
import { HealthModule } from './health/health.module.js';
import { ApiExceptionFilter } from './http/api-exception.filter.js';
import { ProjectionModule } from './projection/projection.module.js';
import { InfrastructureModule } from './infrastructure.module.js';

@Module({})
export class AppModule {
  static forConfig(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        InfrastructureModule.forConfig(config),
        HealthModule,
        ConnectionsModule.forSettings(config.connections),
        ProjectionModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
    };
  }
}
