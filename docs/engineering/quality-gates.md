# Quality Gates

> 목적: 작업 완료 전에 통과해야 하는 검증 단계와 **실제 도입 상태**의 단일 원천.
> 관리 책임: QA. 도구를 도입·변경하면 이 문서의 "상태"와 "명령"을 갱신한다.
> 마지막 확인: 2026-11-27 (HQ-111) — G1~G4·G6은 CI, G5는 로컬 명령(`pnpm test:e2e`)으로 동작한다. G5의 CI 편입은 미정.

## 1. Gate 목록과 상태

| Gate | 목적 | 상태 | 명령 | 도입 Task |
|---|---|---|---|---|
| G1 TypeScript | 타입 오류 0 (패키지, 테스트, 도구 설정, Web) | **CI** | `pnpm typecheck` | HQ-003 |
| G2 Lint/Format | 규칙 위반 0, 의존 방향 규칙 포함 | **CI** | `pnpm lint`, `pnpm format:check` (Markdown은 대상 아님) | HQ-003 |
| G3 Unit Test | 단위 테스트 통과 | **CI** | `pnpm test` (Vitest 5) | HQ-003 |
| G4 Integration Test | 실제 PostgreSQL 통합 | **CI** | `pnpm test:integration` (먼저 `pnpm infra:up`. 테스트 DB `agent_hq_test`를 자동 생성·migrate) | HQ-104 |
| G5 E2E Test | 사용자 시나리오 (시뮬레이터 → Ingestion → Dashboard, 브라우저) | **Local** | `pnpm test:e2e` (Compose 기동 → build → Playwright 1.65.0 Chromium. 처음 한 번 `pnpm exec playwright install chromium`. E2E DB `agent_hq_e2e`·Redis DB 1을 쓰고, API를 테스트마다 4000 포트에 새로 띄우므로 dev API를 먼저 멈춘다. `AGENT_HQ_API_URL`은 비우거나 `http://127.0.0.1:4000`. Docker Compose를 호출하므로 Agent 세션에서는 CLAUDE.md §6 승인 대상) | HQ-111 |
| G6 Build | 배포 산출물 생성 | **CI** | `pnpm build` (tsc -b + next build) | HQ-003 |
| G6b Dependency Audit | 알려진 취약점 | **Not introduced** | — | HQ-003/HQ-004 |
| G7 Security Review | Secret 노출, 입력 검증, 권한 | **Manual** | [security.md 체크리스트](security.md#7-security-review-체크리스트) | 즉시 적용 |
| G8 Code Review | 독립 리뷰 | **Manual** | [review-protocol](../agents/review-protocol.md) (위험도 2~3은 CodeRabbit 포함) | 즉시 적용 |
| G9 Docs Consistency | 링크 오류·문서 모순 | **Manual** | 아래 §4 | 즉시 적용 |

> 상태 값: `Not introduced` | `Manual` | `Local` (로컬 명령 존재) | `CI` (CI에서 강제)
>
> **CI (HQ-004 완료, 2026-11-23)**: `.github/workflows/ci.yml`이 PR과 main push마다 `verify`(G1·G2·G3·G6)와 `integration`(G4)을 실행하며, main 브랜치 보호의 필수 check다. G8에는 CodeRabbit PR 리뷰가 추가되었다. HQ-006(2026-11-26)부터 CodeRabbit 승인은 머지 필수 조건이 아니고, 위험도 2~3 PR에서만 요청해 지적을 반영한다 ([review-protocol §6](../agents/review-protocol.md#6-작업--머지-흐름-2026-11-23-사용자-결정-hq-004)).

## 2. 통합 명령

`pnpm verify` = `typecheck → lint → format:check → test → build` (G1·G2·G3·G6). HQ-003에서 도입했다.
- 전제: Node 26 (`nvm use`). Prisma Client 생성은 `typecheck`·`build`가 먼저 실행한다.
- 부하 측정 `pnpm measure:load`(HQ-112)는 **Gate가 아니다.** 성능 변화를 확인할 때 수동으로 실행한다(`pnpm infra:up` 필요, 통합 테스트 DB를 비운다). 결과 해석은 [RES-005](../research/RES-005-load-measurement.md).
- G4(통합 테스트)는 `pnpm infra:up`으로 PostgreSQL·Redis가 떠 있어야 하며, HQ-104에서 별도 명령으로 추가한다.

## 3. 위험도별 필수 Gate

위험도는 0~3으로 매긴다 (HQ-006, 2026-11-26 사용자 결정. 이전의 Low·Medium·High는 각각 0~1, 2, 3에 해당한다).

| 위험도 | 예 | 필수 Gate | 리뷰 |
|---|---|---|---|
| 0 | 문서만 변경 (단, 규칙·승인·ADR·보안 문서는 최소 1) | G9 | 로컬 자가 점검 |
| 1 | 테스트·작은 수정, 단일 모듈, 동작 변화 작음 | G1, G2, G3, G6 | 로컬 독립 Reviewer. CodeRabbit은 요청하지 않음 |
| 2 | 일반 기능, 여러 모듈, CI·워크플로 | G1, G2, G3, G6 (+ 해당 시 G4) | 로컬 독립 Reviewer + **CodeRabbit 요청, 지적을 수정 작업으로 반영** |
| 3 | Event 스키마, 저장소, migration, 마스킹·보안, 공용 패키지, hook(관찰 대상 Agent에 영향) | 위험도 2 + G4(DB·HTTP 등 외부 경계를 통합하는 Task. 순수 계약·도메인 패키지는 계약 테스트로 대체하고 그 사실을 보고), G7, 해당 시 G5, ADR 확인 | 위험도 2 + 보안 검토 |

Task 작성 시 위험도를 기록하고([task-protocol](../agents/task-protocol.md)), PR에는 같은 값의 `risk:<n>` 라벨을 붙인다([review-protocol §6](../agents/review-protocol.md#6-작업--머지-흐름-2026-11-23-사용자-결정-hq-004)).

## 4. 문서 Gate (G9) 수동 절차
1. 변경한 문서의 상대 링크가 실제 파일을 가리키는지 확인한다.
2. 상태 라벨(Confirmed/Proposed/Unknown)이 ADR 상태와 일치하는지 확인한다.
3. 존재하지 않는 명령·도구를 사용 중인 것처럼 쓰지 않았는지 확인한다 (이 문서 §1과 대조).
4. 같은 내용이 다른 문서에 중복되면 한쪽을 링크로 바꾼다.

> TD-002: 링크 검사 자동화는 HQ-004에서 도입 검토.

## 5. Gate 실패 시
- 실패를 숨기거나 Gate를 끄지 않는다. 실패 출력과 함께 보고한다.
- 2회 이상 같은 원인으로 실패하면 [agent-workflow §7 Feedback Loop](../agents/agent-workflow.md#7-feedback-loop)를 수행한다.
