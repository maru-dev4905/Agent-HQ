import { Module, type DynamicModule } from '@nestjs/common';
import type { ApiConfig } from './config.js';
import { HealthModule } from './health/health.module.js';
import { InfrastructureModule } from './infrastructure.module.js';

@Module({})
export class AppModule {
  static forConfig(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [InfrastructureModule.forConfig(config), HealthModule],
    };
  }
}
