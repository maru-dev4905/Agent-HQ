# Changelog

> 목적: 저장소 변경 이력 요약 (문서·코드·설정). 커밋 로그보다 상위 수준의 "무엇이 왜 바뀌었나".
> 관리 책임: Documenter. 최신 항목이 위.
> 형식: `## YYYY-MM-DD` 아래 `- [Added|Changed|Deprecated|Removed|Fixed|Security] 내용 (Task/ADR ID)`

## 2026-11-24 — HQ-106 Projector + Replay (PR)
- [Added] Read Model `agent_current_state`, `task_current_state` (migration 2개), 순수 Projector(전순서 비교, 필드별 순서 키), `applyProjections`·`replayProjections`, 관리 CLI `replay`
- [Changed] `EVENT_STORE`를 전역 Infrastructure 모듈과 `apps/api/src/tokens.ts`로 이동
- [Added] event-schema N8(Projection 순서 규칙), domain-model N4(이벤트→상태 매핑), TD-005(Replay가 append를 막음)
- **운영 메모**: `20261124010000_projections`만 적용된 DB에 Read Model 행이 있다면, `20261124020000_projections_scoping` 적용 후 `pnpm --filter @agent-hq/api admin replay`로 다시 만든다 (이전 행은 orderKeys 형식이 다르고 `last_received_at`이 소스 시각으로 채워짐)

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
