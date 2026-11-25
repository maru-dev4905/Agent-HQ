# Event Schema & Observability

> 목적: 공통 Event Envelope, Type Namespace, 순서·중복·Gap 처리, Trace, Schema Evolution
> 관리 책임: Architect. Envelope 변경은 ADR 필요
> 상태: 본문 Confirmed (ADR-0004) / 통합 노트는 Proposed — HQ-101에서 코드 계약으로 확정
> 출처: 기획 명세서 v0.1.0 `event-schema.md` ([원본](../research/source/chatgpt-spec-v0.1/event-schema.md)) — [ADR-0004](../decisions/ADR-0004-adopt-spec-baseline.md)로 기준 문서로 채택(2026-11-22). 본문은 원문을 그대로 옮겼다. **하단 "통합 노트"가 본문보다 우선한다.**
> 기술 스택에 관한 서술은 제안일 뿐이며, 실제 결정은 [ADR-0003](../decisions/ADR-0003-m1-tech-stack.md)을 따른다.

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

---

## 통합 노트 (Agent HQ, 2026-11-22)

### N1. `id`와 `idempotencyKey` (RES-007 S5)
- `idempotencyKey`: Adapter(Source)가 원본 정보로 **결정적으로** 생성한다. 유일성 범위는 `(workspaceId, connectionId, idempotencyKey)`다.
- `id`: Source가 제공할 수 있고, 제공하지 않으면 Ingestion이 부여한다. 시간순 정렬이 가능한 형식(ULID 또는 UUIDv7)을 제안한다.
- 같은 `idempotencyKey`가 다른 payload로 들어오면 기존 Event를 유지하고 충돌을 기록한다. 덮어쓰지 않는다.
- **`workspaceId`와 `connectionId`는 Ingestion이 인증 토큰에서 가져온다.** body에 다른 값이 있으면 거부한다. 저장된 Event에는 `connectionId`가 항상 있다 (Envelope에서는 optional이지만 저장본에서는 필수).

### N2. Envelope 보완 (Proposed)
- `timestampQuality?: "source" | "collected"` — 본문 §3이 언급하는 필드를 Envelope에 명시한다.
- `sequence?: number` — §7의 Adapter sequence를 담을 필드. 범위는 `(connectionId, externalSessionId)`.
- `schemaVersion`은 `1`부터 시작한다.
- `storeSequence` (저장 전용, Envelope에 넣지 않음): Event Store가 저장 순서대로 부여하는 단조 증가 정수다. **Replay Cursor와 SSE `Last-Event-ID`는 이 값이다.** `id`는 Source가 줄 수 있으므로 Cursor로 쓰지 않는다.

