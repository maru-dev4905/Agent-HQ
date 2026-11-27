import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  errorBody,
  INGEST_LIMITS,
  ingestRequestSchema,
  type IngestResponse,
  type IngestResult,
} from '@agent-hq/contracts';
import {
  WorkspaceBusyError,
  type EventStore,
  type EventStoreTransaction,
} from '@agent-hq/database';
import {
  parseIncomingEvent,
  type AgentEvent,
  type ContractIssue,
  type IncomingAgentEvent,
} from '@agent-hq/events';
import {
  CLOCK,
  ID_GENERATOR,
  type Clock,
  type ConnectionPrincipal,
} from '../connections/tokens.js';
import { applyToProjections, BatchProjections } from '../projection/projection.service.js';
import { HQ_ADAPTER_ID } from '../projection/projector.js';
import { EVENT_STORE } from '../tokens.js';
import type { EventRateLimiter } from './rate-limiter.js';
import { redactSecrets, redactText } from './redaction.js';
import { EVENT_RATE_LIMITER } from './tokens.js';

/** An error the source may retry after `retryAfterSeconds`; the controller sets `Retry-After`. */
export class RetryableException extends HttpException {
  constructor(
    readonly retryAfterSeconds: number,
    body: ReturnType<typeof errorBody>,
    status: HttpStatus,
  ) {
    super(body, status);
  }
}

/** The connection exceeded its event rate. */
export class RateLimitedException extends RetryableException {
  constructor(retryAfterSeconds: number) {
    super(
      retryAfterSeconds,
      errorBody('RATE_LIMITED', `Too many events; retry after ${retryAfterSeconds}s`),
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Retry delay when the workspace is busy (lock, pool or transaction time exhausted). */
const BUSY_RETRY_AFTER_SECONDS = 2;

const MAX_FIELD_NAME_LENGTH = 128;
const LONG_FIELD_NAME = '[field name too long]';
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * Paths of strings (values or keys) with unpaired UTF-16 surrogates. JSON allows them
 * (`"\ud800"`) but PostgreSQL jsonb rejects them, which would fail the whole batch with a
 * 500 that the source retries forever (ISS-002 tracks moving this into the event contract).
 */
function malformedTextPaths(value: unknown, at: string): string[] {
  const join = (key: string) => (at === '' ? key : `${at}.${key}`);
  if (typeof value === 'string') return value.isWellFormed() ? [] : [at];
  if (Array.isArray(value))
    return value.flatMap((item, i) => malformedTextPaths(item, join(String(i))));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      // A malformed key is reported at its parent, since the key itself cannot be printed.
      key.isWellFormed() ? malformedTextPaths(item, join(key)) : [at],
    );
  }
  return [];
}

interface Prepared {
  event: AgentEvent;
  ignoredFields: string[];
  redactedFields: string[];
}

const prefixed = (index: number, issues: ContractIssue[]): ContractIssue[] =>
  issues.map(({ path, message }) => ({
    path: path === '' ? `events.${index}` : `events.${index}.${path}`,
    message,
  }));

/**
 * Ingestion (HQ-105): validate → mask → map external IDs → append → project, for a whole
 * batch in one transaction. Only parsed (and masked) events are stored or logged; the raw
 * request body never is (security T8, data-governance N2).
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @Inject(EVENT_STORE) private readonly store: EventStore,
    @Inject(EVENT_RATE_LIMITER) private readonly limiter: EventRateLimiter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly newId: () => string,
  ) {}

  async ingest(principal: ConnectionPrincipal, body: unknown): Promise<IngestResponse> {
    const request = ingestRequestSchema.safeParse(body);
    if (!request.success) {
      throw new BadRequestException(
        errorBody('VALIDATION_FAILED', 'Body must be { "events": [ ...at least one event ] }'),
      );
    }
    const raw = request.data.events;
    if (raw.length > INGEST_LIMITS.maxBatchEvents) {
      throw new HttpException(
        errorBody(
          'PAYLOAD_TOO_LARGE',
          `A batch may contain at most ${INGEST_LIMITS.maxBatchEvents} events`,
        ),
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    const decision = this.limiter.take(principal.connectionId, raw.length);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);

    const prepared = this.prepare(principal, raw);
    let results: IngestResult[];
    try {
      results = await this.store.transaction(principal.workspaceId, (tx) =>
        this.appendAll(tx, principal, prepared),
      );
    } catch (error) {
      if (!(error instanceof WorkspaceBusyError)) throw error;
      // Nothing was committed (the batch is atomic): the source can safely send it again.
      throw new RetryableException(
        BUSY_RETRY_AFTER_SECONDS,
        errorBody('SERVICE_UNAVAILABLE', 'Workspace is busy; retry the same batch later'),
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    this.logSummary(principal, results);
    return { results };
  }

  /** Validates every event and reports all problems at once, by index. */
  private prepare(principal: ConnectionPrincipal, raw: unknown[]): Prepared[] {
    const invalid: ContractIssue[] = [];
    const forbidden: ContractIssue[] = [];
    // One server time per batch; ms precision like storage.
    const receivedAt = this.clock().toISOString();
    const prepared: Prepared[] = [];

    raw.forEach((input, index) => {
      if (Buffer.byteLength(JSON.stringify(input) ?? '') > INGEST_LIMITS.maxEventBytes) {
        invalid.push(
          ...prefixed(index, [
            { path: '', message: `Event exceeds ${INGEST_LIMITS.maxEventBytes} bytes` },
          ]),
        );
        return;
      }
      const malformed = malformedTextPaths(input, '');
      if (malformed.length > 0) {
        invalid.push(
          ...prefixed(
            index,
            malformed.map((path) => ({ path, message: 'Text must be valid Unicode' })),
          ),
        );
        return;
      }
      const parsed = parseIncomingEvent(input);
      if (!parsed.ok) {
        invalid.push(...prefixed(index, parsed.issues));
        return;
      }
      const mismatch = this.ownershipIssues(principal, parsed.event);
      if (mismatch.length > 0) {
        forbidden.push(...prefixed(index, mismatch));
        return;
      }
      prepared.push(this.toAgentEvent(principal, parsed.event, parsed.ignoredFields, receivedAt));
    });

    if (forbidden.length > 0) {
      throw new ForbiddenException(
        errorBody('FORBIDDEN', 'Events name another workspace or connection', [
          ...forbidden,
          ...invalid,
        ]),
      );
    }
    if (invalid.length > 0) {
      throw new BadRequestException(
        errorBody('VALIDATION_FAILED', 'One or more events are invalid; none were stored', invalid),
      );
    }
    return prepared;
  }

