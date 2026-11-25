/**
 * Status presentation: every status has an icon AND a text label, so state is never told
 * by colour alone (HQ-109 AC, NFR-010). `tone` only adds colour on top.
 */
export type Tone = 'ok' | 'busy' | 'wait' | 'neutral' | 'bad' | 'off' | 'unknown';

export interface StatusLook {
  icon: string;
  label: string;
  tone: Tone;
}

const AGENT: Record<string, StatusLook> = {
  connected: { icon: '●', label: '연결됨', tone: 'ok' },
  working: { icon: '▶', label: '작업 중', tone: 'busy' },
  waiting: { icon: '⏸', label: '대기', tone: 'wait' },
  idle: { icon: '○', label: '유휴', tone: 'neutral' },
  failed: { icon: '✖', label: '실패', tone: 'bad' },
  disconnected: { icon: '⏏', label: '연결 해제', tone: 'off' },
  unknown: { icon: '?', label: '알 수 없음', tone: 'unknown' },
};

const TASK: Record<string, StatusLook> = {
  draft: { icon: '✎', label: '초안', tone: 'neutral' },
  queued: { icon: '…', label: '대기열', tone: 'wait' },
  running: { icon: '▶', label: '실행 중', tone: 'busy' },
  waiting_approval: { icon: '⏸', label: '승인 대기', tone: 'wait' },
  waiting_external: { icon: '⏸', label: '외부 대기', tone: 'wait' },
  succeeded: { icon: '✔', label: '성공', tone: 'ok' },
  failed: { icon: '✖', label: '실패', tone: 'bad' },
  cancelled: { icon: '⊘', label: '취소', tone: 'off' },
  skipped: { icon: '↷', label: '건너뜀', tone: 'off' },
  unknown: { icon: '?', label: '알 수 없음', tone: 'unknown' },
};

const CONNECTION: Record<string, StatusLook> = {
  pending: { icon: '…', label: '등록됨(heartbeat 전)', tone: 'wait' },
  connected: { icon: '●', label: '연결됨', tone: 'ok' },
  degraded: { icon: '◐', label: '불안정', tone: 'wait' },
  disconnected: { icon: '⏏', label: '끊김', tone: 'off' },
  error: { icon: '✖', label: '오류', tone: 'bad' },
};

/** An unexpected value is shown as-is (as text), never hidden or guessed. */
const fallback = (status: string): StatusLook => ({ icon: '?', label: status, tone: 'unknown' });

export const agentLook = (status: string) => AGENT[status] ?? fallback(status);
export const taskLook = (status: string) => TASK[status] ?? fallback(status);
export const connectionLook = (status: string) => CONNECTION[status] ?? fallback(status);

export const STALE_LOOK: StatusLook = { icon: '⌛', label: '오래됨', tone: 'unknown' };

/** Client-side re-evaluation of the server's derived `stale` as time passes. */
export function isStale(lastReceivedAt: string, staleThresholdMs: number, now: number): boolean {
  return now - Date.parse(lastReceivedAt) > staleThresholdMs;
}

/** Why an agent is unknown, when the read model tells us (domain-model N5). */
export function unknownReason(agent: {
  observedStatus: string;
  reportedStatus: string;
  lastEventType: string;
  rawStatus: string | null;
  connectionLostAt: string | null;
}): string | null {
  if (agent.observedStatus !== 'unknown') return null;
  if (agent.connectionLostAt !== null && agent.reportedStatus !== 'unknown') {
    return '연결이 끊긴 뒤 소식이 없음';
  }
  if (agent.lastEventType === 'event.gap.detected')
    return '이벤트 누락 구간 이후 상태를 알 수 없음';
  if (agent.rawStatus !== null) return `알 수 없는 원본 상태: ${agent.rawStatus}`;
  return '상태를 알려 주는 이벤트를 아직 받지 못함';
}