### N3. `sensitivity` ↔ 데이터 등급
`public`=D0, `internal`=D1, `sensitive`=D2, `secret`=D3. `secret`은 어떤 정책으로도 저장하지 않는다 ([data-governance 통합 노트](../engineering/data-governance.md#통합-노트-agent-hq-2026-11-22)).

### N4. MVP(Phase 1~2) 구현 대상 Type
`agent.connected`, `agent.disconnected`, `agent.started`, `agent.status.changed`, `agent.completed`, `agent.failed`, `task.created`, `task.started`, `task.completed`, `task.failed`, `tool.call.started`, `tool.call.completed`, `tool.call.failed`, `connection.health.changed`, `event.gap.detected`, `usage.reported`(데이터가 있을 때). 나머지는 해당 Phase에서 추가한다.

### N5. 시뮬레이터
`source = { adapterId: "simulator", runtime: "simulator" }`. seed가 같으면 같은 `idempotencyKey` 열을 생성한다.

### N6. 이전 초안과의 관계
초안 v0의 snake_case 필드(`event_id`, `occurred_at`)와 Type 이름(`tool.called`, `task.delegated`)은 Deprecated다. 이전 내용은 커밋 `1234b4b`에 있다.

### N7. HQ-101 계약 구현 (2026-11-22)
- 코드 위치: `packages/events/src/` — `envelope.ts`(`parseIncomingEvent`, `IncomingAgentEvent`, `AgentEvent`), `payloads.ts`(Type별 payload, 필수 외부 ID), `limits.ts`(크기 상한, `SUPPORTED_SCHEMA_VERSION = 1`), `fixtures/samples.ts`(계약 샘플). 상태 집합은 `packages/domain/src/`.
- **외부 ID ([ADR-0006](../decisions/ADR-0006-external-ids-and-lenient-payloads.md))**: Source는 `source.externalAgentId`·`source.externalTaskId`와 payload의 `externalToolCallId`·`parentExternalAgentId`·`parentExternalTaskId`를 보낸다. `agentInstanceId`·`taskId`는 Ingestion이 매핑해 부여하는 서버 소유 필드다. `agent.*`·`tool.*`는 `externalAgentId`, `task.*`는 `externalTaskId`가 필수다.
- **미정의 필드**: 거부하지 않고 버리며(strip), 버린 필드의 이름만 `ignoredFields`로 돌려준다. 서버 소유 필드(`receivedAt`, `storeSequence`, `agentInstanceId`, `taskId`)는 거부한다. **파싱 결과만 저장하고 로그에 남긴다. 원본 입력은 절대 저장·로그하지 않는다.**
- 추가 검증: ID는 공백만이거나 제어 문자(NUL 포함)를 담을 수 없다. 요약은 500자 이하이고 NUL을 담을 수 없다. `sequence`가 있으면 `source.externalSessionId`가 필수다. `event.gap.detected`는 `fromSequence ≤ toSequence`여야 한다.
- 본문 §5 예시와의 차이: `agentInstanceId`·`taskId`를 Source가 보내지 않는다 (위 외부 ID 규칙).

### N8. Projection 순서 규칙 (HQ-106, 2026-11-24, Proposed)
- Read Model은 이벤트를 `(occurredAt, source.externalSessionId, sequence, idempotencyKey)` 사전식 순서로 비교한다. 어떤 두 이벤트든 순서가 하나로 정해지는 **전순서**다. 그래서 같은 이벤트 집합이면 도착 순서·중복·동률과 관계없이 같은 상태가 된다.
- `sequence`는 **같은 시각을 가진 같은 세션의 이벤트**를 정렬한다. 한 세션 안에서 시계가 거꾸로 가면 `sequence`보다 시각이 우선한다. 세션 우선 규칙(같은 세션은 sequence, 세션 사이는 시각)은 A<B<C<A 같은 순환을 만들 수 있어서 쓰지 않는다 (HQ-106 리뷰).
- 최종 동률은 Source가 재전송해도 바뀌지 않는 `idempotencyKey`로 깬다. 도착 순서인 `storeSequence`로 깨지 않는다.
- 각 필드는 그 필드를 실제로 담은 이벤트만 바꾼다. 필드가 없는 이벤트가 기존 값을 지우지 않는다.
- 도착 순서에 따라 달라지는 것이 정상인 값: `lastStoreSequence`(로그 위치), `lastReceivedAt`(서버 수신 시각). Stale 판정(HQ-108)은 소스 시계가 아니라 `lastReceivedAt`을 쓴다.

### N9. Gap 감지 (HQ-108, 2026-11-25, Proposed)
- 주기 작업(`GAP_CHECK_INTERVAL_MS`, 기본 10초)이 (Workspace, Connection, `source.externalSessionId`)별로 `sequence`를 정렬해 연속하지 않는 곳을 찾는다. 구멍 양쪽 이벤트를 모두 받은 지 `GAP_GRACE_MS`(기본 30초)가 지나도 메워지지 않으면 기록한다. 순서가 섞여 늦게 오는 이벤트에 시간을 주기 위해서다.
- 기록은 HQ가 만든 `event.gap.detected`다: `source = { adapterId: "hq", runtime: "hq", externalSessionId }`, `sequence = toSequence`, `timestampQuality = "collected"`, `occurredAt` = 구멍 바로 뒤 이벤트의 시각, payload `{ reason, fromSequence, toSequence }`, idempotencyKey `hq:gap:<session>:<from>-<to>:<agentInstanceId>`. 영향을 받는 Agent마다 하나씩 기록한다(domain-model N5).
- 이미 기록한 범위 안의 구멍은 다시 기록하지 않는다. 기록 뒤에 빠졌던 이벤트 일부가 도착해 구멍이 나뉘어도 마찬가지다. 기록 자체도 지우지 않는다(로그는 append-only). 여러 프로세스가 같은 구멍을 동시에 찾아도 idempotencyKey가 같아 한 번만 저장된다(대상 Agent 집합은 트랜잭션 밖에서 계산하므로, 그 사이에 세션에 새 Agent가 생기면 그 Agent 몫의 기록이 하나 더 생길 수 있다).
- `sequence`를 셀 때 HQ가 만든 Gap 기록은 빼고, Source가 직접 보낸 `event.gap.detected`는 Source 번호 체계의 일부로 센다. `adapterId = "hq"`는 HQ 전용이라 Source가 쓸 수 없다.
- 감지하지 못하는 경우: 세션의 첫 이벤트가 빠진 경우(`sequence` 시작값 계약이 없음), 세션 끝 이벤트가 빠진 경우. 이런 경우는 연결 끊김과 Stale 표시로 드러난다.
