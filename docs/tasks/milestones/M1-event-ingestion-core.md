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
- Status: Done (2026-11-22) · Risk: High · Role: Architect → Worker → Reviewer
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
- Verification: High 기준 Gate (G4는 DB 경계가 없어 계약 테스트로 대체)
- Risks: Claude Code 실제 신호와 맞지 않을 수 있다 (RSK-001) → HQ-110 결과로 M1 종료 전에 점검
- Execution Log:
  #### Run 2026-11-22-7
  - agent_id: claude-code:main (Worker), claude-code:subagent:general-purpose (Reviewer, 읽기 전용) · status: succeeded (ADR-0006 승인 대기)
  - result: `packages/events`(Zod 4.6.7) 계약과 `packages/domain` 상태 집합. 계약 테스트 37개 (16개 Type 유효 샘플, 무효 샘플, 하위 호환·콘텐츠 비저장)
  - changed_files: `packages/{domain,events}/**`, `vitest.config.ts`, `docs/foundation/{event-schema,adapter-spec}.md`, `docs/decisions/ADR-0006-*.md`
  - verification: `pnpm verify` exit 0 (테스트 50개). `dist`를 지운 상태에서도 테스트 통과 (Vitest가 `@agent-hq/*`를 소스로 resolve)
  - 리뷰: Request Changes (HQ-003과 합동, Major 3·Minor 8·Nit 4) → 반영. 주요 반영: 미정의 필드 strip+보고, 외부 ID 모델(ADR-0006), 한 번에 모든 문제 보고, 제어 문자·공백 ID 거부, Gap 범위 검증, `sequence` → session 필수, Type별 필수 ID의 타입 반영
  - decisions: ADR-0006 Accepted (2026-11-22 사용자 승인)

