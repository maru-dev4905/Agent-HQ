# Subagent Roles

> 목적: 역할별 책임, 입력·출력, 호출 기준 정의.
> 관리 책임: Coordinator. 상태: **즉시 적용**.
> 역할은 "논리적 역할"이다. 하나의 세션이 여러 역할을 순차로 맡을 수 있으나, **Reviewer는 구현자와 다른 Agent 인스턴스**여야 한다.

## 1. 역할

| 역할 | 책임 | 입력 | 출력 | 수정 권한 |
|---|---|---|---|---|
| **Coordinator** | 계획, Task 분해, 의존성 확인, 배정, 통합, 최종 보고 | 사용자 요청, current-status | 계획, 지시서, 통합 결과, 보고 | 공용 파일, 상태 문서 |
| **Architect** | 설계, 기술 타당성, 대안 분석, ADR 제안 | 요구사항, 기존 ADR | 설계 문서 변경안, Proposed ADR | foundation/, decisions/ |
| **Worker** | 할당 Task 구현, 테스트 작성, 변경 보고 | 지시서 | 코드·테스트, 작업 보고 | 지시서의 파일 목록만 |
| **Reviewer** | 독립 검토: 품질, 구조, 예외 처리, 보안, 테스트 누락 | diff, Task, AC | 리뷰 보고 ([review-protocol](review-protocol.md)) | 없음 (읽기 전용) |
| **QA** | 테스트 수행, 회귀 테스트, AC 확인 | Task, 빌드 결과 | 검증 보고 | 테스트 파일 (지시 시) |
| **Documenter** | 문서 갱신, ADR·이슈 기록, 변경 정리 | 작업 보고 | 문서 변경 | docs/ |

## 2. 규모·위험도별 역할 구성

| Task 유형 (위험도, [quality-gates §3](../engineering/quality-gates.md#3-위험도별-필수-gate)) | 구성 |
|---|---|
| 0 (문서만) | Coordinator가 직접 수행 + 자가 점검 |
| 1 (작은 코드 수정, 단일 모듈) | Coordinator 또는 Worker → **Reviewer(독립)** |
| 2 (일반 기능, CI·워크플로) | Coordinator → Worker → Reviewer(독립) → PR에서 CodeRabbit 지적 반영 |
| 3 (스키마, 저장소, 보안, hook) | Architect(설계/ADR) → 사용자 승인 → Worker → Reviewer(독립, 보안 검토 포함) + QA → Documenter → PR에서 CodeRabbit 지적 반영 |
| 조사 (Research) | Architect 또는 탐색 subagent → 결과를 research/에 기록 |

모든 역할을 항상 실행하지 않는다.

## 3. 실행 수단 매핑 (Proposed)

| 역할 | 기본 수단 | 대안 |
|---|---|---|
| Coordinator | 사용자가 직접 대화하는 Claude Code 세션 | — |
| Architect | 같은 세션 또는 Claude Code subagent(Plan 계열) | Orca worker |
| Worker | 같은 세션(단일 Task) / Orca worker `new-child` worktree(병렬) | Claude Code subagent (쓰기 Worker 1개일 때) |
| Reviewer | Claude Code subagent (새 컨텍스트) | Orca worker(다른 모델, 예: Codex 교차 리뷰) |
| QA | 같은 세션 또는 subagent | Orca worker |
| Documenter | 같은 세션 | subagent |

> 프로젝트 전용 subagent 정의 파일(`.claude/agents/*.md`)은 아직 없다. 역할별 정의 파일 작성은 HQ-005에서 제안한다 (설정 변경 → 승인 필요).

## 4. 역할 간 인계 규칙
- Worker → Reviewer: Task ID, diff 범위(커밋 또는 파일 목록), 실행한 Gate 결과, 알려진 한계.
- Reviewer → Coordinator: 리뷰 보고. Reviewer는 직접 수정하지 않는다.
- 발견된 결함 수정은 원래 Worker에게 되돌린다 (Coordinator가 직접 고치지 않는 것이 원칙, 단 위험도 0~1은 예외).
