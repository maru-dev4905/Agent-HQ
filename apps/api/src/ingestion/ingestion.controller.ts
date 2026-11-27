import { Body, Controller, HttpCode, Inject, Post, Res, UseGuards } from '@nestjs/common';
import { INGEST_PATH, type IngestResponse } from '@agent-hq/contracts';
import { ConnectionTokenGuard, Principal } from '../connections/connection-token.guard.js';
import type { ConnectionPrincipal } from '../connections/tokens.js';
import { IngestionService, RetryableException } from './ingestion.service.js';

interface ReplyLike {
  header(name: string, value: string): unknown;
}

@Controller()
export class IngestionController {
  constructor(@Inject(IngestionService) private readonly ingestion: IngestionService) {}

  /** Stores a batch of events from an authenticated source (contract: `@agent-hq/contracts`). */
  @Post(INGEST_PATH)
  @HttpCode(200)
  @UseGuards(ConnectionTokenGuard)
  async ingest(
    @Principal() principal: ConnectionPrincipal,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: ReplyLike,
  ): Promise<IngestResponse> {
    try {
      return await this.ingestion.ingest(principal, body);
    } catch (error) {
      if (error instanceof RetryableException) {
        reply.header('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }
}
