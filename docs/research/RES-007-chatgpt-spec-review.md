# RES-007 — 기획 명세서(ChatGPT 작성, v0.1.0) 검토

> 목적: 사용자가 제공한 기획 명세서와 현재 Harness 문서를 대조해 충돌·보완점·명세 자체의 문제를 정리하고 통합 방안을 제안한다.
> 관리 책임: Architect. 상태: **Concluded (검토 완료) — 통합은 사용자 결정 후**
> 원본: [source/chatgpt-spec-v0.1/](source/chatgpt-spec-v0.1/README.md) (2026-11-20 기준일, 원본을 그대로 복사함. 원본은 수정하지 않는다)
> 작성: 2026-11-22, Claude Code

## 1. 요약

명세서는 현재 Harness 문서보다 **제품·도메인 범위가 훨씬 넓고 구체적**이다. 새로 들어온 개념은 Mission, Pipeline, Approval, Artifact, Usage, Connection/Capability, Studio, Easy/Developer Mode다. "Truthful Visualization", "Unknown/Gap 표시", "Capability 기반 제어 노출" 원칙도 명확하다.
현재 문서는 **개발 프로세스(Harness)는 더 구체적**이지만, 제품·도메인 내용은 명세서와 충돌하거나 명세서보다 얕다.

**제안**: 제품·도메인·이벤트·보안·UX는 **명세서를 기준(baseline)**으로 삼고, 개발 프로세스·품질·Agent 협업은 현재 Harness 문서를 유지한다. 명세서의 "확정된 결정"(D-001~D-009)은 사용자 확인을 받은 뒤 Confirmed로 기록한다.

## 2. 충돌 사항 (현재 문서 ↔ 명세서)

| # | 주제 | 현재 문서 | 명세서 | 제안 |
|---|---|---|---|---|
| C1 | Execution Mode "Hybrid"의 의미 | 관찰+제어 병행으로 해석 (OQ-1) | 외부 Runtime 연결(Attached) + HQ 자체 실행(Managed) (D-001) | 명세서 채택 → OQ-1 해소 |
| C2 | 첫 실제 Runtime | 미정 (OQ-3) | Claude Code (D-007) | 명세서 채택 → OQ-3 해소 |
| C3 | 로드맵 순서 | M1 시뮬레이터 → M2 Claude Code → M3 MCP → M4 3D | Phase 0 기반 → 1 Ingestion Core(인증된 연결) → 2 Bridge+Claude Code → 3 Dashboard → 4 3D → 5 Control/Pipeline → 6 Adapter 추가. MCP 관찰은 P1(MVP 이후) | 명세서 Phase 구조 채택. 시뮬레이터는 Phase 1의 **테스트용 Source**로 포함 |
| C4 | Event Envelope | snake_case, `event_id`=멱등 키, 평면 `source` 문자열 | camelCase, `id`와 `idempotencyKey` 분리, `correlationId`/`causationId`, `source{adapterId,runtime,externalSessionId,externalEventId}`, `sensitivity`, `timestampQuality` | 명세서 채택. 초안(커밋 `1234b4b`) domain-model의 §3 Envelope·§4 Type 카탈로그는 Deprecated |
| C5 | Event type 이름 | `tool.called`, `task.delegated` | `tool.call.started`, `agent.status.changed` 등 계층형 | 명세서 채택. coding-standards 명명 규칙 수정 |
| C6 | Agent 상태 | 상태 집합 미정의 | connected / working / waiting / idle / failed / disconnected / unknown | 명세서 채택 (단 S1 참조) |
| C7 | 기술 스택 | React+Vite, SQLite, SSE, 단일 프로세스 (ADR-0003 초안) | Next.js, NestJS, PostgreSQL, Prisma, Redis+BullMQ, WebSocket/SSE, Docker (권장, 미확정) | ADR-0003 개정 (§5, 사용자 결정) |
| C8 | Local-first 강도 | NFR-001 "Local 모드는 네트워크·계정 없이 동작" | Cloud API 중심, Local Bridge가 Cloud에 outbound 연결. "Cloud 없이 가능한 범위를 명시"(원칙 4) | **사용자 결정 필요**: MVP의 HQ 서버를 어디서 실행하는가 |
| C9 | 데이터 분류 | D0~D3 민감도 등급 | 저장 모드(local_only/cloud_only/synced/reference_only/ephemeral) + DataPolicy + `sensitivity` | 병합: 민감도(`sensitivity`)와 저장 모드는 직교 축. D0~D3을 `sensitivity` 4단계에 대응 |
| C10 | 보안 범위 | 로컬 API, 마스킹, 개발용 Tool Governance 중심 | 역할 계층, Agent 정책, Tool Risk Level, Bridge Pairing, Approval, Audit Log, 필수 보안 테스트 11종 | 명세서 내용을 제품 보안으로 통합. 개발용 Tool Governance는 유지 |
| C11 | 화면 구조 | Dashboard + 3D Office | Office / Studio / Operations / Projects / Settings, Easy/Developer Mode | 명세서 채택 |

