import { Controller, Get, Headers, Inject, Param, Query, Res } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { QUERY_PATHS } from '@agent-hq/contracts';
import { StreamService } from './stream.service.js';

interface HijackableReply {
  hijack(): void;
  raw: ServerResponse;
}

/** Server-Sent Events stream of a workspace's events (HQ-107, contract `STREAM_EVENT_NAME`). */
@Controller()
export class StreamController {
  constructor(@Inject(StreamService) private readonly streams: StreamService) {}

  @Get(QUERY_PATHS.stream)
  async stream(
    @Param('workspaceId') workspaceId: string,
    @Query() query: unknown,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Res() reply: HijackableReply,
  ): Promise<void> {
    // Validation errors are thrown before hijacking, so they get the normal error envelope.
    const cursor = await this.streams.open(workspaceId, query, lastEventId);
    try {
      reply.hijack();
    } catch (error) {
      this.streams.release();
      throw error;
    }
    this.streams.start(workspaceId, cursor, reply.raw);
  }
}
