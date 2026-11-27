import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { errorBody, errorEnvelopeSchema, type ApiErrorCode } from '@agent-hq/contracts';
import { busyReason } from '@agent-hq/database';

interface ReplyLike {
  status(code: number): ReplyLike;
  header(name: string, value: string): ReplyLike;
  send(body: unknown): void;
}

/** Retry delay for 503 answers caused by a busy database (pool, lock, transaction time). */
const BUSY_RETRY_AFTER_SECONDS = '2';

const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'AUTHENTICATION_FAILED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/**
 * Fixed messages for errors that do not already carry an envelope. Framework messages are
 * never passed through: e.g. Nest's 404 text echoes the request URL, query string included.
 */
const MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: 'Invalid request',
  AUTHENTICATION_FAILED: 'Authentication failed',
  REGISTRATION_CODE_INVALID: 'Registration code is unknown, used or expired',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not found',
  METHOD_NOT_ALLOWED: 'Method not allowed',
  CONFLICT: 'Conflict',
  PAYLOAD_TOO_LARGE: 'Payload too large',
  RATE_LIMITED: 'Too many requests',
  REQUEST_REJECTED: 'Request rejected',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
  INTERNAL_ERROR: 'Internal server error',
};

function codeFor(status: number): ApiErrorCode {
  return CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED');
}

/**
 * Makes every error response follow the contract envelope `{ error: { code, message } }`,
 * including framework errors (malformed JSON, unknown routes) and unexpected failures.
 * Unexpected errors never expose internals: the client gets a generic 500, details go to logs.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (errorEnvelopeSchema.safeParse(response).success) {
        reply.status(status).send(response);
        return;
      }
      const code = codeFor(status);
      reply.status(status).send(errorBody(code, MESSAGE_BY_CODE[code]));
      return;
    }

    const status = statusOf(exception);
    if (status !== undefined && status >= 400 && status < 500) {
      // Fastify client errors (e.g. malformed JSON body, oversized payload).
      const code = codeFor(status);
      reply.status(status).send(errorBody(code, MESSAGE_BY_CODE[code]));
      return;
    }

    // The database is busy (e.g. every pool connection in use while the token guard runs):
    // a temporary condition the client may retry — a 503, not an internal error (HQ-113).
    // Whether a retry is idempotent depends on the route (ingestion batches are; N6/N7).
    if (busyReason(exception) !== null) {
      this.logger.warn(
        `database busy: ${exception instanceof Error ? exception.message : String(exception)}`,
      );
      reply
        .header('Retry-After', BUSY_RETRY_AFTER_SECONDS)
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .send(errorBody('SERVICE_UNAVAILABLE', MESSAGE_BY_CODE.SERVICE_UNAVAILABLE));
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    reply
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send(errorBody('INTERNAL_ERROR', MESSAGE_BY_CODE.INTERNAL_ERROR));
  }
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === 'number' ? value : undefined;
}
