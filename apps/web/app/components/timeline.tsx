import type { AgentView, EventView } from '@agent-hq/contracts';
import { isGap, summarize } from '../../lib/events';

export function EventTimeline(props: { events: EventView[]; agents: AgentView[] }) {
  if (props.events.length === 0) return <p className="empty">아직 받은 Event가 없습니다.</p>;
  const names = new Map(props.agents.map((a) => [a.agentInstanceId, a.agentName]));
  return (
    <ol className="timeline">
      {props.events.map((event) => (
        <li key={event.storeSequence} className={isGap(event) ? 'gap' : undefined}>
          <time dateTime={event.occurredAt}>
            {new Date(event.occurredAt).toLocaleTimeString('ko-KR')}
          </time>
          <span className="type">
            {isGap(event) && <span aria-hidden="true">⚠ </span>}
            {event.type}
          </span>
          <span className="agent">
            {event.agentInstanceId === undefined
              ? ''
              : (names.get(event.agentInstanceId) ?? event.agentInstanceId)}
          </span>
          <span className="summary">{summarize(event)}</span>
        </li>
      ))}
    </ol>
  );
}
