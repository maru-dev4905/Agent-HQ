# Current Status

> 목적: 프로젝트의 현재 상태와 세션 간 인계. **모든 세션이 시작할 때 읽고, 끝날 때 갱신한다.**
> 관리 책임: Coordinator (매 세션)
> 최종 갱신: 2026-11-25 — Claude Code (HQ-107 Query API + SSE PR)

## 1. 요약
- 단계: **M1 / Phase 1 Event Ingestion Core — In Progress**. M0 완료(HQ-005는 Backlog)
- 완료: HQ-101 Event 계약, HQ-104 Event Store, HQ-102 시뮬레이터(PR #2), HQ-103 Connection 인증(PR #3), HQ-106 Projector(PR #4), HQ-105 Ingestion API(PR #5). 진행 중: HQ-107 Query API + SSE(PR)
- Gate: CI가 PR마다 `verify`·`integration` 실행. main은 보호됨 (필수 check 3개 + CodeRabbit 승인 1건)
- Git: Task마다 브랜치 → PR → CodeRabbit → 사용자 머지 ([review-protocol §6](../agents/review-protocol.md#6-작업--머지-흐름-2026-11-23-사용자-결정-hq-004))

## 2. 진행 중 / 대기
| Task | 상태 | 비고 |
|---|---|---|
| HQ-107 Query API + SSE | In Review | 브랜치 `hq-107-query-sse`, PR → CodeRabbit |
| HQ-109 Dashboard | Ready 예정 | HQ-107 계약·HQ-108 필요. CORS 또는 같은 Origin 프록시 결정 필요 (architecture N7) |
| HQ-108 Gap/Unknown/Stale | Ready | HQ-105와 독립 (HQ-103·HQ-106 완료) |
| HQ-110 Claude Code 신호 조사 | Backlog | 언제든 병행 가능 (scratch hook 설정은 승인 후) |
| HQ-005 Claude Code 설정 | Backlog | 설정 변경 승인 필요 |

## 3. 사용자 결정 대기
1. 남은 Open Questions: OQ-5(Orca 등 기존 도구와의 관계), OQ-6(MVP 3D 최소 범위), 명세서 Open Decisions
2. HQ-005(프로젝트 `.claude/settings.json`, subagent 정의) 도입 여부
3. PR #4에서 물은 결정: `agent.completed → idle` 매핑(domain-model N4), 세션 내 시계 역행 시 시각 우선(event-schema N8), `apps/api`의 `@agent-hq/simulator` devDependency — 머지로 현재 방식 수용으로 간주, 이의가 있으면 새 Task

## 4. 인계 사항 (직전 세션 → 다음 세션)
- main은 보호되어 직접 push할 수 없다. 모든 변경은 Task 브랜치와 PR로 들어간다. 머지는 사용자만 한다.
- 이제부터 작업 흐름은 [review-protocol §6](../agents/review-protocol.md#6-작업--머지-흐름-2026-11-23-사용자-결정-hq-004)을 따른다 (Task 브랜치 → 로컬 리뷰 → PR → CodeRabbit → 사용자 머지).
- dev DB를 초기화(`prisma migrate reset`)해야 하는 상황이 오면 사용자 승인을 받는다. Prisma도 Agent 실행 시 이를 거부한다.
- **Node 26 필요**: 저장소에서 `nvm use`. Agent 셸은 nvm 기본값(24)이 잡히므로 `PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH"`를 앞에 붙인다.
- 로컬 인프라: `pnpm infra:up` (Docker Desktop이 실행 중이어야 한다). 컨테이너 `agent-hq-postgres-1`, `agent-hq-redis-1`.
- 제품·도메인·이벤트·보안·UX는 명세서가 기준이며, 통합 문서의 "통합 노트"가 본문보다 우선한다.
- Source는 외부 ID를 보내고 HQ가 매핑한다 (ADR-0006). 파싱 결과만 저장·로그한다.
- Query·SSE: `GET /workspaces/local/{agents,tasks,connections,events,stream}`. 계약은 architecture N7. SSE는 `Last-Event-ID`로 이어 받는다.
- Ingestion: `POST /events`, 배치 원자적. 계약은 architecture N6. 전역 Host/Origin Guard가 있어 Web UI(HQ-109)는 `API_ALLOWED_ORIGINS` 설정이 필요하다.
- 테스트는 `@agent-hq/*`를 소스에서 읽는다 (`vitest.config.ts` alias). `pnpm lint`·`test`·`typecheck`·`build`는 Prisma Client를 먼저 생성한다.
