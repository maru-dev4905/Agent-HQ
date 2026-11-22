# Agent Adapter Specification

> 목적: Runtime Adapter 계약, Capability 모델, Claude Code Adapter 범위
> 관리 책임: Architect
> 상태: 본문 Confirmed(제품 요구) / 코드 계약은 초안
> 출처: 기획 명세서 v0.1.0 `adapter-spec.md` ([원본](../research/source/chatgpt-spec-v0.1/adapter-spec.md)) — [ADR-0004](../decisions/ADR-0004-adopt-spec-baseline.md)로 기준 문서로 채택(2026-11-22). 본문은 원문을 그대로 옮겼다. **하단 "통합 노트"가 본문보다 우선한다.**
> 기술 스택에 관한 서술은 제안일 뿐이며, 실제 결정은 [ADR-0003](../decisions/ADR-0003-m1-tech-stack.md)을 따른다.

## 1. 목적

Adapter는 특정 Agent Runtime의 기능과 이벤트를 Agent HQ의 공통
도메인으로 연결한다.

Adapter는 Runtime의 모든 기능을 억지로 동일하게 만들지 않는다. 지원하는
기능과 제약을 명시적으로 선언한다.

## 2. Adapter 유형

### Attached Adapter

이미 외부에서 실행 중인 Runtime을 연결해 관찰한다. - 실행은 외부
Runtime이 소유한다. - HQ는 Event 수집 및 상태 Projection을 수행한다. -
제어는 Runtime이 제공하는 API 또는 Hook 경로가 있을 때만 지원한다.

### Managed Adapter

HQ가 실행을 요청하고 실행 수명주기를 관리한다. - HQ Orchestrator가 실행
요청을 생성한다. - Adapter가 Runtime에 전달한다. - 결과, 오류, Event를
HQ에 반환한다. - 실행 제어는 Runtime Capability에 따른다.

하나의 Adapter가 두 모드를 모두 지원할 수도 있지만, 지원 여부를
Capability로 명시한다.

## 3. 공통 계약

``` ts
interface AgentAdapter {
  id: string;
  version: string;

  initialize(context: AdapterContext): Promise<void>;
  connect(config: ConnectionConfig): Promise<ConnectionResult>;
  disconnect(connectionId: string): Promise<void>;

  getCapabilities(): AdapterCapabilities;
  getHealth(connectionId: string): Promise<ConnectionHealth>;

  subscribe(
    connectionId: string,
    handler: (event: NormalizedAgentEvent) => Promise<void>
  ): Promise<Unsubscribe>;

  execute?(
    connectionId: string,
    request: AgentExecutionRequest
  ): Promise<ExecutionAccepted>;

  control?(
    connectionId: string,
    executionId: string,
    command: ControlCommand
  ): Promise<ControlResult>;

  reconcile?(
    connectionId: string,
    cursor?: string
  ): Promise<ReconciliationResult>;
}
```

실제 TypeScript 계약은 공통 `contracts` 패키지에서 정의한다. 위 코드는
개념적 초안이다.

## 4. Capability Model

예시:

``` ts
type AdapterCapabilities = {
  modes: {
    attached: boolean;
    managed: boolean;
  };
  events: string[];
  controls: {
    pause: "supported" | "unsupported" | "conditional";
    resume: "supported" | "unsupported" | "conditional";
    cancel: "supported" | "unsupported" | "conditional";
  };
  features: {
    subagents: boolean;
    toolEvents: boolean;
    messageEvents: boolean;
    tokenUsage: boolean;
    artifacts: boolean;
    replay: boolean;
    reconciliation: boolean;
  };
};
```

Capability는 Adapter 전체뿐 아니라 Connection 및 Runtime 버전에 따라
달라질 수 있다. UI는 실제 연결의 Capability Snapshot을 사용한다.

## 5. Adapter 책임

-   외부 Event를 공통 Schema로 변환한다.
-   원본 Runtime ID를 보존한다.
-   지원하지 않는 Event는 무시하거나 별도 Raw Event로 보존하되, 조용히
    잘못 매핑하지 않는다.
-   Runtime 오류를 공통 오류 코드와 원본 세부 정보로 매핑한다.
-   Connection 상태와 Heartbeat를 제공한다.
-   제어 명령의 성공/실패를 명확히 반환한다.
-   이벤트 수집 범위와 제한을 문서화한다.

## 6. Claude Code Adapter --- 첫 구현

### 목표