  /** `workspaceId` and `connectionId` are taken from the token; the body may only repeat them. */
  private ownershipIssues(
    principal: ConnectionPrincipal,
    event: IncomingAgentEvent,
  ): ContractIssue[] {
    const issues: ContractIssue[] = [];
    if (event.workspaceId !== undefined && event.workspaceId !== principal.workspaceId) {
      issues.push({ path: 'workspaceId', message: 'Does not match the authenticated connection' });
    }
    if (event.connectionId !== undefined && event.connectionId !== principal.connectionId) {
      issues.push({ path: 'connectionId', message: 'Does not match the authenticated connection' });
    }
    // `hq` marks events HQ writes itself (gap records, connection health): a source must not
    // be able to pass its events off as HQ's (HQ-108).
    if (event.source.adapterId === HQ_ADAPTER_ID) {
      issues.push({ path: 'source.adapterId', message: 'Reserved for events written by HQ' });
    }
    return issues;
  }

  private toAgentEvent(
    principal: ConnectionPrincipal,
    incoming: IncomingAgentEvent,
    ignoredFields: string[],
    receivedAt: string,
  ): Prepared {
    const { value: payload, redactedFields } = redactSecrets(incoming.payload, 'payload');
    // Safe: only payload strings changed (shape kept) and server-owned fields were added.
    const event = {
      ...incoming,
      payload,
      id: incoming.id ?? this.newId(),
      workspaceId: principal.workspaceId,
      connectionId: principal.connectionId,
      // Same form the store keeps, so the event projected live is the one replay reads back.
      occurredAt: new Date(incoming.occurredAt).toISOString(),
      receivedAt,
    } as AgentEvent;
    // Field names come from the source too: mask and bound them before echoing or logging.
    // Control characters are replaced so a key name cannot forge log lines.
    // An over-long name is replaced, not cut: a cut could split a secret past its pattern.
    const names = ignoredFields.map((name) =>
      name.length > MAX_FIELD_NAME_LENGTH
        ? LONG_FIELD_NAME
        : redactText(name).replace(CONTROL_CHARS, '?'),
    );
    return { event, ignoredFields: names, redactedFields };
  }

