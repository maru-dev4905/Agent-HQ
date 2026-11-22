# Event Schema & Observability

## 1. 목적

Event는 Agent HQ의 공통 관찰 데이터다. Agent 상태, Task 진행, Tool 호출,
Approval, Artifact, 3D Office 애니메이션 및 Dashboard Activity는 Event
또는 Event에서 계산한 Projection을 기반으로 한다.

## 2. 핵심 원칙

1.  Event는 발생한 사실을 표현한다.
2.  원본 Runtime Event와 정규화 Event를 구분할 수 있어야 한다.
3.  발생 시각(`occurredAt`)과 HQ 수신 시각(`receivedAt`)을 분리한다.
4.  중복 전송을 고려해 Idempotency를 지원한다.
5.  인과 관계와 실행 묶음을 추적할 수 있어야 한다.
6.  순서 보장은 범위가 명시된 경우에만 가정한다.
7.  민감 정보는 기본 수집 최소화 및 마스킹한다.

## 3. 공통 Event Envelope

``` ts
type AgentEvent = {
  id: string;
  schemaVersion: number;
  type: string;

  occurredAt: string; // ISO-8601 UTC
  receivedAt?: string;

  workspaceId: string;
  projectId?: string;
  missionId?: string;
  pipelineRunId?: string;
  nodeRunId?: string;
  taskId?: string;
  agentInstanceId?: string;
  connectionId?: string;

  source: {
    adapterId: string;
    runtime: string;
    externalSessionId?: string;
    externalEventId?: string;
  };

  correlationId: string;
  causationId?: string;
  idempotencyKey: string;

  payload: Record<string, unknown>;
  sensitivity?: "public" | "internal" | "sensitive" | "secret";
};
```

`occurredAt`은 원본 Runtime의 시각을 사용한다. 원본이 제공하지 않으면
수집 시각을 대신 넣지 말고 `timestampQuality` 또는 metadata로 수집 시각
대체임을 명시한다.

## 4. Event Type Namespace

### Agent

-   `agent.connected`
-   `agent.disconnected`
-   `agent.started`
-   `agent.status.changed`
-   `agent.completed`
-   `agent.failed`
-   `agent.message.sent`
-   `agent.message.received`

### Task

-   `task.created`
-   `task.assigned`
-   `task.started`
-   `task.progress`
-   `task.waiting`
-   `task.completed`
-   `task.failed`
-   `task.cancelled`
-   `task.retry.scheduled`

### Tool

-   `tool.call.started`
-   `tool.call.completed`
-   `tool.call.failed`

### Pipeline

-   `pipeline.run.queued`
-   `pipeline.run.started`
-   `pipeline.run.waiting`
-   `pipeline.run.completed`
-   `pipeline.run.failed`
-   `pipeline.run.cancelled`
-   `pipeline.node.started`
-   `pipeline.node.completed`
-   `pipeline.node.failed`

### Approval

-   `approval.requested`
-   `approval.approved`
-   `approval.rejected`
-   `approval.expired`
-   `approval.cancelled`

### Artifact / Usage / Connection

-   `artifact.created`
-   `artifact.updated`
-   `usage.reported`
-   `connection.health.changed`
-   `event.gap.detected`

## 5. Event 예시

``` json
{
  "id": "evt_01J...",
  "schemaVersion": 1,
  "type": "task.started",
  "occurredAt": "2026-11-20T05:00:00Z",
  "workspaceId": "ws_123",
  "projectId": "prj_123",
  "missionId": "mis_123",
  "taskId": "task_123",
  "agentInstanceId": "agt_123",
  "source": {
    "adapterId": "claude-code",
    "runtime": "claude-code",
    "externalSessionId": "session_abc"
  },
  "correlationId": "run_123",
  "idempotencyKey": "claude:session_abc:task_123:started",
  "payload": {
    "title": "Research market opportunities"
  }
}
```

## 6. 상태 Projection

Event는 append-only log로 저장하고, UI가 빠르게 조회할 수 있도록 현재
상태 Projection을 별도로 유지한다.

예: - `agent_current_state` - `task_current_state` -
`pipeline_run_summary` - `connection_health`

Projection은 원본 사실이 아니라 Event를 반영한 계산 결과다. 재생성
가능해야 한다.

## 7. 순서 및 중복 처리

-   Adapter가 제공하는 sequence number가 있으면 저장한다.
-   sequence가 없으면 시각만으로 절대 순서를 보장하지 않는다.
-   Idempotency Key는 Connection 및 Workspace 범위를 포함해 충돌을
    방지한다.
-   같은 이벤트가 재전송되면 중복 삽입 대신 기존 이벤트를 참조한다.
-   Event 간 인과 관계는 `correlationId`, `causationId`, `parent` 관계로
    추적한다.

## 8. Event Gap 및 Unknown

이벤트 누락이 의심되는 경우: - 마지막 확인 Cursor 기록 - Runtime 재조회
가능 여부 확인 - 재전송 시도 - 복구 불가 구간은 `event.gap.detected`로
기록 - 해당 구간의 Agent 상태를 Unknown 또는 Stale로 표시

누락 이벤트를 추정으로 채우지 않는다.

## 9. Trace 및 Span

하나의 Mission Run에 여러 Agent, Task, Tool Call이 포함될 수 있다.
`correlationId`로 실행을 묶고 각 하위 실행을 Span 형태로 표현할 수 있다.

권장 Span 속성: - traceId - spanId - parentSpanId - operationName -
startTime - endTime - status - runtime - agentId - taskId - toolName

OpenTelemetry 호환성은 후속 검토 대상으로 둔다. 초기 내부 Event Schema가
특정 Telemetry 표준에 완전히 종속되지는 않는다.

## 10. 민감 정보

기본적으로 다음은 Event payload에 원문 저장하지 않는다. - API Key /
Access Token - 비밀번호 및 인증 헤더 - 전체 파일 내용 - 개인 식별 정보 -
민감한 Tool 입력/출력

필요한 경우 사용자가 명시적으로 활성화한 수집 정책, 마스킹, 저장 위치
정책을 통과해야 한다.

## 11. Schema Evolution

-   모든 Event에 `schemaVersion`을 포함한다.
-   하위 호환 가능한 Optional Field 추가를 우선한다.
-   breaking change는 새 버전 및 명시적 변환 로직을 요구한다.
-   원본 Raw Event 저장은 별도 정책을 적용한다.
-   Adapter는 지원하는 Schema Version 범위를 선언한다.