사용자가 기존 Claude Code 작업 방식을 유지하면서 Agent HQ에서 Session,
Subagent, Tool 활동을 관찰할 수 있게 한다.

### 수집 경로 후보

-   Claude Code Hooks
-   Session 및 Subagent 식별 정보
-   지원되는 Hook Event
-   Local Bridge를 통한 Event 전송

구체적인 Hook 이름과 Payload는 구현 시 공식 문서를 확인하고, 지원되는
Claude Code 버전별로 계약 테스트를 작성한다. 특정 Hook이 제공하지 않는
정보를 추정해서 만들어내지 않는다.

### 초기 범위

-   Session 연결 및 종료 관찰
-   Subagent 시작/종료 관찰(지원되는 Hook 범위)
-   Tool 호출 시작/완료/실패 관찰(지원되는 Hook 범위)
-   Agent 간 부모-자식 관계(원본에서 확인 가능한 경우)
-   연결 상태 및 수집 Gap 표시

### 비목표

-   Claude Code 내부 동작을 임의로 제어
-   모든 메시지 전문 수집
-   지원되지 않는 Pause/Resume 구현을 가장하기
-   Hook만으로 알 수 없는 Task 의미를 자동 확정

## 7. OpenAI Agents SDK Adapter --- 후속

-   Agent 실행 및 Handoff
-   Tool Call
-   Trace / Span
-   Guardrail 관련 이벤트(노출 가능한 범위)
-   Token Usage 및 Provider Usage(제공되는 경우)

SDK 버전 및 공식 Trace API에 맞춘 매핑이 필요하다.

## 8. LangGraph Adapter --- 후속

-   Graph Node 시작/종료
-   State Transition
-   Checkpoint
-   Interrupt / Resume (지원 API 범위)
-   Parent/Child Graph 실행 관계

## 9. Custom Adapter

Custom Adapter는 다음 중 하나 이상의 방식으로 연결할 수 있다. - SDK
Package - HTTP Webhook - Local Bridge Plugin - Event Ingestion API

Webhook을 통한 Event 전송은 서명 검증, Timestamp 검증, Replay 방지, Rate
Limit을 적용한다.

## 10. Adapter 테스트 요구사항

-   Event mapping unit test
-   Capability declaration test
-   Connection lifecycle test
-   Duplicate event test
-   Out-of-order event test
-   Disconnect / reconnect test
-   Unsupported control test
-   Runtime version compatibility test
-   Secret redaction test

## 11. 오류 코드 후보

-   `ADAPTER_NOT_FOUND`
-   `RUNTIME_UNSUPPORTED`
-   `CONNECTION_FAILED`
-   `AUTHENTICATION_FAILED`
-   `CAPABILITY_UNAVAILABLE`
-   `CONTROL_NOT_SUPPORTED`
-   `EVENT_SCHEMA_INVALID`
-   `EVENT_REPLAY_REJECTED`
-   `RUNTIME_TIMEOUT`
-   `RECONCILIATION_UNAVAILABLE`

---

## 통합 노트 (Agent HQ, 2026-11-22)

### N1. Claude Code hook 근거 (2026-11-22 확인)
사용자 전역 `~/.claude/settings.json`에 다음 hook 이벤트 이름이 등록되어 있다 (Orca·iTerm2가 설치): Elicitation, ElicitationResult, Notification, PermissionRequest, PostCompact, PostToolBatch, PostToolUse, PostToolUseFailure, PreToolUse, SessionEnd, SessionStart, Stop, StopFailure, SubagentStart, SubagentStop, TeammateIdle, UserPromptSubmit.
→ §6 초기 범위(Session, Subagent, Tool 시작/완료/실패)는 **이벤트 이름 수준에서는 대응하는 hook이 있다.** payload, 식별자 제공 여부, 버전별 차이는 검증하지 않았다 → RES-002 (HQ-110).

### N2. 추가 요구 (Proposed)
- hook → Bridge 로컬 구간 인증 (RES-007 S2, [RSK-016](../operations/risks.md))
- Claude Code에는 heartbeat가 없을 수 있다. `disconnected`/`unknown` 판정 근거는 RES-002에서 정한다 (RES-007 S6)
- hook을 설치할 때 사용자 전역 설정을 자동으로 수정하지 않는다. 기존 hook(Orca, iTerm2)과 공존해야 한다 ([RSK-009](../operations/risks.md))
- 이 프로젝트 자체의 개발 세션을 관찰(dogfooding)하는 것은 사용자 동의 후에만 한다