  private async appendAll(
    tx: EventStoreTransaction,
    principal: ConnectionPrincipal,
    prepared: Prepared[],
  ): Promise<IngestResult[]> {
    const results: IngestResult[] = [];
    const conflicts: ContractIssue[] = [];
    // Per-batch caches (HQ-113): each external ID is resolved once and each read-model row is
    // read once and written once, instead of several round trips per event.
    const ids = new Map<string, string>();
    const projections = new BatchProjections(tx.projections);
    for (const [index, { event: base, ignoredFields, redactedFields }] of prepared.entries()) {
      const event = await this.withHqIds(tx, principal, base, ids);
      const outcome = await tx.append(event);
      if (outcome.status === 'id_conflict') {
        conflicts.push({ path: `events.${index}.id`, message: 'Event id is already used' });
        continue;
      }
      if (outcome.status === 'duplicate' && outcome.conflict) {
        conflicts.push({
          path: `events.${index}.idempotencyKey`,
          message: 'Already stored with different content',
        });
        continue;
      }
      if (outcome.status === 'stored') {
        await applyToProjections(projections, { ...event, storeSequence: outcome.storeSequence });
      }
      results.push({
        idempotencyKey: event.idempotencyKey,
        status: outcome.status,
        storeSequence: outcome.storeSequence.toString(),
        ignoredFields,
        redactedFields,
      });
    }
    if (conflicts.length > 0) {
      // Throwing rolls the whole batch back: a batch is stored completely or not at all.
      throw new ConflictException(
        errorBody(
          'CONFLICT',
          'One or more events conflict with stored events; none were stored',
          conflicts,
        ),
      );
    }
    await projections.flush();
    return results;
  }

  /** Maps external IDs to HQ IDs per (workspace, connection) (ADR-0006). */
  private async withHqIds(
    tx: EventStoreTransaction,
    principal: ConnectionPrincipal,
    event: AgentEvent,
    cache: Map<string, string>,
  ): Promise<AgentEvent> {
    const { externalAgentId, externalTaskId } = event.source;
    const cached = async (key: string, resolve: () => Promise<string>) => {
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const id = await resolve();
      cache.set(key, id);
      return id;
    };
    const ref = (externalId: string) => ({
      workspaceId: principal.workspaceId,
      connectionId: principal.connectionId,
      externalId,
    });
    const agentInstanceId =
      externalAgentId === undefined
        ? undefined
        : await cached(`agent:${externalAgentId}`, () =>
            tx.resolveAgentInstance(ref(externalAgentId), this.newId),
          );
    const taskId =
      externalTaskId === undefined
        ? undefined
        : await cached(`task:${externalTaskId}`, () =>
            tx.resolveTask(ref(externalTaskId), this.newId),
          );
    return {
      ...event,
      ...(agentInstanceId === undefined ? {} : { agentInstanceId }),
      ...(taskId === undefined ? {} : { taskId }),
    };
  }

  /** Counts and field names only — never values (security: no payload in logs). */
  private logSummary(principal: ConnectionPrincipal, results: IngestResult[]): void {
    const count = (status: IngestResult['status']) =>
      results.filter((result) => result.status === status).length;
    const tally = (pick: (result: IngestResult) => string[]) => {
      const counts = new Map<string, number>();
      for (const name of results.flatMap(pick)) counts.set(name, (counts.get(name) ?? 0) + 1);
      return [...counts].map(([name, n]) => `${name}×${n}`).join(',') || '-';
    };
    this.logger.log(
      `ingested connection=${principal.connectionId} stored=${count('stored')} ` +
        `duplicate=${count('duplicate')} ignored=${tally((r) => r.ignoredFields)} ` +
        `redacted=${tally((r) => r.redactedFields)}`,
    );
  }
}
