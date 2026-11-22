# Agent Workflow — Harness Engineering

> 목적: AI Agent가 맥락을 잃지 않고, 충돌 없이, 검증 가능한 방식으로 작업하기 위한 실행 환경 규칙.
> 관리 책임: Coordinator. 규칙 변경은 사용자 승인. 상태: **즉시 적용** (도구 강제 항목은 별도 표시).
> 관련: [subagent-roles](subagent-roles.md) · [task-protocol](task-protocol.md) · [review-protocol](review-protocol.md) · [orca-cli](orca-cli.md) · [security](../engineering/security.md)

## 1. 실행 수단 (2026-11-22 확인)

| 수단 | 무엇인가 | 작업 공간 | 언제 쓰는가 |
|---|---|---|---|
| Claude Code 단일 세션 | 현재 세션이 직접 작업 | 현재 디렉터리 | 기본값. 작은 Task, 순차 작업 |
| Claude Code subagent (Agent tool) | 세션 내부에서 띄우는 보조 Agent. 결과만 상위로 반환 | **같은 작업 트리 공유** | 조사·탐색·독립 리뷰처럼 파일을 쓰지 않거나 수정 범위가 겹치지 않는 일 |
| Orca worker (`orca orchestration worker-start`) | Orca가 관리하는 별도 Agent(Claude, Codex 등), Run/Task/메시지 추적 | `--worktree current`(공유) 또는 `new-child`(별도 git worktree) | 다른 종류의 Agent가 필요할 때, 별도 작업 공간이 필요한 병렬 구현, 사용자가 진행 상황을 Orca UI로 보고 싶을 때 |

설치 버전: Claude Code 2.1.330, Orca 1.4.256. 명령 세부는 [orca-cli.md](orca-cli.md).

## 2. Context Management

### 2.1 작업 전 읽기 (계층형 로딩)
1. **항상**: `CLAUDE.md` → `operations/current-status.md` → 대상 Task
2. **작업 유형별**: CLAUDE.md §3 표에 따른 문서만
3. **필요 시**: 관련 ADR, Issue/Risk 항목 (ID로 찾아 해당 항목만)

전체 `docs/`를 한 번에 읽지 않는다.

