import type { AgentView, TaskView } from '@agent-hq/contracts';
import { agentLook, isStale, STALE_LOOK, taskLook, unknownReason } from '../../lib/status';
import { StatusBadge } from './status-badge';

const time = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR');

export function AgentRoster(props: {
  agents: AgentView[];
  tasks: TaskView[];
  staleThresholdMs: number;
  now: number;
}) {
  if (props.agents.length === 0) {
    return <p className="empty">아직 관찰된 Agent가 없습니다.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Agent</th>
          <th>상태</th>
          <th>현재 Task</th>
          <th>마지막 수신</th>
        </tr>
      </thead>
      <tbody>
        {props.agents.map((agent) => {
          const reason = unknownReason(agent);
          const stale = isStale(agent.lastReceivedAt, props.staleThresholdMs, props.now);
          const task = props.tasks.find(
            (t) => t.agentInstanceId === agent.agentInstanceId && t.status === 'running',
          );
          return (
            <tr key={agent.agentInstanceId}>
              <td>
                <div className="name">{agent.agentName ?? agent.agentInstanceId}</div>
                {agent.roleHint !== null && <div className="sub">{agent.roleHint}</div>}
              </td>
              <td>
                <StatusBadge look={agentLook(agent.observedStatus)} />
                {stale && <StatusBadge look={STALE_LOOK} />}
                {reason !== null && <div className="sub">{reason}</div>}
                {agent.rawStatus !== null && <div className="sub">원본: {agent.rawStatus}</div>}
              </td>
              <td>
                {task === undefined ? (
                  <span className="sub">—</span>
                ) : (
                  <>
                    <StatusBadge look={taskLook(task.status)} /> {task.title ?? task.taskId}
                  </>
                )}
              </td>
              <td>
                <time dateTime={agent.lastReceivedAt}>{time(agent.lastReceivedAt)}</time>
                <div className="sub">{agent.lastEventType}</div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
