import { Module } from '@nestjs/common';
import { ProjectionService } from './projection.service.js';

/** Read-model projection and replay (HQ-106). Ingestion (HQ-105) applies it per event. */
@Module({
  providers: [ProjectionService],
  exports: [ProjectionService],
})
export class ProjectionModule {}
