# Domain Model

> 목적: 도메인 개념, Event 모델, 용어 정의. 코드의 타입·테이블 이름은 이 문서를 따른다.
> 관리 책임: Architect. Event Envelope 변경은 ADR 필요.
> 상태: **Proposed v0** — HQ-101에서 스키마로 확정한다.

## 1. 용어집

| 용어 | 정의 |
|---|---|
| **Workspace** | 관찰 단위의 최상위 묶음 (예: 하나의 프로젝트/저장소). |
| **Agent** | 작업을 수행하는 실행 주체 (Claude Code 세션, subagent, Orca worker 등). 고유 `agent_id`. |
| **Session** | Agent의 한 번의 실행 생명주기 (시작~종료). |
| **Task** | Agent가 수행하는 작업 단위. 위임될 수 있다. |
| **Delegation** | 한 Agent가 다른 Agent에 Task를 넘기는 관계. 부모-자식 그래프를 만든다. |
| **Tool Call** | Agent가 도구(파일, shell, MCP tool 등)를 호출한 한 번의 행위. |
| **MCP Server** | Agent가 연결한 MCP 서버. Tool Call의 출처. |
| **Event** | 위 개념에서 발생한 사실의 불변 기록. 시스템의 원천 데이터. |
| **Projection / Read Model** | Event를 접어서(fold) 만든 조회용 상태. 언제든 재생성 가능. |
| **Source** | Event를 만들어 보내는 주체 (simulator, claude-code, mcp-observer …). |

## 2. 관계

```text
Workspace 1─* Agent 1─* Session 1─* Task 1─* ToolCall *─1 McpServer(optional)
                                     Task *─* Task   (Delegation: parent → child)
모든 변화 ──▶ Event (append-only)
```

## 3. Event Envelope (Proposed v0)

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `event_id` | string (UUID v7 또는 ULID 제안) | Y | 전역 고유, 멱등성 키 |
| `schema_version` | string | Y | 예: `"0"` |
| `type` | string | Y | 아래 Event Type 카탈로그 |
| `occurred_at` | ISO-8601 UTC | Y | 소스에서 발생한 시각 |
| `received_at` | ISO-8601 UTC | 서버 설정 | 수신 시각 (소스가 보내지 않음) |
| `source` | string | Y | `simulator` \| `claude-code` \| … |
| `workspace_id` | string | Y | |
| `agent_id` | string | Y | |
| `session_id` | string | Y | |
| `task_id` | string | N | |
| `parent_agent_id` | string | N | 위임 관계 |
| `seq` | integer | N | 같은 session 내 순서 (시계 오차 보정용) |
| `payload` | object | Y | type별 스키마 |
| `redaction` | object | 서버 설정 | 마스킹 적용 내역 |

**순서 규칙(Proposed)**: 같은 `session_id` 안에서는 `seq` 우선, 없으면 `occurred_at`. 세션 간 전역 순서는 보장하지 않는다 ([RSK-006](../operations/risks.md)).

## 4. Event Type 카탈로그 (Proposed v0)

| type | 의미 | 주요 payload |
|---|---|---|
| `session.started` | Agent 세션 시작 | agent 이름, 종류, 실행 환경(local/cloud) |
| `session.ended` | 세션 종료 | 종료 사유, 결과 |
| `task.created` | Task 생성 | 제목, 부모 task |
| `task.delegated` | 다른 Agent에 위임 | from_agent, to_agent |
| `task.status_changed` | 상태 변경 | from, to |
| `tool.called` | 도구 호출 시작 | tool 이름, 입력 요약(마스킹) |
| `tool.completed` | 도구 호출 종료 | 성공 여부, 소요 시간, 출력 요약 |
| `agent.status_changed` | idle/working/waiting/error | |
| `agent.message_emitted` | Agent 출력 메시지 (선택 저장) | 요약 또는 해시 |
| `error.raised` | 오류 | 코드, 메시지 |

## 5. Projection (M1 대상)

| Read Model | 내용 | 원천 Event |
|---|---|---|
| `agent_state` | Agent별 현재 상태, 마지막 활동 시각, 현재 Task | session.*, agent.status_changed, task.* |
| `session_timeline` | 세션별 시간순 Event 요약 | 전체 |
| `delegation_graph` | Agent/Task 위임 그래프 | task.delegated |
| `tool_stats` | 도구별 호출 수·실패율·평균 시간 | tool.* |

## 6. Open Questions
- 상태 머신: `agent.status_changed`를 명시 Event로 받을지, 다른 Event에서 추론할지 (Claude Code hook이 제공하는 신호에 의존 — RES-002)
- Orca의 Run/Task/Dispatch 개념과 매핑할지 (OQ-5)
- 이 프로젝트 자체의 Agent 작업 기록([agent-workflow §6](../agents/agent-workflow.md#6-observability-작업-추적))을 같은 스키마로 맞춰 dogfooding할지
