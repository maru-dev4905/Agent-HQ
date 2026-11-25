import type { ConnectionView } from '@agent-hq/contracts';
import { connectionLook } from '../../lib/status';
import { StatusBadge } from './status-badge';

export function ConnectionList({ connections }: { connections: ConnectionView[] }) {
  if (connections.length === 0) return <p className="empty">등록된 Connection이 없습니다.</p>;
  return (
    <ul className="plain">
      {connections.map((c) => (
        <li key={c.connectionId}>
          <StatusBadge look={connectionLook(c.status)} />{' '}
          <span className="name">{c.displayName ?? c.adapterId}</span>{' '}
          <span className="sub">
            {c.runtime}
            {c.lastHeartbeatAt === null
              ? ' · heartbeat 없음'
              : ` · heartbeat ${new Date(c.lastHeartbeatAt).toLocaleTimeString('ko-KR')}`}
            {c.revokedAt !== null && ' · 폐기됨'}
          </span>
        </li>
      ))}
    </ul>
  );
}
