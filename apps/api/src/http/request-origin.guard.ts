import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { errorBody } from '@agent-hq/contracts';
import { hostName, type HttpSettings } from '../config.js';
import { HTTP_SETTINGS } from '../tokens.js';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Rejects requests a local browser could be tricked into sending (security T3):
 * - an unknown Host (or X-Forwarded-Host, behind a proxy) means DNS rebinding (an
 *   attacker domain resolving to 127.0.0.1);
 * - an Origin header that is not allowlisted means a cross-site page. Sources (adapters,
 *   the simulator) are not browsers and send no Origin.
 * Runs as a global guard, before authentication.
 */
@Injectable()
export class RequestOriginGuard implements CanActivate {
  private readonly hosts: ReadonlySet<string>;
  private readonly origins: ReadonlySet<string>;

  constructor(@Inject(HTTP_SETTINGS) settings: HttpSettings) {
    this.hosts = new Set(settings.allowedHosts);
    this.origins = new Set(settings.allowedOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const { headers } = context.switchToHttp().getRequest<RequestLike>();
    const host = headers['host'];
    if (typeof host !== 'string' || !this.hosts.has(hostName(host))) {
      throw new ForbiddenException(errorBody('FORBIDDEN', 'Host is not allowed'));
    }
    // A proxy in front (the dashboard's Next.js rewrite) replaces Host with the API address
    // and passes the browser's Host on as X-Forwarded-Host: check that one too, or DNS
    // rebinding against the web server would reach the API (PR #8 review). A client that
    // sets the header itself can only get itself rejected.
    const forwarded = headers['x-forwarded-host'];
    if (forwarded !== undefined) {
      const values = typeof forwarded === 'string' ? forwarded.split(',') : [];
      if (values.length === 0 || !values.every((value) => this.hosts.has(hostName(value)))) {
        throw new ForbiddenException(errorBody('FORBIDDEN', 'Host is not allowed'));
      }
    }
    const origin = headers['origin'];
    if (origin !== undefined && (typeof origin !== 'string' || !this.origins.has(origin))) {
      throw new ForbiddenException(errorBody('FORBIDDEN', 'Origin is not allowed'));
    }
    return true;
  }
}
