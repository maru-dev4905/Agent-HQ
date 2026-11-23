import type { EventPayload, EventType, IncomingAgentEvent } from '@agent-hq/events';
import type { SimClock } from './clock.js';
import type { Random } from './random.js';

export interface SessionRefs {
  externalAgentId?: string;
  externalTaskId?: string;
}

/**
 * Emits events for one simulated runtime session: owns the per-session `sequence` and
 * derives deterministic idempotency keys (`sim:<scenario>:<session>:<sequence>`).
 */
export class SimSession {
  private sequence = 0;

  constructor(
    private readonly scenario: string,
    readonly externalSessionId: string,
    private readonly correlationId: string,
    private readonly clock: SimClock,
    private readonly random: Random,
  ) {}

  /** Advances the clock by a small random step and emits one event. */
  emit<T extends EventType>(
    type: T,
    refs: SessionRefs,
    payload: EventPayload<T>,
  ): IncomingAgentEvent {
    return this.event(type, this.tick(), refs, payload);
  }

  /**
   * Like `emit`, but the payload may depend on the event's own timestamp (for example a
   * duration measured from an earlier event).
   */
  emitAt<T extends EventType>(
    build: (occurredAt: string) => { type: T; refs: SessionRefs; payload: EventPayload<T> },
  ): IncomingAgentEvent {
    const occurredAt = this.tick();
    const { type, refs, payload } = build(occurredAt);
    return this.event(type, occurredAt, refs, payload);
  }

  /** Skips sequence numbers to simulate events lost in transit (gap scenarios). */
  skip(count: number): void {
    this.sequence += count;
  }

  private tick(): string {
    return this.clock.advance(this.random.int(50, 1500));
  }

  private event<T extends EventType>(
    type: T,
    occurredAt: string,
    refs: SessionRefs,
    payload: EventPayload<T>,
  ): IncomingAgentEvent {
    this.sequence += 1;
    // The cast is checked at runtime: generate() validates every event against the contract.
    return {
      schemaVersion: 1,
      type,
      occurredAt,
      timestampQuality: 'source',
      source: {
        adapterId: 'simulator',
        runtime: 'simulator',
        externalSessionId: this.externalSessionId,
        ...refs,
      },
      correlationId: this.correlationId,
      idempotencyKey: `sim:${this.scenario}:${this.externalSessionId}:${this.sequence}`,
      sequence: this.sequence,
      payload,
    } as IncomingAgentEvent;
  }
}
