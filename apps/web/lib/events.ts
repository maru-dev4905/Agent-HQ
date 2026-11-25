import type { EventView } from '@agent-hq/contracts';

/** Payload text fields worth a one-line summary, in priority order. */
const SUMMARY_FIELDS = ['title', 'toolName', 'status', 'summary', 'message', 'reason'] as const;

/**
 * One-line, plain-text summary of an event. The result is rendered as a React text node, so
 * agent-provided content is never interpreted as HTML (HQ-109 AC, security T5).
 */
export function summarize(event: EventView): string {
  const parts: string[] = [];
  for (const field of SUMMARY_FIELDS) {
    const value = event.payload[field];
    if (typeof value === 'string' && value !== '') parts.push(value);
  }
  if (event.type === 'event.gap.detected') {
    const { fromSequence, toSequence } = event.payload as {
      fromSequence?: number;
      toSequence?: number;
    };
    if (fromSequence !== undefined && toSequence !== undefined) {
      parts.unshift(`sequence ${fromSequence}–${toSequence} 누락`);
    }
  }
  return parts.join(' · ');
}

/** Keeps the newest `limit` events, newest first, without duplicates (by storeSequence). */
export function mergeEvents(
  current: EventView[],
  incoming: EventView[],
  limit: number,
): EventView[] {
  const seen = new Set(current.map((e) => e.storeSequence));
  const added = incoming.filter((e) => !seen.has(e.storeSequence));
  if (added.length === 0) return current;
  return [...added.reverse(), ...current]
    .sort((a, b) => (BigInt(b.storeSequence) > BigInt(a.storeSequence) ? 1 : -1))
    .slice(0, limit);
}

export const isGap = (event: EventView) => event.type === 'event.gap.detected';
