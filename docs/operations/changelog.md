# Changelog

> 목적: 저장소 변경 이력 요약 (문서·코드·설정). 커밋 로그보다 상위 수준의 "무엇이 왜 바뀌었나".
> 관리 책임: Documenter. 최신 항목이 위.
> 형식: `## YYYY-MM-DD` 아래 `- [Added|Changed|Deprecated|Removed|Fixed|Security] 내용 (Task/ADR ID)`

## 2026-11-26 (3) — HQ-113 쓰기 경로 최적화 (PR)
- [Changed] Projection 적용을 접근 계층(DB·배치 캐시·메모리)으로 분리해 실시간·배치·Replay가 같은 코드를 씀. Replay는 메모리 fold + 일괄 쓰기(5만 건 269 s → 1.6~3.0 s)
- [Changed] Ingestion 배치: 외부 ID·Read Model 행 캐시, 행당 1회 쓰기(500개 배치 106 → 870~1,173 events/s)
- [Added] 오류 코드 `SERVICE_UNAVAILABLE`(503 + `Retry-After`): Workspace lock 대기 5 s 초과, 연결 풀 소진, 트랜잭션 시간 초과 — Ingestion과 전역 오류 필터
- [Changed] RES-005 §7, ADR-0002 재검토 조건 해소, TD-005·RSK-019 갱신

## 2026-11-26 (2) — HQ-112 부하 측정 (Done, PR #11)
- [Added] 시뮬레이터 부하 모드 `generateLoad`, 측정 스위트 `pnpm measure:load`(Gate 아님), `docs/research/RES-005-load-measurement.md`
- [Changed] RES-005 Concluded, NFR-002a 목표 수치 제안, TD-005·TD-008·RSK-019 실측값, HQ-113·HQ-114 추가
- [Changed] PR #10 참고 의견 반영(review-protocol·changelog·current-status 문구)

## 2026-11-26 — HQ-006 리뷰 흐름 조정 (Done, PR #10)
- [Changed] 위험도 0~3 체계. 로컬 독립 리뷰 필수(위험도 0은 자가 점검), CodeRabbit은 위험도 2~3 PR에서만 요청하고 지적을 수정 작업으로 반영 (quality-gates §3, review-protocol §6)
- [Changed] main 보호 규칙: 필수 check `verify`·`integration`만, 승인 필수 제거. `ready-to-merge.yml`은 `risk:*` 라벨로 판정(라벨 없으면 3)
- [Changed] CLAUDE.md §6: Task 위험도와 같은 값의 PR `risk:*` 라벨 상시 승인(라벨을 낮추는 변경은 건별 승인)

## 2026-11-25 (4) — HQ-110 Claude Code 신호 조사 (Done, PR #9)
- [Added] `docs/research/RES-002-claude-code-signals.md`: 공식 hook 문서 정리, scratch 실험 결과, adapter-spec §6 ↔ hook 매핑, Event 계약 대조(변경 불필요), M2 Bridge 설계 입력
- [Changed] RES-002 Concluded, RSK-001·RSK-009 진행 기록, HQ-109 수동 확인 결과 기록
- [Changed] review-protocol §6: CodeRabbit 자동 리뷰 중단(star 10개 미만 정책) → PR마다 `@coderabbitai review` 댓글로 요청 (사용자 상시 승인)

## 2026-11-25 (3) — HQ-109 Dashboard v0 (Done, PR #8)
- [Added] `apps/web` Dashboard: Agent Roster, Connection, Event Timeline, SSE 상태·재연결, 상태는 아이콘+텍스트
- [Security] CSP·`X-Content-Type-Options`·`Referrer-Policy`·`X-Frame-Options`, Agent 콘텐츠는 텍스트로만 렌더링(XSS 테스트)
- [Added] `/hq-api/*` → API rewrite 프록시(`AGENT_HQ_API_URL`), TD-009, TD-010
- **실행**: `pnpm infra:up` → `pnpm db:migrate` → API(`pnpm --filter @agent-hq/api dev`)와 Web(`pnpm --filter @agent-hq/web dev`) → http://127.0.0.1:3000

