# Current Status

> 목적: 프로젝트의 현재 상태와 세션 간 인계. **모든 세션이 시작할 때 읽고, 끝날 때 갱신한다.**
> 관리 책임: Coordinator (매 세션)
> 최종 갱신: 2026-11-27 — Claude Code (HQ-200 Done, HQ-201 ADR-0007 초안)

## 1. 요약
- 단계: **M2 / Phase 2 Local Bridge & Claude Code Adapter — In Progress** (계획 단계). M1 Done(2026-11-27), M0 완료(HQ-005는 Backlog)
- 완료: HQ-101 Event 계약, HQ-104 Event Store, HQ-102 시뮬레이터(PR #2), HQ-103 Connection 인증(PR #3), HQ-106 Projector(PR #4), HQ-105 Ingestion API(PR #5), HQ-107 Query API + SSE(PR #6), HQ-108 Gap·Unknown·Stale(PR #7), HQ-109 Dashboard v0(PR #8), HQ-110 Claude Code 신호 조사(PR #9), HQ-006 리뷰 흐름 조정(PR #10), HQ-112 부하 측정(PR #11), HQ-113 쓰기 경로 최적화(PR #12), HQ-111 E2E(PR #13), HQ-200 M2 계획(PR #14). 진행 중: HQ-201 ADR-0007(승인 대기)
- Gate: CI가 PR마다 `verify`·`integration` 실행. main 보호: 필수 check는 CI 2개(HQ-006부터 승인 필수 없음)
- Git: Task마다 브랜치 → 로컬 리뷰 → PR(`risk:*` 라벨) → CodeRabbit(위험도 2~3만) → 사용자 머지 ([review-protocol §6](../agents/review-protocol.md#6-작업--머지-흐름-2026-11-23-사용자-결정-hq-004))

## 2. 진행 중 / 대기
| Task | 상태 | 비고 |
|---|---|---|
| HQ-201 ADR-0007 Bridge | Blocked (승인 대기) | PR #15 머지됨, ADR-0007은 아직 Proposed — Accepted는 사용자 승인 |
| HQ-202 Adapter 매핑 | In Review | 브랜치 `hq-202-adapter-claude-code`(PR #16), risk:3 |
| HQ-114 Gap 증분 검사 | Backlog (보류) | 정상 상태 Gap 감지가 충분히 빠름 |
| HQ-005 Claude Code 설정 | Backlog | 설정 변경 승인 필요 |

## 3. 사용자 결정 대기
1. 남은 Open Questions: OQ-5(Orca 등 기존 도구와의 관계), OQ-6(MVP 3D 최소 범위), 명세서 Open Decisions
2. HQ-005(프로젝트 `.claude/settings.json`, subagent 정의) 도입 여부
3. RES-005 NFR 목표 수치 제안(NFR-002a) 확정 여부
4. PR #4에서 물은 결정: `agent.completed → idle` 매핑(domain-model N4), 세션 내 시계 역행 시 시각 우선(event-schema N8), `apps/api`의 `@agent-hq/simulator` devDependency — 머지로 현재 방식 수용으로 간주, 이의가 있으면 새 Task
5. M2: **ADR-0007 승인**(초안 PR), hook 설치 위치, 실제 Claude Code 세션 관찰 동의(HQ-211), Bridge 새 의존성(ADR-0007 제안대로면 없음)

## 4. 인계 사항 (직전 세션 → 다음 세션)
- **M2 시작점**: [M2 파일](../tasks/milestones/M2-local-bridge-claude-code.md). 다음은 HQ-201(ADR-0007 초안, Proposed)과 HQ-202(Adapter 매핑, ADR과 무관하게 병행). Bridge 구현(HQ-203~207)은 ADR-0007 Accepted 뒤에만 시작한다.
- main은 보호되어 직접 push할 수 없다. 모든 변경은 Task 브랜치와 PR로 들어간다. 머지는 사용자만 한다.
- 머지 흐름(HQ-006): PR에 `risk:0`~`risk:3` 라벨. 로컬 독립 리뷰 필수(위험도 0은 자가 점검), CodeRabbit은 위험도 2~3만 `@coderabbitai review`로 요청(자동 리뷰 꺼짐, 사용량 한도 주의). main 보호는 CI 필수만.
- 이제부터 작업 흐름은 [review-protocol §6](../agents/review-protocol.md#6-작업--머지-흐름-2026-11-23-사용자-결정-hq-004)을 따른다 (Task 브랜치 → 로컬 리뷰 → PR + `risk:*` 라벨 → CodeRabbit(위험도 2~3만) → 사용자 머지).
- dev DB를 초기화(`prisma migrate reset`)해야 하는 상황이 오면 사용자 승인을 받는다. Prisma도 Agent 실행 시 이를 거부한다.
- **Node 26 필요**: 저장소에서 `nvm use`. Agent 셸은 nvm 기본값(24)이 잡히므로 `PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH"`를 앞에 붙인다.
- 로컬 인프라: `pnpm infra:up` (Docker Desktop이 실행 중이어야 한다). 컨테이너 `agent-hq-postgres-1`, `agent-hq-redis-1`.
- 제품·도메인·이벤트·보안·UX는 명세서가 기준이며, 통합 문서의 "통합 노트"가 본문보다 우선한다.
- Source는 외부 ID를 보내고 HQ가 매핑한다 (ADR-0006). 파싱 결과만 저장·로그한다.
- Query·SSE: `GET /workspaces/local/{agents,tasks,connections,events,stream}`. 계약은 architecture N7. SSE는 `Last-Event-ID`로 이어 받는다.
- Ingestion: `POST /events`, 배치 원자적. 계약은 architecture N6. 전역 Host/Origin Guard가 있다. Web UI는 Next.js rewrite 프록시(`/hq-api/*`)로 같은 Origin에서 부르므로 GET·SSE에는 `API_ALLOWED_ORIGINS` 설정이 필요 없다(향후 브라우저 POST는 Origin이 붙으므로 필요, architecture N7).
- E2E(G5): `pnpm test:e2e`. 처음 한 번 `pnpm exec playwright install chromium`. API를 4000 포트에 직접 띄우므로 dev API(`pnpm dev:api`)를 먼저 멈춘다. E2E DB `agent_hq_e2e`, Redis DB 1.
- 테스트는 `@agent-hq/*`를 소스에서 읽는다 (`vitest.config.ts` alias). `pnpm lint`·`test`·`typecheck`·`build`는 Prisma Client를 먼저 생성한다.
