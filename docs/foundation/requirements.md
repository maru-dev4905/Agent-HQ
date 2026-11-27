# Requirements

> 목적: 기능(FR)·비기능(NFR) 요구사항에 ID를 붙여 관리한다. Task는 이 ID를 참조한다.
> 관리 책임: Architect가 제안하고 사용자가 승인한다.
> 출처: 제품 범위(P0/P1/P2)는 [product.md §7](product.md)이 원천이다(Confirmed, ADR-0004). 이 문서는 그 범위를 **검증 가능한 단위로 쪼갠 것**이며, 표기가 없으면 각 항목의 세부 서술은 **Proposed**다.
> 갱신: 2026-11-22 (명세서 채택에 따라 재작성. 이전 FR/NFR 번호는 커밋 `1234b4b`)

## 1. 기능 요구사항 (FR) — MVP(P0)

### Event 수집·저장 (Phase 1)
| ID | 요구사항 | Phase | 근거 |
|---|---|---|---|
| FR-001 | [event-schema](event-schema.md)의 공통 Envelope를 따르는 Event를 인증된 Connection에서만 받는다 | 1 | P0 "Local Bridge의 인증된 연결", roadmap Phase 1 |
| FR-002 | 스키마에 맞지 않는 Event는 거부하고 필드별 사유를 반환한다 | 1 | Phase 1 완료 조건 |
| FR-003 | `(workspaceId, connectionId, idempotencyKey)`가 같은 Event를 중복 저장하지 않는다 | 1 | event-schema §7 |
| FR-004 | `occurredAt`과 `receivedAt`을 분리해 저장한다. 원본 시각이 없으면 `timestampQuality`로 표시한다 | 1 | event-schema §3 |
| FR-005 | Event는 append-only로 저장하고, Projection은 Event에서 재생성할 수 있다 | 1 | ADR-0002 |
| FR-006 | 결정적(seed 기반) 시뮬레이터가 다중 Agent 시나리오 Event를 Ingestion API로 보낸다 | 1 | 테스트용 Source (ADR-0004 Consequences) |
| FR-007 | Realtime 구독(SSE)이 끊겼다가 재연결되면 Cursor 이후 Event를 누락 없이 받는다 | 1 | Phase 1 완료 조건 |
| FR-008 | 누락이 의심되는 구간을 `event.gap.detected`로 기록하고, 해당 Agent 상태를 Unknown 또는 Stale로 표시한다 | 1 | event-schema §8 |
| FR-009 | Connection 상태(pending/connected/degraded/disconnected/error)를 heartbeat로 추적한다 | 1 | domain-model §4 |

### Claude Code 연동 (Phase 2)
| ID | 요구사항 | Phase |
|---|---|---|
| FR-020 | Local Bridge가 Pairing으로 Connection 자격 증명을 받고 API와 연결한다 | 2 |
| FR-021 | Claude Code Session, Subagent, Tool 이벤트를 지원되는 hook 범위에서 수집하고 정규화한다 | 2 |
| FR-022 | Bridge는 전송 실패 시 Outbox에 보관하고 재전송한다 (중복·누락 처리) | 2 |
| FR-023 | Adapter Capability를 선언하고, 지원하지 않는 기능을 UI에 정확히 표시한다 | 2 |

### 관찰 화면 (Phase 1 최소 / Phase 3 본격 / Phase 4 3D)
| ID | 요구사항 | Phase |
|---|---|---|
| FR-030 | 개발용 Dashboard v0: Agent Roster, 상태, Event Timeline, Connection 상태 | 1 |
| FR-031 | Operations Dashboard: Workspace/Project Switcher, Agent Detail, Mission/Task Timeline, Tool Activity, Trace View, Unknown/Stale 표시 ([ui-ux §4](ui-ux.md)) | 3 |
| FR-032 | 새 Event가 들어오면 새로고침 없이 반영되고, Dashboard와 API 상태가 일치한다 | 1·3 |
| FR-033 | 3D Office가 같은 Projection을 표현하고 Unknown과 Idle을 구분한다. 3D를 끄더라도 주요 기능은 유지된다 | 4 |

P1/P2(Pipeline, Approval Inbox, 제어, MCP 관리, 팀 RBAC 등)는 [product.md §7](product.md)을 원천으로 두고, 해당 Phase를 착수할 때 FR로 쪼갠다.

## 2. 비기능 요구사항 (NFR)

| ID | 요구사항 | 근거 |
|---|---|---|
| NFR-001 | MVP는 로컬 셀프호스트에서 Cloud 계정이나 외부 네트워크 없이 동작한다 | ADR-0003, 제품 원칙 4 |
| NFR-002 | Event 수신부터 화면 반영까지의 지연을 측정한다. 목표 수치는 측정 후 정한다 | 명세서 roadmap §13 "수치 목표는 실제 측정 후" |
| NFR-003 | 측정 항목: ingestion latency, duplicate rate, reconnect recovery, projection correctness, dashboard update latency, event gap frequency | roadmap §13 |
| NFR-002a (Confirmed 2026-11-27, 사용자) | 기준 부하: 로컬 사용자 1명, 동시 Agent 10개 안팎, Workspace당 50 events/s. 목표: dashboard update latency p95 ≤ 500 ms, Event 1개 요청 ingestion p95 ≤ 100 ms, Workspace당 ≥ 50 events/s, 중복 저장 0건, 재연결 시 5,000건 2 s 이내 무손실, Projection 전체 재생성 5만 건 ≤ 60 s, 동시 full batch 5건까지 500 없음(그 이상은 503 + `Retry-After`), Gap 감지 정상 상태 1회 5만 건 ≤ 1 s | [RES-005](../research/RES-005-load-measurement.md) §3·§7. HQ-113 뒤 8개 모두 충족(dashboard 지연은 저부하 측정). 측정 명령 `pnpm measure:load`(Gate 아님) |
| NFR-004 | 관찰된 상태와 추정 상태를 구분한다. 이벤트가 없다는 이유로 Idle로 추론하지 않는다 | product §8, README 원칙 4 |
| NFR-005 | Secret과 민감한 Tool 인자는 기본적으로 마스킹하고, `secret` 등급은 저장하지 않는다 | product §8, data-governance |
| NFR-006 | 모든 Event는 `schemaVersion`을 가진다. 하위 호환을 깨는 변경은 새 버전과 변환 로직을 요구한다 | event-schema §11 |
| NFR-007 | 개발 환경은 문서화된 명령만으로 재현할 수 있어야 한다 | Harness |
| NFR-008 | 관찰 실패가 관찰 대상 Agent의 실행을 방해하지 않는다 | architecture 통합 노트 N4 |
| NFR-009 | 이벤트 수집과 3D 렌더링을 분리한다. 이벤트가 폭주해도 렌더링이 수집을 방해하지 않는다 | product §8, Phase 4 |
| NFR-010 | 핵심 상태를 색상과 애니메이션만으로 전달하지 않는다 | product §8, ui-ux §8 |