## 2026-11-25 (2) — HQ-108 Gap·Unknown·Stale (Done, PR #7)
- [Added] Gap 감지 주기 작업과 HQ 기록 `event.gap.detected`, 연결 끊김 → Agent `unknown`(조회 시 계산), `AgentView.reportedStatus`·`connectionLostAt`·`stale`·`staleThresholdMs`
- [Added] migration `20261125010000_agent_connection_loss` (`agent_current_state.connection_lost_at` nullable 추가)
- [Security] `source.adapterId = "hq"`는 HQ 전용 (Ingestion 403)
- [Fixed] `connection.health.changed`가 Projection 없이 저장되던 문제 (실시간 ≠ Replay 가능성)
- [Added] 환경 변수 `GAP_CHECK_INTERVAL_MS`, `GAP_GRACE_MS`, `STALE_THRESHOLD_MS` (모두 선택). domain-model N5, event-schema N9, TD-008
- **운영 메모**: `pnpm db:migrate`로 migration을 적용한 뒤, 기존 DB에 `connection.health.changed → disconnected` 이벤트가 있으면 `pnpm --filter @agent-hq/api admin replay <workspaceId>`로 Read Model을 다시 만들어야 해당 Agent가 `unknown`으로 반영된다

## 2026-11-25 — HQ-107 Query API + SSE (Done, PR #6)
- [Added] `GET /workspaces/:id/{agents,tasks,connections,events}`, SSE `GET /workspaces/:id/stream`(cursor replay), Outbox relay, 계약 `packages/contracts/src/query/`, architecture N7
- [Added] `packages/database`: `createOutboxStore`, `createQueryStore`
- [Added] 환경 변수 `OUTBOX_POLL_INTERVAL_MS`, `SSE_MAX_STREAMS`, `SSE_KEEP_ALIVE_MS`, `SSE_CATCH_UP_INTERVAL_MS` (모두 선택)
- [Added] TD-007
- **운영 메모**: Outbox 항목은 이제 relay가 신호를 보낸 뒤 삭제한다(알림 용도, 이벤트 자체는 events 테이블에 남는다)

