import {
  createParamDecorator,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { errorBody } from '@agent-hq/contracts';
import type { ConnectionStore } from '@agent-hq/database';
import { hashSecret } from './secrets.js';
import { CLOCK, CONNECTION_STORE, type Clock, type ConnectionPrincipal } from './tokens.js';

interface RequestWithPrincipal {
  headers: Record<string, string | string[] | undefined>;
  connectionPrincipal?: ConnectionPrincipal;
}

// Auth schemes are case-insensitive (RFC 7235).
const BEARER = /^Bearer ([A-Za-z0-9_-]+)$/i;

/**
 * Authenticates a source by its connection token (security §5). The workspace and connection
 * come from the token, never from the request body. Every failure gives the same response so
 * callers cannot tell unknown, revoked and expired tokens apart.
 */
@Injectable()
export class ConnectionTokenGuard implements CanActivate {
  constructor(
    @Inject(CONNECTION_STORE) private readonly store: ConnectionStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const header = request.headers['authorization'];
    const match = typeof header === 'string' ? BEARER.exec(header) : null;
    const token = match?.[1];
    if (token === undefined) throw this.unauthorized();

    const connection = await this.store.findByTokenHash(hashSecret(token));
    const now = this.clock();
    if (connection === null || connection.revokedAt !== null || connection.tokenExpiresAt <= now) {
      throw this.unauthorized();
    }
    request.connectionPrincipal = {
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
    };
    return true;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException(
      errorBody('AUTHENTICATION_FAILED', 'Missing, invalid, revoked or expired connection token'),
    );
  }
}

/** Injects the principal set by ConnectionTokenGuard. */
export const Principal = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const principal = context.switchToHttp().getRequest<RequestWithPrincipal>().connectionPrincipal;
  if (principal === undefined) throw new Error('Principal used without ConnectionTokenGuard');
  return principal;
});
