import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  errorBody,
  type HeartbeatResponse,
  type RegisterConnectionRequest,
  type RegisterConnectionResponse,
} from '@agent-hq/contracts';
import type { ConnectionStore } from '@agent-hq/database';
import { ConnectionHealthService } from './connection-health.service.js';
import { generateSecret, hashSecret, TOKEN_PREFIX } from './secrets.js';
import {
  CLOCK,
  CONNECTION_SETTINGS,
  CONNECTION_STORE,
  ID_GENERATOR,
  type Clock,
  type ConnectionPrincipal,
  type ConnectionSettings,
  type IdGenerator,
} from './tokens.js';

@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(CONNECTION_STORE) private readonly store: ConnectionStore,
    @Inject(ConnectionHealthService) private readonly health: ConnectionHealthService,
    @Inject(CONNECTION_SETTINGS) private readonly settings: ConnectionSettings,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly newId: IdGenerator,
  ) {}

  async register(request: RegisterConnectionRequest): Promise<RegisterConnectionResponse> {
    const now = this.clock();
    const token = generateSecret(TOKEN_PREFIX);
    const tokenExpiresAt = new Date(now.getTime() + this.settings.tokenTtlMs);
    const connectionId = this.newId();
    const result = await this.store.register({
      codeHash: hashSecret(request.registrationCode),
      now,
      connection: {
        id: connectionId,
        adapterId: request.adapterId,
        runtime: request.runtime,
        ...(request.displayName === undefined ? {} : { displayName: request.displayName }),
        tokenHash: hashSecret(token),
        tokenExpiresAt,
      },
    });
    if (result === null) {
      throw new UnauthorizedException(
        errorBody('REGISTRATION_CODE_INVALID', 'Registration code is unknown, used or expired'),
      );
    }
    return {
      connectionId,
      workspaceId: result.workspaceId,
      token,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
    };
  }

  /** Records a heartbeat and immediately applies the resulting status (e.g. pending → connected). */
  async heartbeat(
    principal: ConnectionPrincipal,
    connectionId: string,
  ): Promise<HeartbeatResponse> {
    if (principal.connectionId !== connectionId) {
      // Do not reveal whether another connection with this ID exists.
      throw new NotFoundException(errorBody('NOT_FOUND', 'Connection not found'));
    }
    const now = this.clock();
    const record = await this.store.recordHeartbeat(connectionId, now);
    await this.health.refresh(record, now);
    // Answer with what is stored, not what was computed: a concurrent revocation or
    // evaluation may have won the compare-and-set.
    const stored = (await this.store.findById(connectionId)) ?? record;
    return {
      connectionId,
      status: stored.status,
      lastHeartbeatAt: (stored.lastHeartbeatAt ?? now).toISOString(),
    };
  }
}
