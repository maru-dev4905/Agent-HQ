'use client';

import type { AgentList, ConnectionList, EventView, TaskList } from '@agent-hq/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeEvents } from '../lib/events';
import { browserStreamDeps, throttle, WorkspaceStream, type StreamState } from '../lib/stream';
import { AgentRoster } from './components/roster';
import { ConnectionList as Connections } from './components/connections';
import { EventTimeline } from './components/timeline';

/** Same-origin prefix that next.config.ts rewrites to the API (no CORS needed). */
const API = '/hq-api/workspaces/local';
const TIMELINE_LIMIT = 200;

const STREAM_TEXT: Record<StreamState, string> = {
  connecting: '실시간 연결 중…',
  live: '실시간 수신 중',
  reconnecting: '연결이 끊겨 다시 연결하는 중 (끊긴 동안의 Event는 이어서 받습니다)',
  'reset-needed':
    'Event 로그가 이 화면보다 짧아졌습니다 (DB 초기화 등). 처음부터 다시 불러와야 합니다',
};

interface ReadModels {
  agents: AgentList;
  tasks: TaskList;
  connections: ConnectionList;
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${API}${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

/**
 * Boundary check of the read-model responses: the lists the view iterates must be arrays.
 * A malformed answer is reported like a failed request and the last good view is kept.
 */
function listOf<T>(body: unknown, key: string): T {
  const value = (body as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(value)) throw new Error(`unexpected response: ${key} is not a list`);
  return body as T;
}

export function Dashboard() {
  const [models, setModels] = useState<ReadModels | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventView[]>([]);
  const [stream, setStream] = useState<StreamState>('connecting');
  const [now, setNow] = useState(() => Date.now());
  const streamRef = useRef<WorkspaceStream | undefined>(undefined);

  const inFlight = useRef(false);
  const again = useRef(false);

  // One read at a time: a refresh asked for meanwhile runs once when it ends. Slow answers
  // are therefore always applied, and an older answer can never overwrite a newer one.
  const refresh = useCallback(() => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    Promise.all([getJson('/agents'), getJson('/tasks'), getJson('/connections')])
      .then(([agents, tasks, connections]) => {
        setModels({
          agents: listOf<AgentList>(agents, 'agents'),
          tasks: listOf<TaskList>(tasks, 'tasks'),
          connections: listOf<ConnectionList>(connections, 'connections'),
        });
        setLoadError(null);
      })
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => {
        inFlight.current = false;
        if (again.current) {
          again.current = false;
          refresh();
        }
      });
  }, []);

  useEffect(() => {
    // Stale is a function of time: re-evaluate it even when nothing arrives.
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    const deps = browserStreamDeps();
    // Read models change with every event: refresh at most every 500 ms during bursts.
    const scheduleRefresh = throttle(refresh, 500, deps);
    const workspaceStream = new WorkspaceStream(API, deps, {
      onEvent: (event) => {
        setEvents((current) => mergeEvents(current, [event], TIMELINE_LIMIT));
        scheduleRefresh();
      },
      onState: setStream,
      onOpen: refresh,
      onInvalid: setLoadError,
    });
    streamRef.current = workspaceStream;
    refresh();
    workspaceStream.start(0n);
    return () => {
      clearInterval(tick);
      scheduleRefresh.cancel();
      workspaceStream.stop();
    };
  }, [refresh]);

  const resetStream = () => {
    setEvents([]);
    setModels(null);
    streamRef.current?.reset();
  };

  const live = stream === 'live';
  return (
    <main>
      <header>
        <h1>Agent HQ</h1>
        <p className={`stream stream-${stream}`} role="status">
          {STREAM_TEXT[stream]}
          {stream === 'reset-needed' && (
            <button type="button" onClick={resetStream}>
              처음부터 다시 불러오기
            </button>
          )}
        </p>
        {loadError !== null && (
          <p className="error" role="alert">
            조회 실패: {loadError}
          </p>
        )}
      </header>
      <section>
        <h2>Agent</h2>
        {!live && models !== null && (
          <p className="sub">실시간 연결이 없어 마지막으로 받은 내용을 보여 주고 있습니다.</p>
        )}
        {models === null ? (
          <p className="empty">{loadError === null ? '불러오는 중…' : '조회하지 못했습니다.'}</p>
        ) : (
          <AgentRoster
            agents={models.agents.agents}
            tasks={models.tasks.tasks}
            staleThresholdMs={models.agents.staleThresholdMs}
            now={now}
          />
        )}
      </section>
      <section>
        <h2>Connection</h2>
        {models !== null && <Connections connections={models.connections.connections} />}
      </section>
      <section>
        <h2>Event Timeline (최근 {TIMELINE_LIMIT}건)</h2>
        <EventTimeline events={events} agents={models?.agents.agents ?? []} />
      </section>
    </main>
  );
}
