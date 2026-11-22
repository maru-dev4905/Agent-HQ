# Current Status

> 목적: 프로젝트의 현재 상태와 세션 간 인계. **모든 세션이 시작할 때 읽고, 끝날 때 갱신한다.**
> 관리 책임: Coordinator (매 세션)
> 최종 갱신: 2026-11-22 — Claude Code (HQ-001·HQ-002 수행, 기획 명세서 통합)

## 1. 요약
- 단계: **M1 / Phase 1 Event Ingestion Core — In Progress** (M0 완료, HQ-004·HQ-005는 Backlog)
- 제품 기준 문서: 기획 명세서 v0.1.0 ([ADR-0004](../decisions/ADR-0004-adopt-spec-baseline.md))
- 스택: [ADR-0003](../decisions/ADR-0003-m1-tech-stack.md) + [ADR-0005](../decisions/ADR-0005-adopt-redis-bullmq.md)(Redis + BullMQ). Event 계약 규칙: [ADR-0006](../decisions/ADR-0006-external-ids-and-lenient-payloads.md)
- 로컬 Gate: `pnpm verify` 동작 (G1·G2·G3·G6). CI 없음
- Git: `main`. Task마다 커밋한다 (사용자 승인, push는 매번 승인). 원격 push는 아직 한 번도 하지 않았다

## 2. 진행 중 / 대기
| Task | 상태 | 비고 |
|---|---|---|
| HQ-102 시뮬레이터, HQ-104 Event Store | Ready | HQ-101 완료로 착수 가능 |
| HQ-110 Claude Code 신호 조사 | Backlog | 언제든 병행 가능 (scratch hook 설정은 승인 후) |
| HQ-004 CI, HQ-005 Claude Code 설정 | Backlog | 각각 승인 필요 |

## 3. 사용자 결정 대기
1. 원격 push 여부 (지금까지 로컬 커밋만 있음)
2. 남은 Open Questions: OQ-5(Orca 등 기존 도구와의 관계), OQ-6(MVP 3D 최소 범위), 명세서 Open Decisions
3. HQ-004(CI), HQ-005(프로젝트 `.claude/settings.json`, subagent 정의) 도입 여부

## 4. 인계 사항 (직전 세션 → 다음 세션)
- **Node 26 필요**: 저장소에서 `nvm use`. Agent 셸은 nvm 기본값(24)이 잡히므로 `PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH"`를 앞에 붙인다.
- 로컬 인프라: `pnpm infra:up` (Docker Desktop이 실행 중이어야 한다). 컨테이너 `agent-hq-postgres-1`, `agent-hq-redis-1`.
- 제품·도메인·이벤트·보안·UX는 명세서가 기준이며, 통합 문서의 "통합 노트"가 본문보다 우선한다.
- Source는 외부 ID를 보내고 HQ가 매핑한다 (ADR-0006). 파싱 결과만 저장·로그한다.
- 테스트는 `@agent-hq/*`를 소스에서 읽는다 (`vitest.config.ts` alias). `pnpm lint`·`test`·`typecheck`·`build`는 Prisma Client를 먼저 생성한다.
