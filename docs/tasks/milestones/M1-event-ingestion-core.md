# M1 — Event Ingestion Core (명세서 Phase 1)

> 목표: 공통 Event를 인증된 연결에서 받아 저장하고, Projection과 Realtime으로 화면까지 전달한다. 실제 Runtime 대신 결정적 시뮬레이터로 검증한다.
> 종료 조건 (명세서 Phase 1 + 조정):
> 1. 유효하지 않은 Event를 거부한다 (FR-002)
> 2. 중복 Event를 중복 저장하지 않는다 (FR-003)
> 3. 수신 시각과 발생 시각을 분리한다 (FR-004)
> 4. Connection 토큰으로 Workspace·Connection 권한을 검증한다 (FR-001)
> 5. 재연결 후 Cursor Replay가 동작한다 (FR-007)
> 6. Gap과 Unknown을 표시한다 (FR-008)
> 7. 시뮬레이터 시나리오가 Dashboard v0에 실시간으로 표시된다 (FR-006, FR-030)
> 8. Replay 동일성 테스트를 통과한다 (FR-005)
> 9. RES-002 결과로 Event Schema를 점검했다
> 상태: Backlog · 전제: HQ-003 완료 (ADR-0002·0003·0004 Accepted)
> 경로는 [architecture 통합 노트 N3](../../foundation/architecture.md#n3-monorepo-8-채택-단계적-생성) 기준이며 HQ-003에서 확정된다.
> 각 Task의 Verification은 [quality-gates §3](../../engineering/quality-gates.md#3-위험도별-필수-gate)의 위험도별 필수 Gate를 따른다. 아래에는 Task 고유 확인만 적는다.
> 이 파일은 2026-11-22 명세서 채택에 따라 재작성했다 (이전 버전 `M1-simulated-event-pipeline.md`는 커밋 `1234b4b`).

## 의존성 (Edge 목록 — 각 Task의 Dependencies와 backlog.md가 원천)

| Task | 선행 Task |
|---|---|
| HQ-101 | HQ-003 |
| HQ-102 | HQ-101 (HTTP 전송 모드 검증은 HQ-105 이후) |
| HQ-103 | HQ-101, HQ-104 인터페이스 |
| HQ-104 | HQ-101 |
| HQ-105 | HQ-101, HQ-103, HQ-104 인터페이스, HQ-106 인터페이스 |
| HQ-106 | HQ-104 |
| HQ-107 | HQ-105, HQ-106 |
| HQ-108 | HQ-103, HQ-106 |
| HQ-109 | HQ-107 계약, HQ-108 |
| HQ-110 | 없음 (언제든 병행) |
| HQ-111 | HQ-102, HQ-105, HQ-108, HQ-109 |
| HQ-112 | HQ-102, HQ-105, HQ-107, HQ-109 |

- HQ-101 커밋 후 병렬 가능: HQ-102, HQ-103, HQ-104, HQ-110.
- HQ-104의 저장소 인터페이스와 HQ-106의 적용 인터페이스(타입)를 먼저 커밋하면 HQ-105를 병렬로 진행할 수 있다.
- 처리 흐름: Ingestion(인증 → 검증 → 마스킹 → 멱등 저장, 이때 서버가 `storeSequence` 부여) → 같은 트랜잭션에서 Projection 갱신과 Outbox(알림용) 기록 → Realtime 발행. Projector는 Ingestion이 호출한다. Store는 Projector를 모른다.
- **Replay Cursor는 Event Store의 `storeSequence`다** ([event-schema 통합 노트 N2](../../foundation/event-schema.md#n2-envelope-보완-proposed)). Outbox는 "새 Event가 있다"는 알림 전달용이며, 발행 후 정리할 수 있다. SSE 재연결 Replay는 Event Store에서 읽는다.
- 파일 소유권: NestJS 모듈 디렉터리 단위로 Task가 단독 소유한다. `apps/api`의 루트 모듈, 공용 설정, `package.json`, lockfile, Prisma 스키마 파일 통합은 Coordinator가 소유한다. `packages/contracts`는 하위 디렉터리 단위로 나눈다 (`src/ingestion/` HQ-105, `src/connections/` HQ-103, `src/query/` HQ-107).
- Task 형식에는 명세서 템플릿의 `Interfaces`(Consumes/Produces)와 `Risks` 항목을 추가했다 ([task-protocol](../../agents/task-protocol.md)).

---

### HQ-101 — Event 계약 패키지 (Envelope + MVP Type)
- Status: Backlog · Risk: High · Role: Architect → Worker → Reviewer
- Objective: 모든 컴포넌트가 공유하는 Event Envelope와 MVP Event Type을 Zod 스키마로 확정한다.
- Background: [event-schema](../../foundation/event-schema.md) 본문과 통합 노트 N1~N5, [domain-model 통합 노트 N1](../../foundation/domain-model.md), NFR-006
- Scope: `AgentEvent` Envelope, event-schema N4의 Type별 payload 스키마, `timestampQuality`, `sequence`, `sensitivity`, Agent `observedStatus` 열거형, 유효·무효 샘플 세트, 계약 테스트, payload 크기 상한 상수
- Out of Scope: 저장, 전송, Claude Code 전용 매핑(Phase 2)
- Interfaces: Consumes 없음 / Produces `@agent-hq/events`의 스키마·타입·검증 함수
- Dependencies: HQ-003
- Files Expected to Change: `packages/events/**`, `packages/domain/**`(상태 열거형), `docs/foundation/event-schema.md`(통합 노트에 코드 위치 기록)
- Acceptance Criteria:
  - [ ] 유효 샘플은 모두 통과하고, 무효 샘플은 필드별 사유와 함께 모두 거부된다
  - [ ] 알 수 없는 `type`과 지원하지 않는 `schemaVersion`을 거부한다
  - [ ] TS 타입을 스키마에서 추론한다 (손으로 중복 정의하지 않는다)
- Verification: High 기준 Gate
- Risks: Claude Code 실제 신호와 맞지 않을 수 있다 (RSK-001) → HQ-110 결과로 M1 종료 전에 점검

### HQ-102 — 결정적 시뮬레이터 (테스트용 Source)
- Status: Backlog · Risk: Medium · Role: Worker → Reviewer
- Objective: seed와 시나리오 정의로 같은 Event 스트림을 재현해 Ingestion API로 보내거나 파일로 출력한다.
- Background: FR-006, architecture 통합 노트 N4, event-schema N5
- Scope: 시나리오 3종(단일 Agent / Main+Subagent 위임 / 실패·재시도·Gap 유발), seed·Clock 주입, 순서 섞기·중복 재전송·끊김 모드, Connection 토큰으로 전송, CLI
- Out of Scope: 실제 Runtime 연동, 부하 모드(HQ-112)
- Interfaces: Consumes `@agent-hq/events`, Ingestion API 계약(HQ-105) / Produces CLI
- Dependencies: HQ-101. HTTP 전송 모드의 AC 검증은 HQ-105 이후
- Files Expected to Change: `packages/simulator/**`
- Acceptance Criteria:
  - [ ] seed가 같으면 출력이 바이트 단위로 같다
  - [ ] 생성한 Event가 모두 HQ-101 검증을 통과한다
  - [ ] 파일 출력 모드와 HTTP 전송 모드가 있다
- Verification: Medium 기준 Gate. 같은 seed로 2회 실행한 출력에 diff가 없음
- Risks: 시나리오가 실제 Claude Code와 다르게 생길 수 있다 → HQ-110 이후 시나리오 보정

### HQ-103 — Connection 모델 + 토큰 인증
- Status: Backlog · Risk: High · Role: Worker → Reviewer (+ Security Review)
- Objective: Source가 Connection을 등록해 토큰을 받고, heartbeat로 상태를 보고한다.
- Background: FR-001, FR-009, [security §5](../../engineering/security.md#5-인증--권한--mvp-범위-proposed-res-007-s4), domain-model AgentConnection
- Scope: 로컬 단일 Workspace 시드, Connection 등록 부트스트랩([security §5](../../engineering/security.md#5-인증--권한--mvp-범위-proposed-res-007-s4)의 일회성 등록 코드 방식), 토큰 발급(저장은 해시)·폐기·만료, heartbeat 엔드포인트, Connection 상태 전이, 토큰 검증 Guard(Ingestion에서 사용), `packages/contracts/src/connections/`
- Out of Scope: 사용자 인증, Device Pairing(Phase 2)
- Interfaces: Consumes `@agent-hq/database` / Produces 인증 Guard, `connection.health.changed` Event 발행
- Dependencies: HQ-101, HQ-104 저장소 인터페이스
- Files Expected to Change: `apps/api/src/connections/**`, `packages/contracts/src/connections/**`, 관련 Prisma 스키마 조각(Coordinator가 통합)
- Acceptance Criteria:
  - [ ] 토큰이 없거나, 폐기됐거나, 만료된 요청을 거부한다 (Token expiration/revocation test)
  - [ ] 일회성 등록 코드 없이는 Connection을 등록할 수 없고, 사용한 코드는 다시 쓸 수 없다
  - [ ] 토큰 원문은 DB와 로그에 남지 않는다
  - [ ] heartbeat가 끊기면 Connection 상태가 `degraded` → `disconnected`로 바뀐다 (임계값은 설정)
- Verification: High 기준 Gate (G7 포함)
- Risks: Prisma 스키마 파일을 여러 Task가 같이 건드린다 → 스키마 변경은 Coordinator가 통합한다

### HQ-104 — Event Store + 통합 테스트 Gate(G4) 도입
- Status: Backlog · Risk: High · Role: Worker → Reviewer
- Objective: append-only Event 저장과 Cursor 기반 순차 조회를 제공하고, 통합 테스트 Gate를 처음 도입한다.
- Background: ADR-0002, ADR-0003(Prisma 7.10.x), FR-003~005, security T9
- Scope: 저장소 인터페이스(**먼저 단독 커밋**), Prisma 스키마와 migration, 서버가 부여하는 단조 증가 `storeSequence`(Replay Cursor), Outbox 테이블과 계약(알림용, 발행 후 정리), `(workspaceId, connectionId, idempotencyKey)` 유일 제약, 중복 시 기존 건 참조(`ON CONFLICT DO NOTHING` 계열 — 저장소 계층 안에서만 raw SQL 허용), Cursor 조회, Docker Compose의 테스트용 DB로 G4 실행, quality-gates.md 갱신
- Out of Scope: 삭제 기능(RSK-004 후속 Task), Projection
- Interfaces: Consumes `@agent-hq/events` / Produces `EventStore` 인터페이스(append, readFrom(storeSequence)), `Outbox` 인터페이스
- Dependencies: HQ-101, Docker 실행 승인
- Files Expected to Change: `packages/database/**`, `docs/engineering/quality-gates.md`
- Acceptance Criteria:
  - [ ] update/delete API를 노출하지 않는다
  - [ ] 중복 저장 요청 시 기존 Event를 유지하고 "중복"을 반환한다
  - [ ] 저장소 계약 테스트가 구현과 분리되어 있다
  - [ ] quality-gates.md에 G4가 `Local`로 기록된다
- Verification: High 기준 Gate (G4 포함)
- Risks: Prisma 8 전환 시 raw SQL 부분이 영향을 받는다 (TD-003)

### HQ-105 — Ingestion API
- Status: Backlog · Risk: High · Role: Worker → Reviewer (+ Security Review)
- Objective: Event를 받아 인증·검증·마스킹·멱등 저장하고, Projection 갱신과 Outbox 기록을 한 트랜잭션에서 처리한다.
- Background: FR-001~004, NFR-005, security T2/T3/T8, RSK-002, RSK-005
- Scope: `POST /events:ingest` 계열(단건·배치, path는 계약으로 확정), `packages/contracts/src/ingestion/`, Connection 토큰 Guard(**`workspaceId`·`connectionId`는 토큰에서 가져오고, body 값이 다르면 거부**), 스키마 거부 응답(error envelope 계약), 2차 마스킹, `receivedAt` 부여, 크기 상한·Connection별 rate limit, `127.0.0.1` 기본 바인딩, Host/Origin 검증, Projector 호출, Outbox 기록
- Out of Scope: Projection 로직, Realtime 발행
- Interfaces: Consumes EventStore, Projector 인터페이스, Guard / Produces Ingestion API 계약(문서화)
- Dependencies: HQ-101, HQ-103, HQ-104 인터페이스, HQ-106 인터페이스
- Files Expected to Change: `apps/api/src/ingestion/**`, `packages/contracts/src/ingestion/**`, `docs/foundation/architecture.md`(API 계약 섹션)
- Acceptance Criteria:
  - [ ] 무효 Event 거부(필드별 사유), 중복 미저장, `occurredAt`/`receivedAt` 분리
  - [ ] body의 `workspaceId`·`connectionId`가 토큰과 다르면 거부한다. 저장된 Event에는 항상 `connectionId`가 있다
  - [ ] Secret 패턴이 든 payload를 넣으면 저장본에 원문이 없다 (Secret redaction test)
  - [ ] 잘못된 Host/Origin, 크기·빈도 초과 요청을 명확한 오류로 거부한다
  - [ ] 요청 로그에 payload 원문이 없다
- Verification: High 기준 Gate (G7 포함)
- Risks: 동기 Projection 갱신이 처리량을 낮출 수 있다 → HQ-112에서 측정

### HQ-106 — Projector + Projections + Replay
- Status: Backlog · Risk: High · Role: Worker → Reviewer
- Objective: Event로 `agent_current_state`, `task_current_state`, `connection_health`, Timeline용 Read Model을 만들고, 전체 재생성을 지원한다.
- Background: event-schema §6, domain-model 통합 노트 N1, FR-005, NFR-004, RSK-006
- Scope: 순수 함수 `apply(state, event)`, `sequence`가 있으면 그 순서로 적용, `observedStatus`와 `rawStatus` 보존, `lastSeenAt`, Replay 명령, 적용 인터페이스(**먼저 커밋**)
- Out of Scope: 스냅샷, Gap 판정(HQ-108)
- Interfaces: Consumes EventStore / Produces Projector 인터페이스, Read Model 테이블
- Dependencies: HQ-104
- Files Expected to Change: `apps/api/src/projection/**`, 관련 Prisma 스키마 조각(Coordinator 통합)
- Acceptance Criteria:
  - [ ] 실시간으로 적용한 결과와 처음부터 Replay한 결과가 같다
  - [ ] 같은 세션의 Event가 순서를 바꿔 도착해도 최종 상태가 같다 (`sequence`가 있을 때)
  - [ ] 이벤트가 없다는 이유로 `idle`이 되지 않는다
- Verification: High 기준 Gate

### HQ-107 — Query API + Realtime(SSE, Cursor Replay)
- Status: Backlog · Risk: Medium · Role: Worker → Reviewer
- Objective: Read Model 조회 API와, 재연결 시 Cursor부터 이어 받는 SSE 스트림을 제공한다.
- Background: FR-007, FR-032, ADR-0003(SSE + REST), security T2/T3
- Scope: 조회 엔드포인트(Agent·Task·Connection·Event Cursor 조회), SSE 스트림(Outbox 알림으로 새 Event를 감지하고, `Last-Event-ID` = `storeSequence` 이후를 Event Store에서 읽어 Replay), `packages/contracts/src/query/`, `127.0.0.1` 바인딩, Host/Origin 검증, API 계약 문서화
- Out of Scope: 양방향 제어, 사용자 인증
- Interfaces: Consumes Read Model, Outbox / Produces Query API·SSE 계약
- Dependencies: HQ-105, HQ-106
- Files Expected to Change: `apps/api/src/query/**`, `apps/api/src/realtime/**`, `packages/contracts/src/query/**`, `docs/foundation/architecture.md`(API 계약 섹션)
- Acceptance Criteria:
  - [ ] 연결이 끊긴 동안 생긴 Event를 재연결 후 누락·중복 없이 받는다
  - [ ] 잘못된 Host/Origin의 조회·SSE 요청을 거부한다
  - [ ] API 응답이 계약 문서와 일치한다
- Verification: Medium 기준 Gate + 재연결 통합 테스트(G4)

### HQ-108 — Gap 감지와 Unknown/Stale 표시
- Status: Backlog · Risk: Medium · Role: Worker → Reviewer
- Objective: 누락이 의심되는 구간을 기록하고, 해당 Agent 상태를 Unknown이나 Stale로 표시한다. 누락을 추정으로 채우지 않는다.
- Background: event-schema §8, FR-008, domain-model 통합 노트 N1
- Scope: `sequence` 불연속 감지 → `event.gap.detected` 기록, 명시적 종료 신호 없이 Connection이 끊긴 Agent를 `unknown`으로([domain-model 통합 노트 N1](../../foundation/domain-model.md#n1-agent-상태-정규화-proposed--res-007-s1-해결안-hq-101에서-확정)의 규칙), `staleThreshold` 기반 Stale 표시 속성
- Out of Scope: Runtime 재조회(Reconciliation, Phase 2 이후)
- Interfaces: Consumes Projector, EventStore / Produces Gap Event, Read Model의 stale 표시
- Dependencies: HQ-106, HQ-103
- Files Expected to Change: `apps/api/src/gap-detection/**`
- Acceptance Criteria:
  - [ ] 시뮬레이터 Gap 시나리오에서 `event.gap.detected`가 기록된다
  - [ ] 명시적 종료 신호 없이 Connection이 끊긴 Agent는 `idle`이 아니라 `unknown`으로 표시된다. `agent.disconnected`를 받은 Agent만 `disconnected`가 된다
- Verification: Medium 기준 Gate

### HQ-109 — 개발용 Dashboard v0 (Next.js)
- Status: Backlog · Risk: Medium · Role: Worker → Reviewer
- Objective: 개발자가 Agent Roster·상태·Event Timeline·Connection 상태·Gap/Unknown을 실시간으로 본다. M3 Operations Dashboard의 출발점이다.
- Background: FR-030, FR-032, [ui-ux §4](../../foundation/ui-ux.md), NFR-010, security T5
- Scope: Agent Roster(상태는 아이콘과 텍스트로 함께 표시), Event Timeline, Connection 상태, Unknown/Stale/Gap 표시, SSE 끊김 표시·자동 재연결, CSP
- Out of Scope: 3D, Studio, 제어, Easy Mode, Trace View(M3)
- Interfaces: Consumes Query API·SSE 계약 / Produces 화면
- Dependencies: HQ-107 계약, HQ-108
- Files Expected to Change: `apps/web/**`
- Acceptance Criteria:
  - [ ] 새 Event가 새로고침 없이 반영된다
  - [ ] Agent 콘텐츠가 HTML로 해석되지 않는다 (XSS 테스트 문자열)
  - [ ] 상태를 색상만으로 구분하지 않는다
- Verification: Medium 기준 Gate + 수동 확인 스크린샷

### HQ-110 — 스파이크: Claude Code 신호 조사 (RES-002)
- Status: Backlog · Risk: Low · Role: Architect · 병행 가능
- Objective: Claude Code hook이 제공하는 실제 신호를 확인하고 Event 계약과 M2 설계의 입력을 만든다.
- Background: RSK-001, RSK-009, FR-021, [adapter-spec 통합 노트 N1](../../foundation/adapter-spec.md)
- Scope: 설치된 버전의 공식 문서 확인, scratch 프로젝트의 로깅 hook 실험, hook ↔ Event Type 매핑표, Session/Subagent 식별자 제공 여부, heartbeat 대체 신호, 세션당 Event량. 데이터 처리는 [data-governance N4](../../engineering/data-governance.md#n4-개발-과정의-데이터-즉시-적용)를 따른다.
- Out of Scope: 제품 코드, 샘플 데이터 커밋, 사용자 전역 설정 수정
- Interfaces: Produces `docs/research/RES-002-claude-code-signals.md`
- Dependencies: 없음. scratch 프로젝트의 hook 설정은 승인 후 진행
- Files Expected to Change: `docs/research/RES-002-claude-code-signals.md`, `docs/research/README.md`
- Acceptance Criteria:
  - [ ] adapter-spec §6 초기 범위 ↔ hook 매핑표 (각 항목에 근거)
  - [ ] Event 계약 변경 필요 여부 결론 (필요하면 ADR 제안). HQ-101이 끝났다면 계약과 대조한 결과를 기록한다 (M1 종료 조건 9의 담당)
  - [ ] 수집 파일 삭제 기록
- Verification: Low 기준 Gate

### HQ-111 — E2E: 시뮬레이터 → Ingestion → Dashboard
- Status: Backlog · Risk: Medium · Role: QA → Reviewer
- Objective: M1 파이프라인 전체를 브라우저 테스트로 검증한다.
- Background: M1 종료 조건 7, [testing-strategy](../../engineering/testing-strategy.md)
- Scope: E2E 러너 도입, Compose·서버·시뮬레이터 기동 스크립트, 위임 시나리오·끊김 시나리오 테스트, quality-gates의 G5 갱신
- Out of Scope: 성능 측정, 시각 회귀
- Dependencies: HQ-102, HQ-105, HQ-108, HQ-109, E2E 도구 의존성 승인
- Files Expected to Change: E2E 테스트 디렉터리, 기동 스크립트, `docs/engineering/quality-gates.md`
- Acceptance Criteria:
  - [ ] 위임 시나리오를 실행하면 기대한 Agent 수와 상태가 화면에 표시된다
  - [ ] 끊김 시나리오에서 Unknown과 Gap이 화면에 표시된다
  - [ ] 단일 명령으로 실행되고, quality-gates.md에 G5가 `Local`로 기록된다
- Verification: Medium 기준 Gate + G5

### HQ-112 — 부하 측정 (RES-005)
- Status: Backlog · Risk: Low · Role: QA
- Objective: 명세서 roadmap §13의 측정 항목 중 M1에서 측정 가능한 것을 측정하고, 목표 수치를 제안한다.
- Background: NFR-002, NFR-003, ADR-0002/0003 Revisit Conditions
- Scope: 시뮬레이터 부하 모드, 측정 스크립트, 측정 조건(하드웨어, Event 수, 동시 Agent 수) 기록
- Out of Scope: 최적화 (결과에 따라 별도 Task)
- Dependencies: HQ-102, HQ-105, HQ-107, HQ-109
- Files Expected to Change: `packages/simulator/**`(부하 모드), 측정 스크립트, `docs/research/README.md`, `docs/foundation/requirements.md`
- Acceptance Criteria:
  - [ ] ingestion latency, dashboard update latency, duplicate rate, reconnect recovery를 측정 조건과 함께 기록한다
  - [ ] 측정값으로 NFR 목표 수치를 제안하고, ADR Revisit 조건에 해당하는지 결론을 낸다
- Verification: Low 기준 Gate. 2회 반복 측정해 편차 기록
