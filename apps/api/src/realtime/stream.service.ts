import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { errorBody, storeCursorSchema, streamQuerySchema } from '@agent-hq/contracts';
import type { EventStore, QueryStore } from '@agent-hq/database';
import { invalidQuery, QueryService, toCursor } from '../query/query.service.js';
import { QUERY_STORE } from '../query/tokens.js';
import { EVENT_STORE } from '../tokens.js';
import { StreamSession } from './stream-session.js';
import { REALTIME_SETTINGS, type RealtimeSettings } from './tokens.js';
import { WorkspaceSignals } from './workspace-signals.js';

@Injectable()
export class StreamService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(StreamService.name);
  private readonly sessions = new Set<StreamSession>();
  /** Slots taken by requests between validation and `start`, so the cap cannot be overrun. */
  private reserved = 0;

  constructor(
    @Inject(QueryService) private readonly query: QueryService,
    @Inject(QUERY_STORE) private readonly store: QueryStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(WorkspaceSignals) private readonly signals: WorkspaceSignals,
    @Inject(REALTIME_SETTINGS) private readonly settings: RealtimeSettings,
  ) {}

  get activeStreams(): number {
    return this.sessions.size + this.reserved;
  }

  /**
   * Validates the request and resolves the start cursor. `Last-Event-ID` wins over `?after`
   * because a browser reconnect repeats the original URL. No cursor: start at the head.
   */
  async open(
    workspaceId: string,
    query: unknown,
    lastEventId: string | string[] | undefined,
  ): Promise<bigint> {
    const parsed = streamQuerySchema.safeParse(query);
    if (!parsed.success) throw invalidQuery(parsed.error.issues);
    if (
      lastEventId !== undefined &&
      (typeof lastEventId !== 'string' || !storeCursorSchema.safeParse(lastEventId).success)
    ) {
      throw new BadRequestException(
        errorBody('VALIDATION_FAILED', 'Last-Event-ID must be a storeSequence'),
      );
    }
    // Reserve synchronously, before any await, so concurrent requests cannot all pass.
    if (this.activeStreams >= this.settings.maxStreams) {
      throw new HttpException(
        errorBody('RATE_LIMITED', 'Too many open streams'),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.reserved += 1;
    try {
      await this.query.assertWorkspace(workspaceId);
      const head = await this.store.headSequence(workspaceId);
      const requested =
        lastEventId !== undefined
          ? BigInt(lastEventId)
          : parsed.data.after !== undefined
            ? toCursor(parsed.data.after)
            : head;
      if (requested > head) {
        // E.g. the database was reset: waiting would look like "no activity" (product rule).
        throw new ConflictException(
          errorBody('CONFLICT', 'Cursor is ahead of the event log; reload and reconnect'),
        );
      }
      return requested;
    } catch (error) {
      this.reserved -= 1;
      throw error;
    }
  }

  /** Returns the slot of an accepted request that could not be started. */
  release(): void {
    this.reserved -= 1;
  }

  /** Starts a stream for a request that `open` accepted (consumes its reservation). */
  start(workspaceId: string, cursor: bigint, response: ServerResponse): void {
    const session = new StreamSession(
      workspaceId,
      cursor,
      response,
      {
        events: this.events,
        signals: this.signals,
        settings: this.settings,
        onError: (error) =>
          this.logger.warn(
            `stream of workspace ${workspaceId} closed: ${error instanceof Error ? error.message : String(error)}`,
          ),
      },
      (closed) => this.sessions.delete(closed),
    );
    this.reserved -= 1;
    this.sessions.add(session);
    session.start();
  }

  /** Open streams would otherwise keep the HTTP server from closing. */
  beforeApplicationShutdown(): void {
    for (const session of [...this.sessions]) session.close();
  }
}