## 2026-11-24 (2) — HQ-105 Ingestion API (Done, PR #5)
- [Added] `POST /events` 배치 Ingestion(원자적, 멱등), 계약 `packages/contracts/src/ingestion/`, architecture N6(API 계약·오류 표)
- [Security] 2차 Secret 마스킹, 전역 Host/Origin Guard(T3), body 4 MiB·이벤트 64 KiB·배치 500개 상한과 Connection별 rate limit(T8), 짝 없는 서로게이트 거부
- [Added] 환경 변수 `API_ALLOWED_HOSTS`, `API_ALLOWED_ORIGINS`, `INGEST_RATE_EVENTS_PER_SECOND`, `INGEST_RATE_BURST_EVENTS` (모두 선택)
- [Added] TD-006, ISS-002. [Changed] RSK-019 측정값, HQ-112 측정 항목
- [Security] 마스킹 정규식을 선형 시간으로 수정(ReDoS, PR #5 리뷰). 마스킹 결과가 이전 커밋과 같아 저장된 이벤트의 내용 해시에는 영향이 없다(아직 머지 전)
- **운영 메모**: Host/Origin 검사는 모든 경로에 적용된다. 브라우저에서 API를 직접 부르려면 그 Origin을 `API_ALLOWED_ORIGINS`에 넣어야 한다

## 2026-11-24 — HQ-106 Projector + Replay (Done, PR #4)
- [Added] Read Model `agent_current_state`, `task_current_state` (migration 2개), 순수 Projector(전순서 비교, 필드별 순서 키), `applyProjections`·`replayProjections`, 관리 CLI `replay`
- [Changed] `EVENT_STORE`를 전역 Infrastructure 모듈과 `apps/api/src/tokens.ts`로 이동
- [Added] event-schema N8(Projection 순서 규칙), domain-model N4(이벤트→상태 매핑), TD-005(Replay가 append를 막음)
- **운영 메모**: `20261124010000_projections`만 적용된 DB에 Read Model 행이 있다면, `20261124020000_projections_scoping` 적용 후 **Read Model 행이 있는 Workspace마다** `pnpm --filter @agent-hq/api admin replay <workspaceId>`로 다시 만든다 (인수를 생략하면 `local`만 처리한다) (이전 행은 orderKeys 형식이 다르고 `last_received_at`이 소스 시각으로 채워짐)

## 2026-11-23 — HQ-004 CI·CodeRabbit (Done)
- [Added] GitHub Actions CI(verify, integration), `.coderabbit.yaml`, `ready-to-merge` 알림 워크플로 (PR #1)
- [Changed] main 브랜치 보호: 필수 check 3개, 승인 1건(CodeRabbit), 새 push 시 승인 무효화
- [Changed] quality-gates: G1·G2·G3·G4·G6 상태 `CI`

## 2026-11-23 — HQ-104 Event Store (Done)
- [Added] EventStore(append·외부 ID 매핑·Outbox, Workspace별 advisory lock), migration 3개, EventStore 계약 테스트, G4 `pnpm test:integration`
- [Added] troubleshooting 2건 (Prisma의 Agent 실행 차단, 잠자기로 인한 멈춤)
- [Security] `events` UPDATE 차단 trigger, Workspace 범위 이벤트 id, lock 대상 Workspace 검증 (리뷰 반영)
- [Added] RSK-019, TD-004

## 2026-11-22 (3) — HQ-003 스캐폴드, HQ-101 Event 계약
- [Added] ADR-0005 Redis + BullMQ 도입 (Accepted), ADR-0006 외부 ID·미정의 필드 처리 (Accepted)
- [Added] pnpm Monorepo: `apps/{api,web}`, `packages/{domain,events,contracts,database,simulator}`, Docker Compose(PostgreSQL 18.7, Redis 8.10.3), Prisma 초기 migration, `pnpm verify`
- [Added] `packages/events` Event 계약(Zod 4) + 계약 테스트, `packages/domain` 상태 집합
- [Added] RSK-018 Redis 라이선스. troubleshooting 3건
- [Changed] quality-gates: G1·G2·G3·G6 `Local`. coding-standards: ESM·`@Inject` 명시·DB 이름 매핑 규칙

## 2026-11-22 (2) — 명세서 통합, HQ-002
- [Added] 기획 명세서 v0.1.0 원본 보존 `docs/research/source/chatgpt-spec-v0.1/` (수정 금지)
- [Added] RES-007 명세서 검토, RES-001 결과(버전·라이선스 확인)
- [Added] ADR-0004 명세서 기준 문서 채택 (Accepted). ADR-0001·0002 Accepted. ADR-0003을 사용자 결정대로 개정해 Accepted
- [Added] foundation: `event-schema.md`, `adapter-spec.md`, `pipeline-spec.md`, `ui-ux.md` (명세서 원문 + 통합 노트)
- [Changed] foundation: `product.md`, `architecture.md`, `domain-model.md`를 명세서 원문 + 통합 노트로 교체. `requirements.md`, `roadmap.md` 재작성 (Phase 구조)
- [Changed] engineering: `security.md`(제품 보안 모델 통합), `data-governance.md`(명세서 + 민감도 등급), `coding-standards.md`(camelCase wire, Monorepo 의존 방향), `testing-strategy.md`(TS-01~10)
- [Changed] tasks: M1을 `M1-event-ingestion-core.md`로 재작성 (HQ-101~112). task-protocol에 Interfaces·Risks 항목 추가
- [Deprecated] 초안 Event Envelope v0(snake_case), Event type v0, M1 Simulated Pipeline 구성 — 이력은 커밋 `1234b4b`
- [Added] RSK-015~017, TD-003. [Fixed] ISS-001 Resolved (첫 커밋 `1234b4b`)

## 2026-11-22 (1) — Harness 구축
- [Added] 프로젝트 지침 `CLAUDE.md`, `README.md` (M0)
- [Added] 문서 체계 `docs/` — foundation, decisions, engineering, agents, operations, research, tasks (M0)
- [Added] ADR-0001 ADR 프로세스 채택 (Proposed — 사용자 지시 기반, 확인 대기), ADR-0002 Event 중심 코어 (Proposed), ADR-0003 M1 기술 스택 (Proposed)
- [Added] 초기 Backlog: M0, M1 Task 상세; M2~M6 개요
- [Added] 초기 Risk/Issue/Research 등록 (RSK-001~014, ISS-001, TD-001~002, RES-001~006)