## 3. 명세서 자체의 문제·보완점

| # | 심각도 | 내용 | 제안 |
|---|---|---|---|
| S1 | Major | Agent 상태가 문서마다 다르다. ui-ux는 Working/Idle/Waiting/**Reviewing**/Failed/Disconnected/Unknown, domain-model은 **connected**/working/waiting/idle/failed/disconnected/unknown이다. ui-ux의 "Stale"은 상태인지 표시 속성인지 불명확하다. | 정규화 상태 집합 하나를 정한다. Reviewing은 상태가 아니라 Agent **역할/활동**으로, Stale은 `lastSeenAt` 기반 **파생 표시 속성**으로 분리 (Proposed) |
| S2 | Major | Claude Code hook → Local Bridge 구간의 보안이 없다. Bridge→Cloud 인증만 다룬다. hook은 사용자 머신에서 셸 명령으로 실행되므로, 같은 머신의 다른 프로세스가 Bridge에 가짜 Event를 넣을 수 있다. | Bridge 로컬 수신 경로(Unix socket 권한, 로컬 토큰)를 보안 요구사항에 추가 |
| S3 | Major | MVP 수용 조건에 3D Office가 포함되어 범위가 크다 (명세서 decisions.md 위험 5와 같은 문제). | 3D MVP 최소 범위(OQ-6)를 Phase 4 착수 전 ADR로 고정 |
| S4 | Major | Phase 1 완료 조건 "Workspace 권한 검증"에는 인증 모델이 필요하지만, 인증 Provider는 Open Decision이다. | Phase 1은 **Connection 단위 토큰 + 단일 로컬 Workspace**로 시작하고 사용자 인증은 후속으로 분리 (Proposed) |
| S5 | Minor | `id`와 `idempotencyKey`의 관계, 생성 주체(Adapter vs Ingestion)가 정의되지 않았다. | `id`는 HQ가 부여하거나 Adapter가 제공, `idempotencyKey`는 Adapter가 결정적으로 생성하고 `(workspaceId, connectionId, idempotencyKey)`를 유일하게 (명세서 §7과 정합) |
| S6 | Minor | Claude Code hook에는 heartbeat가 없을 가능성이 높아 `disconnected`/`unknown` 판정 근거가 부족하다. | RES-002에서 확인. Bridge 자체 heartbeat와 세션 생존 판정을 분리 |
| S7 | Minor | Redis+BullMQ가 권장 스택에 있지만 MVP Phase 0~4에는 필요한 기능이 없다. | MVP에서는 도입 보류, DB Outbox 패턴 사용 (명세서 architecture §6과 정합) |
| S8 | Minor | 명세서에는 테스트 전략, Agent 개발 프로세스, 품질 Gate가 없다 (roadmap §11~12에 간단히만). | 현재 Harness 문서(engineering/, agents/)로 보완. 명세서 Task 템플릿의 `Interfaces`(Consumes/Produces)·`Risks` 항목은 task-protocol에 추가할 가치가 있음 |
| S9 | Nit | 명세서 README의 "Product direction confirmed" 표기는 사용자 확인 기록이 아니다. | 사용자 확인 후 decisions/ ADR로 기록 |

## 4. 확인된 근거 (이번 세션)
- Claude Code hook 이벤트 이름 17종이 사용자 전역 설정에 등록되어 있다 (SessionStart/End, PreToolUse/PostToolUse/PostToolUseFailure, SubagentStart/Stop 등). 명세서 Phase 2의 Session/Subagent/Tool 관찰은 **이벤트 이름 수준에서는 가능해 보인다.** payload는 검증하지 않았다 (RES-002).
- 기술 스택 버전 확인 결과는 [RES-001](README.md#res-001--m1-기술-스택-검증).

## 5. 통합 계획 (사용자 승인 후 실행)
1. 명세서를 `docs/foundation/`의 기준 문서로 옮긴다. product·architecture·domain-model·data-governance는 병합하고, event-schema·adapter-spec·pipeline-spec·ui-ux는 새 파일로 둔다. 명세서의 security는 `engineering/security.md`에 병합한다. 충돌 항목은 §2의 제안대로 반영한다.
2. 명세서 D-001~D-009를 ADR로 기록한다 (D-001~D-007은 제품 방향, D-008~D-009는 아키텍처).
3. roadmap·backlog를 명세서 Phase 구조로 재편한다 (M1 → Phase 1 + 시뮬레이터 Source).
4. 원본 `source/chatgpt-spec-v0.1/`은 이력으로 보존하고, 각 통합 문서에 출처를 표기한다.