### 2.2 작업별 컨텍스트 전달
- Worker/subagent에게는 **대화 맥락이 아니라 자기완결적 지시서**를 준다 ([task-protocol §4](task-protocol.md#4-worker-지시서-dispatch-spec)). 지시서에는 목표, 수정 가능 파일, 금지 사항, 완료 증거, 읽어야 할 문서 경로가 들어간다.
- 문서 내용을 붙여 넣지 말고 **경로와 섹션**을 준다 (Worker가 직접 읽음 → 최신본 보장).

### 2.3 컨텍스트 비대화 방지
- 대량 탐색(여러 파일 검색, 로그 분석)은 subagent에 맡기고 **결론만** 받는다.
- 긴 명령 출력은 필요한 부분만 읽는다 (`head`, `grep`, 범위 지정).
- 한 세션에서 여러 Task를 연달아 할 때 Task 사이에 current-status를 갱신해 두면, 컨텍스트 요약이 일어나도 복구할 수 있다.
- 문서가 300줄을 넘으면 분할을 검토한다 (Documenter).

### 2.4 작업 종료 시 인계 (Handoff)
세션 종료 전 [current-status.md](../operations/current-status.md)의 "인계 사항"을 갱신한다:
- 무엇을 끝냈고 무엇이 남았는가 (Task ID 기준)
- 진행 중 Task의 현재 상태와 다음 단계
- 미커밋 변경 파일 목록
- 새로 발견한 Issue/Risk/Debt ID
- 사용자 결정 대기 항목

## 3. Execution Control

### 3.1 Coordinator와 Worker 책임
| 역할 | 책임 | 하지 않는 것 |
|---|---|---|
| Coordinator | 계획, 분해, 의존성 분석, 파일 소유권 배정, 통합, 최종 보고, 사용자와 소통 | 다른 Worker 소유 파일 동시 수정 |
| Worker | 지시서 범위 내 구현·테스트, 결과·증거 보고 | 범위 밖 수정, 스스로 범위 확장, ADR 확정, 커밋(승인 없이) |

### 3.2 Subagent/Worker 생성 기준
생성한다:
- 작업이 독립적이고, 결과를 요약으로 받을 수 있을 때 (조사, 리뷰)
- 계약이 확정된 구현 작업을 병렬화할 때
- 독립성이 필요할 때 (Reviewer ≠ 구현자)
- 다른 Agent 종류가 필요할 때 (예: Codex의 교차 리뷰 → Orca worker)

생성하지 않는다:
- 순차 의존이 강한 작은 작업 (컨텍스트 재구성 비용이 더 큼)
- 지시서를 자기완결적으로 쓸 수 없을 만큼 요구가 불명확할 때 → 먼저 Task를 명확히 한다

종료 기준: 완료 증거를 보고했거나, 실패를 보고했거나, Coordinator가 중단을 결정했을 때. 응답 없음/타임아웃만으로 종료를 단정하지 않는다 ([orca-cli §5](orca-cli.md#5-주의-사항)).

### 3.3 병렬 실행 조건 (모두 충족 시에만)
1. Task 간 의존성이 없거나, 의존 대상의 **계약(타입/스키마/API)이 확정·커밋**되었다.
2. Worker별 **수정 가능 파일 집합이 서로 겹치지 않는다** (공용 파일 — `package.json`, lockfile, 공용 타입 — 은 Coordinator 단독 소유).
3. 같은 작업 트리를 공유하는 경우(subagent, `--worktree current`) 동시에 쓰는 Worker는 1개만 둔다. 2개 이상 쓰기 Worker는 별도 worktree(`new-child`)를 쓴다.
4. 각 Worker의 완료 증거가 정의되어 있다.

### 3.4 파일 충돌 방지
- Task의 `Files Expected to Change`가 소유권 선언이다. 범위 밖 파일이 필요하면 Worker는 수정하지 말고 Coordinator에 요청(`orca orchestration ask` 또는 보고)한다.
- 통합 시 Coordinator는 `git diff --stat`으로 선언 범위와 실제 변경을 대조한다. 범위 밖 변경은 되돌릴지 사용자와 상의한다.

### 3.5 실패 복구
| 상황 | 대응 |
|---|---|
| Gate 실패 | Worker가 수정 후 재시도 (같은 Task 내 최대 2회). 이후 Blocked + Issue 기록 |
| Worker 범위 이탈 | 변경을 통합하지 않고 Coordinator가 diff 검토, 필요 시 재지시 |
| Worker 무응답/불명 상태 | 강제 종료를 단정하지 않는다. 상태를 확인하고 사용자에게 보고 |
| 잘못된 변경이 작업 트리에 반영됨 | 파괴적 명령(`reset --hard` 등) 대신 해당 파일만 복구 제안 → 사용자 승인 |
| 설계 가정이 틀린 것으로 판명 | 작업 중단, Issue 기록, 관련 ADR 재검토 요청 |

### 3.6 사용자 승인이 필요한 작업
[CLAUDE.md §6](../../CLAUDE.md)이 단일 원천이다. Orca를 쓸 때는 Decision Gate(`orca orchestration gate-create`)로 승인 대기를 Task에 묶을 수 있다.

## 4. Tool Governance
[security.md §1~§3](../engineering/security.md)이 단일 원천이다 (CLI 권한 분류, MCP 사용 기준, 외부 서비스, Secret, 위험 명령).
요약: 읽기 자유 / Scope 내 로컬 변경 허용 / 커밋·설치·설정·외부 연결은 승인 / 파괴적 명령 금지.

강제 수단 현황:
| 수단 | 상태 |
|---|---|
| 문서 규칙 (CLAUDE.md, security.md) | 적용 |
| 프로젝트 `.claude/settings.json` 권한 deny/ask | **없음** — HQ-005 (승인 필요) |
| Claude Code hooks로 위험 명령 차단 | **없음** — HQ-005에서 검토 |
| CI에서 Gate 강제 | **없음** — HQ-004 |

> 참고(확인 사실): 사용자 전역 `~/.claude/settings.json`에는 Orca와 iTerm2가 설치한 hook(PreToolUse/PostToolUse/PermissionRequest/Notification 등)이 이미 존재한다. 프로젝트 hook을 추가할 때 이들과 충돌하지 않게 한다 ([RSK-009](../operations/risks.md)).

## 5. Quality Gates
[quality-gates.md](../engineering/quality-gates.md)가 단일 원천이다. Worker는 위험도별 필수 Gate를 실행하고 **실행 명령과 결과**를 보고한다. Gate가 아직 없으면 "미도입으로 미실행"이라고 명시한다.

## 6. Observability (작업 추적)

모든 Task 실행은 milestone 파일의 해당 Task 아래 **Execution Log**에 다음 레코드를 남긴다.

```markdown
#### Run <YYYY-MM-DD>-<n>
- task_id: HQ-101
- agent_id: <claude-code:main | claude-code:subagent:<type> | orca:<dispatch_id>>
- role: Worker | Reviewer | ...
- status: started | succeeded | failed | blocked | cancelled
- started_at / ended_at: <ISO-8601>
- result: <한 줄 요약>
- failure_reason: <실패 시>
- changed_files: <목록>
- verification: <Gate: 명령 → 결과>
- decisions: <ADR ID / 없음>
```

- Orca worker를 쓴 경우 `orca orchestration run-show`, `task-list`의 ID를 함께 기록한다 (Orca가 1차 기록, 문서는 요약).
- 이 레코드 필드는 Agent HQ의 Event 모델(`session.*`, `task.*`)과 의도적으로 대응시켰다. 향후 이 프로젝트 자신의 개발 과정을 Agent HQ로 관찰(dogfooding)할 수 있다 (Proposed).

## 7. Feedback Loop

같은 실수가 반복되지 않게 한다.

1. **기록**: 실패·재작업이 발생하면 원인을 Execution Log에 쓴다.
2. **분류**: 원인이 (a) 지시서 불명확 (b) 문서 누락/오류 (c) 테스트 부재 (d) 도구/환경 (e) Agent 판단 오류 중 무엇인지 표시.
3. **조치 (2회 반복 시 필수)**:
   - (a) → task-protocol 템플릿 보완
   - (b) → 해당 문서 수정 + changelog
   - (c) → 회귀 테스트 추가 Task 생성
   - (d) → troubleshooting.md에 해결법 기록
   - (e) → CLAUDE.md 또는 관련 규칙에 명시적 규칙 추가 (사용자 승인)
4. **확인**: 마일스톤 종료 시 Execution Log의 실패 원인을 훑어 규칙 개선 Task를 만든다 (Milestone Retrospective).