### HQ-102 — 결정적 시뮬레이터 (테스트용 Source)
- Status: Done (2026-11-23, PR #2 머지) · Risk: Medium · Role: Worker → Reviewer
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
- Execution Log:
  #### Run 2026-11-23-3
  - agent_id: claude-code:main (Worker), claude-code:subagent:general-purpose (로컬 Reviewer) · status: In Review (PR)
  - result: `packages/simulator` — seed 기반 PRNG(mulberry32)와 시뮬레이션 시계, 시나리오 3종(single-agent, delegation, failure-gap), 전달 옵션(shuffle, duplicateRate, **cutAfter 끊김 모드**), 생성 이벤트 자체 계약 검증, JSON Lines 출력, HTTP 전송(Bearer 토큰, timeout, 배치), CLI `agent-hq-sim`(토큰은 `AGENT_HQ_TOKEN` 환경 변수로만)
  - 로컬 리뷰: 1회차 Request Changes (Major 1: 수용 조건의 끊김 모드 누락. Minor 5, Nit 4) → 전부 반영 → 2회차 Approve (Minor 1, Nit 3 → 반영)
  - 주요 반영: 종료 신호 없는 끊김 모드, Task–Agent 소유 관계와 상위 Task, 이벤트 시각과 일치하는 tool duration, URL 자격 증명 거부, seed 범위 제한, 엄격한 숫자 파싱, fetch timeout
  - verification: `pnpm verify` exit 0 (단위 84개). CLI를 별도 프로세스로 두 번 실행한 출력의 SHA-256이 같음. HTTP 모드의 실서버 검증은 HQ-105 이후
  - AC: 같은 seed → 바이트 동일 ✅ · 모든 이벤트 계약 통과 ✅ · 파일·HTTP 모드 존재 ✅ (HTTP는 가짜 fetch로만 검증)
  - PR #2: CodeRabbit 1차 CHANGES_REQUESTED(Major 2: 리디렉션을 전송 성공으로 처리, 루프백 외 HTTP 평문 토큰 전송. Minor 4: seed별 idempotency 키 분리, startAt 시간대, NaN, M0 상태) → 전부 반영 → APPROVED → 사용자 머지 (`77aef9f`)

### HQ-103 — Connection 모델 + 토큰 인증
- Status: In Review (PR, 2026-11-23) · Risk: High · Role: Worker → Reviewer (+ Security Review)
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
- 범위 변경 (2026-11-23, 구현 중 확정): Coordinator 소유 파일(Prisma 스키마, `app.module.ts`, `config.ts`)도 이 Task에서 함께 수정했다(단일 Worker라 충돌 없음). 추가로 만든 것: `packages/domain/src/connection-health.ts`(상태 전이 순수 함수), `packages/database/src/connection-store.ts`, Event Store 트랜잭션의 `setConnectionStatus`(상태 CAS), `apps/api/src/admin/`(관리 CLI), 전역 오류 envelope 필터(`apps/api/src/http/`). `packages/contracts`에 Zod 의존성 추가(ADR-0003에서 승인된 도구, 워크스페이스에 이미 있는 4.6.7)
- Execution Log:
  #### Run 2026-11-23-4
  - agent_id: claude-code:main (Worker), claude-code:subagent:general-purpose (로컬 Reviewer + 보안 검토) · status: In Review (PR)
  - result: Connection 등록(일회성 등록 코드 → 토큰 1회 발급, DB에는 SHA-256 해시만), `ConnectionTokenGuard`(Workspace·Connection은 토큰에서), heartbeat, 상태 판정(pending → connected ↔ degraded → disconnected, 폐기 → disconnected)과 `connection.health.changed` 이벤트(상태 변경과 같은 트랜잭션), BullMQ 주기 판정, 관리 CLI(`registration-code`, `revoke`), 전역 오류 envelope
  - migration 사고: 처음 만든 `connection_auth` migration이 NOT NULL 컬럼을 기존 행 처리 없이 추가해 행이 있는 DB(통합 테스트 DB)에서 실패했다. 기존 행을 쓸 수 없는 표식 해시로 채우고 폐기 상태로 만드는 방식으로 고쳤다(행이 있는 scratch DB에서 적용 확인). main에 올라가기 전이라 파일 자체를 고쳤다. 테스트 DB(Agent가 만든 테스트 전용)는 다시 만들었고, dev DB는 결과 스키마가 같아 migration 기록의 checksum만 새 파일 값으로 갱신했다
  - 로컬 리뷰: 1회차 Request Changes (Major 2: 폐기가 상태·이벤트에 반영되지 않음, 판정 중 heartbeat가 들어와도 잘못된 상태 이력이 기록되는 경합. Minor 5, Nit 4) → 반영 → 2회차 Approve (Minor 1, Nit 2 → 반영)
  - verification: `pnpm verify` exit 0 (단위 73개), `pnpm test:integration` 33개 통과. 원본 토큰·등록 코드가 모든 테이블 행과 앱 로그에 없음을 테스트로 확인
  - AC: 토큰 없음·폐기·만료 거부 ✅ · 일회성 등록 코드 ✅ · 토큰 원문 DB·로그 미기록 ✅ · heartbeat 끊김 시 degraded → disconnected (임계값 설정 가능) ✅
  - feedback loop: (c) 테스트 부재 — "기존 행이 있는 DB에 migration 적용" 검증이 없었다 → coding-standards §6 Migration 규칙 추가

### HQ-104 — Event Store + 통합 테스트 Gate(G4) 도입
- Status: Done (2026-11-23)
- Objective: append-only Event 저장과 Cursor 기반 순차 조회를 제공하고, 통합 테스트 Gate를 처음 도입한다.
- Background: ADR-0002, ADR-0003(Prisma 7.10.x), FR-003~005, security T9
- Scope: 저장소 인터페이스(**먼저 단독 커밋**), Prisma 스키마와 migration, 외부 ID 매핑 테이블(ADR-0006), 서버가 부여하는 단조 증가 `storeSequence`(Replay Cursor), Outbox 테이블과 계약(알림용, 발행 후 정리), `(workspaceId, connectionId, idempotencyKey)` 유일 제약, 중복 시 기존 건 참조(`ON CONFLICT DO NOTHING` 계열 — 저장소 계층 안에서만 raw SQL 허용), Cursor 조회, Docker Compose의 테스트용 DB로 G4 실행, quality-gates.md 갱신
- Out of Scope: 삭제 기능(RSK-004 후속 Task), Projection
- Interfaces: Consumes `@agent-hq/events` / Produces `EventStore` 인터페이스(append, readFrom(storeSequence)). Outbox는 테이블과 기록만 제공하고, 읽기·정리 인터페이스는 HQ-107로 이동 (리뷰 #5)
- Dependencies: HQ-101, Docker 실행 승인
- Files Expected to Change: `packages/database/**`, `docs/engineering/quality-gates.md`
- Acceptance Criteria:
  - [ ] update/delete API를 노출하지 않는다
  - [ ] 중복 저장 요청 시 기존 Event를 유지하고 "중복"을 반환한다
  - [ ] 저장소 계약 테스트가 구현과 분리되어 있다
  - [ ] quality-gates.md에 G4가 `Local`로 기록된다
- Verification: High 기준 Gate (G4 포함)
- Risks: Prisma 8 전환 시 raw SQL 부분이 영향을 받는다 (TD-003)
- Execution Log:
  #### Run 2026-11-23-1
  - agent_id: claude-code:main · role: Worker · status: In Review
  - result: `packages/database/src/event-store.ts`(`createEventStore`: `transaction`·`readFrom`, append·외부 ID 매핑·Outbox), Prisma 스키마(Connection 기본, AgentInstance·Task 매핑, Event, EventOutbox), migration 3개, EventStore 계약 테스트(`packages/database/test/event-store.contract.ts`)와 PostgreSQL 구현 적용, G4(`pnpm test:integration`)
  - 설계 결정: (1) append 트랜잭션은 Workspace별 `pg_advisory_xact_lock`으로 직렬화한다. 시퀀스 번호와 커밋 순서를 맞춰 Cursor 읽기가 늦게 커밋된 행을 건너뛰지 않게 하기 위해서다. lock을 빼면 해당 계약 테스트가 실패하는 것을 확인했다(mutation test) (2) `(connection_id, workspace_id)` 복합 FK로 다른 Workspace의 Connection 사용을 DB에서 막는다 (3) 같은 idempotency key의 내용이 다르면 `content_hash`로 감지해 `conflict: true`를 돌려준다(덮어쓰지 않음)
  - migration 사고와 처리: 1차 `event_store` migration 폴더를 지운 뒤 다시 만들려 했으나, Prisma가 Claude Code 실행을 감지해 `migrate reset`(dev DB 초기화)을 거부했다. dev DB 초기화는 데이터 삭제라 승인 대상이므로 우회하지 않았다. 대신 같은 스키마 diff로 지운 migration을 재생성했다(checksum이 DB 기록과 일치함을 확인). 이후 변경은 `migrate diff` + `migrate deploy`로 새 migration 2개를 추가했다. dev DB에는 drift가 없다(`migrate diff --from-config-datasource` 결과가 빈 migration)
  - 테스트 DB: `agent_hq_test`는 Agent가 이 테스트용으로 만든 DB이며, 설정 변경 후 한 번 삭제하고 다시 생성했다
  - verification: `pnpm verify` exit 0 (단위 50개), `pnpm test:integration` 11개 통과
  - G8 독립 리뷰 (2026-11-23, 3번째 시도에서 완료): Request Changes (Major 1, Minor 7, Nit 2) → 반영
    - #1 Major: lock 대상 Workspace와 append·매핑 대상 Workspace가 다르면 `WorkspaceMismatchError`
    - #2: 시각은 밀리초 정밀도까지만 계약에서 허용, 저장·해시 전에 정규화 (같은 시각의 다른 표기는 중복으로 판정)
    - #3: 이벤트 `id` 유일성을 `(workspace_id, id)`로 축소 (Workspace 간 충돌·존재 여부 노출 방지)
    - #4: 트랜잭션 `maxWait` 5초·`timeout` 10초 명시, 부하 위험은 RSK-019
    - #5: Outbox 읽기·정리 API는 실제 소비자인 HQ-107 범위로 이동
    - #6: `events` UPDATE를 막는 DB trigger 추가 (DELETE는 RSK-004 보존·삭제 정책용으로 남김)
    - #7: 늦은 커밋 테스트를 sleep 의존에서 barrier 방식으로 교체 (lock 제거 시 여전히 실패 확인)
    - #8: `readFrom` limit 1~1000, cursor ≥ 0 검증
    - #9: 매핑 조회를 SELECT 먼저 → 없을 때만 INSERT로 변경 (매 이벤트마다 쓰기 없음)
    - #10 Nit: DB에서 읽은 JSON의 타입 단언은 유지 → TD-004
  - 추가 migration: `20261123010000_append_only_hardening`
  - verification (반영 후): `pnpm verify` exit 0 (단위 50개), `pnpm test:integration` 16개 통과
  - AC: update/delete 미노출 ✅ · 중복 시 기존 유지+중복 반환 ✅ · 계약 테스트 분리 ✅ · G4 `Local` 기록 ✅ · (원문 AC "DB 파일 0600"은 PostgreSQL Docker 볼륨 구성으로 바뀌어 해당 없음. 데이터는 저장소 밖 Docker 볼륨 `agent-hq_postgres-data`에 있다)

### HQ-105 — Ingestion API
- Status: Backlog · Risk: High · Role: Worker → Reviewer (+ Security Review)
- Objective: Event를 받아 인증·검증·마스킹·멱등 저장하고, Projection 갱신과 Outbox 기록을 한 트랜잭션에서 처리한다.
- Background: FR-001~004, NFR-005, security T2/T3/T8, RSK-002, RSK-005
- Scope: 외부 ID → HQ ID 매핑(`(workspaceId, connectionId, externalAgentId|externalTaskId)` → `agentInstanceId`|`taskId`, ADR-0006), **파싱 결과만 저장·로그(원본 입력 금지)**, `ignoredFields` 집계, `POST /events:ingest` 계열(단건·배치, path는 계약으로 확정), `packages/contracts/src/ingestion/`, Connection 토큰 Guard(**`workspaceId`·`connectionId`는 토큰에서 가져오고, body 값이 다르면 거부**), 스키마 거부 응답(error envelope 계약), 2차 마스킹, `receivedAt` 부여, 크기 상한·Connection별 rate limit, `127.0.0.1` 기본 바인딩, Host/Origin 검증, Projector 호출, Outbox 기록
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
  - [ ] 서로 다른 Connection이 같은 외부 ID를 보내도 서로 다른 AgentInstance로 매핑된다
- Verification: High 기준 Gate (G7 포함)
- Risks: 동기 Projection 갱신이 처리량을 낮출 수 있다 → HQ-112에서 측정

### HQ-106 — Projector + Projections + Replay
- Status: In Review (2026-11-24) · Risk: High · Role: Worker → Reviewer
- Objective: Event로 `agent_current_state`, `task_current_state`, `connection_health`, Timeline용 Read Model을 만들고, 전체 재생성을 지원한다.
- Background: event-schema §6, domain-model 통합 노트 N1, FR-005, NFR-004, RSK-006
- Scope: 순수 함수 `apply(state, event)`, 이벤트 순서는 전순서 규칙(event-schema 통합 노트 N8: 발생 시각 → 세션 → `sequence` → idempotencyKey)으로 판정, `observedStatus`와 `rawStatus` 보존, `lastSeenAt`, Replay 명령, 적용 인터페이스(**먼저 커밋**)
- Out of Scope: 스냅샷, Gap 판정(HQ-108)
- Interfaces: Consumes EventStore / Produces Projector 인터페이스, Read Model 테이블
- Dependencies: HQ-104
- Files Expected to Change: `apps/api/src/projection/**`, 관련 Prisma 스키마 조각(Coordinator 통합)
- Acceptance Criteria:
  - [ ] 실시간으로 적용한 결과와 처음부터 Replay한 결과가 같다
  - [ ] 같은 세션의 Event가 순서를 바꿔 도착해도 최종 상태가 같다 (`sequence`가 있을 때)
  - [ ] 이벤트가 없다는 이유로 `idle`이 되지 않는다
- Verification: High 기준 Gate
- 범위 정리 (2026-11-24): `connection_health`는 HQ-103이 만든 `connections.status`와 `connection.health.changed` 이벤트가 맡으므로 별도 테이블을 두지 않는다. Timeline은 이벤트 로그 자체를 조회하므로 HQ-107(Query API)에서 다룬다. `apply` 인터페이스(`applyProjections(tx, event)`)는 이 Task와 함께 커밋된다(HQ-105가 같은 트랜잭션에서 호출)
- Execution Log:
  #### Run 2026-11-24-1
  - agent_id: claude-code:main (Worker), claude-code:subagent:general-purpose (로컬 Reviewer) · status: In Review
  - result: `agent_current_state`·`task_current_state` Read Model과 migration 2개, `ProjectionTransaction`(이벤트 트랜잭션 안에서 조회·저장), 순수 Projector(`projectAgent`, `projectTask`, `isNewer`), `applyProjections`·`replayProjections`, 관리 CLI `replay`, `EVENT_STORE`를 전역 Infrastructure 모듈로 이동. 테스트에서만 시뮬레이터를 쓰도록 `@agent-hq/simulator` devDependency와 lint 예외 추가
  - 로컬 리뷰 1회차: Request Changes (Major 3: 동률을 도착 순서로 처리, 비교 규칙의 순환, 식별 필드가 늦게 온 이벤트로 지워짐. Minor 6, Nit 1) → 반영: 전순서 비교(event-schema N8), 필드별 순서 키, `lastReceivedAt` 추가, Read Model 복합 FK, 상태 매핑 문서화(domain-model N4), Replay 오프라인 운영 명시(TD-005), 직접 만든 반례 테스트(동률·부분 식별·시계 역행·순환), lint 예외를 원래 목록에서 생성
  - mutation 확인: 비교 함수를 "항상 새로움"으로 망가뜨리면 순서 무관성 테스트 3개가 실패, 동률을 저장 순서로 처리하면 반례 테스트가 실패
  - 로컬 리뷰 2회차: Approve. 남은 지적: Task 범위 문구가 N8과 어긋남 → 수정. 첫 migration으로 만들어진 Read Model 행은 이전 orderKeys 형식 → migration 후 `replay` 필요(changelog 기록, dev DB에는 해당 행 없음 확인). `agent.completed → idle`은 사용자 결정 대기
  - Coordinator 통합 변경: `connections/connection-health.service.ts`는 `EVENT_STORE` import 경로만 바뀜(HQ-103 모듈)
  - verification: `pnpm verify` exit 0 (단위 131개), `pnpm test:integration` 41개 통과

### HQ-107 — Query API + Realtime(SSE, Cursor Replay)
- Status: Backlog · Risk: Medium · Role: Worker → Reviewer
- Objective: Read Model 조회 API와, 재연결 시 Cursor부터 이어 받는 SSE 스트림을 제공한다.
- Background: FR-007, FR-032, ADR-0003(SSE + REST), security T2/T3
- Scope: Outbox 읽기·정리 인터페이스(`packages/database`, HQ-104에서 이동), 조회 엔드포인트(Agent·Task·Connection·Event Cursor 조회), SSE 스트림(Outbox 알림으로 새 Event를 감지하고, `Last-Event-ID` = `storeSequence` 이후를 Event Store에서 읽어 Replay), `packages/contracts/src/query/`, `127.0.0.1` 바인딩, Host/Origin 검증, API 계약 문서화
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
