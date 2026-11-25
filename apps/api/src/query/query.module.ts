import { Module } from '@nestjs/common';
import { createQueryStore, type DatabaseClient } from '@agent-hq/database';
import { DATABASE_CLIENT } from '../tokens.js';
import { QueryController } from './query.controller.js';
import { QueryService } from './query.service.js';
import { QUERY_STORE } from './tokens.js';

/** Read models, connections and the event log by cursor (HQ-107). */
@Module({
  controllers: [QueryController],
  providers: [
    {
      provide: QUERY_STORE,
      useFactory: (db: DatabaseClient) => createQueryStore(db),
      inject: [DATABASE_CLIENT],
    },
    QueryService,
  ],
  exports: [QueryService, QUERY_STORE],
})
export class QueryModule {}
