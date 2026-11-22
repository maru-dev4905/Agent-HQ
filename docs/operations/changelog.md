# Changelog

> 목적: 저장소 변경 이력 요약 (문서·코드·설정). 커밋 로그보다 상위 수준의 "무엇이 왜 바뀌었나".
> 관리 책임: Documenter. 최신 항목이 위.
> 형식: `## YYYY-MM-DD` 아래 `- [Added|Changed|Deprecated|Removed|Fixed|Security] 내용 (Task/ADR ID)`

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
