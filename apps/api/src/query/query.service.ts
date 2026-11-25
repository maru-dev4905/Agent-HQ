import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  errorBody,
  eventsQuerySchema,
  QUERY_LIMITS,
  type AgentList,
  type ConnectionList,
  type EventPage,
  type TaskList,
} from '@agent-hq/contracts';
import {
  readProjections,
  type DatabaseClient,
  type EventStore,
  type QueryStore,
} from '@agent-hq/database';
import { DATABASE_CLIENT, EVENT_STORE } from '../tokens.js';
import type { QuerySettings } from '../config.js';
import { QUERY_CLOCK, QUERY_SETTINGS, QUERY_STORE } from './tokens.js';
import { agentView, connectionView, eventView, taskView } from './views.js';

/** Parses a validated decimal cursor; `undefined` means "from the start". */
export function toCursor(value: string | undefined): bigint {
  return value === undefined ? 0n : BigInt(value);
}

export function invalidQuery(issues: { path: (string | number | symbol)[]; message: string }[]) {
  return new BadRequestException(
    errorBody(
      'VALIDATION_FAILED',
      'Invalid query parameters',
      issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    ),
  );
}

@Injectable()
export class QueryService {
  constructor(
    @Inject(QUERY_STORE) private readonly store: QueryStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
    @Inject(QUERY_SETTINGS) private readonly settings: QuerySettings,
    @Inject(QUERY_CLOCK) private readonly clock: () => Date,
  ) {}

  /** 404 for an unknown workspace, without telling whether it ever existed. */
  async assertWorkspace(workspaceId: string): Promise<void> {
    if (!(await this.store.workspaceExists(workspaceId))) {
      throw new NotFoundException(errorBody('NOT_FOUND', 'Workspace not found'));
    }
  }

  async agents(workspaceId: string): Promise<AgentList> {
    await this.assertWorkspace(workspaceId);
    const { agents } = await readProjections(this.db, workspaceId);
    const now = this.clock();
    const { staleThresholdMs } = this.settings;
    return {
      agents: agents.map((row) => agentView(row, now, staleThresholdMs)),
      staleThresholdMs,
    };
  }

  async tasks(workspaceId: string): Promise<TaskList> {
    await this.assertWorkspace(workspaceId);
    const { tasks } = await readProjections(this.db, workspaceId);
    return { tasks: tasks.map(taskView) };
  }

  async connections(workspaceId: string): Promise<ConnectionList> {
    await this.assertWorkspace(workspaceId);
    const rows = await this.store.listConnections(workspaceId);
    return { connections: rows.map(connectionView) };
  }

  async eventPage(workspaceId: string, query: unknown): Promise<EventPage> {
    const parsed = eventsQuerySchema.safeParse(query);
    if (!parsed.success) throw invalidQuery(parsed.error.issues);
    await this.assertWorkspace(workspaceId);
    const after = toCursor(parsed.data.after);
    const page = await this.events.readFrom(
      workspaceId,
      after,
      parsed.data.limit ?? QUERY_LIMITS.defaultEventPage,
    );
    const last = page.at(-1);
    return {
      events: page.map(eventView),
      nextCursor: (last?.storeSequence ?? after).toString(),
    };
  }
}
