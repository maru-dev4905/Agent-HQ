import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import {
  QUERY_PATHS,
  type AgentList,
  type ConnectionList,
  type EventPage,
  type TaskList,
} from '@agent-hq/contracts';
import { QueryService } from './query.service.js';

/** Read-only Query API (HQ-107). Contract: `@agent-hq/contracts` query, architecture N7. */
@Controller()
export class QueryController {
  constructor(@Inject(QueryService) private readonly query: QueryService) {}

  @Get(QUERY_PATHS.agents)
  @Header('Cache-Control', 'no-store')
  agents(@Param('workspaceId') workspaceId: string): Promise<AgentList> {
    return this.query.agents(workspaceId);
  }

  @Get(QUERY_PATHS.tasks)
  @Header('Cache-Control', 'no-store')
  tasks(@Param('workspaceId') workspaceId: string): Promise<TaskList> {
    return this.query.tasks(workspaceId);
  }

  @Get(QUERY_PATHS.connections)
  @Header('Cache-Control', 'no-store')
  connections(@Param('workspaceId') workspaceId: string): Promise<ConnectionList> {
    return this.query.connections(workspaceId);
  }

  @Get(QUERY_PATHS.events)
  @Header('Cache-Control', 'no-store')
  events(@Param('workspaceId') workspaceId: string, @Query() query: unknown): Promise<EventPage> {
    return this.query.eventPage(workspaceId, query);
  }
}
