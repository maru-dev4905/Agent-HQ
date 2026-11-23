import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  errorBody,
  registerConnectionRequestSchema,
  type HeartbeatResponse,
  type RegisterConnectionResponse,
} from '@agent-hq/contracts';
import { ConnectionTokenGuard, Principal } from './connection-token.guard.js';
import { ConnectionsService } from './connections.service.js';
import type { ConnectionPrincipal } from './tokens.js';

@Controller('connections')
export class ConnectionsController {
  constructor(@Inject(ConnectionsService) private readonly connections: ConnectionsService) {}

  /** Registers a source with a one-time code. The token is returned once and never again. */
  @Post()
  @HttpCode(201)
  // The response carries a one-time token: never cache it anywhere.
  @Header('Cache-Control', 'no-store')
  register(@Body() body: unknown): Promise<RegisterConnectionResponse> {
    const parsed = registerConnectionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        errorBody(
          'VALIDATION_FAILED',
          'Invalid registration request',
          parsed.error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        ),
      );
    }
    return this.connections.register(parsed.data);
  }

  @Post(':id/heartbeat')
  @HttpCode(200)
  @UseGuards(ConnectionTokenGuard)
  heartbeat(
    @Principal() principal: ConnectionPrincipal,
    @Param('id') id: string,
  ): Promise<HeartbeatResponse> {
    return this.connections.heartbeat(principal, id);
  }
}
