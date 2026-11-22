# Task Protocol

> 목적: Task의 형식, 상태 전이, 분해 기준, Worker 지시서 형식 정의.
> 관리 책임: Coordinator. 상태: **즉시 적용**.
> Task 목록 위치: [tasks/backlog.md](../tasks/backlog.md) (요약) + `tasks/milestones/<M>.md` (상세).

## 1. Task 형식

```markdown
### HQ-XXX — <Title>
- Status: Backlog | Ready | In Progress | Blocked | In Review | Done
- Risk: Low | Medium | High
- Role: <배정 역할/Agent>
- Objective: <이 Task가 끝나면 무엇이 가능해지는가 — 한두 문장>
- Background: <왜 필요한가, 관련 FR/ADR/Issue>
- Scope: <할 일>
- Out of Scope: <하지 않을 일>
- Dependencies: <선행 Task ID, ADR 승인, 사용자 결정>
- Files Expected to Change: <경로 목록 — 파일 소유권 선언>
- Acceptance Criteria:
  - [ ] AC1 <관찰 가능한 결과>
- Verification Steps:
  1. <실행할 명령 또는 확인 절차와 기대 결과>
- Execution Log: (실행 시 추가 — [agent-workflow §6](agent-workflow.md#6-observability-작업-추적))
```

## 2. 상태 전이

```text
Backlog ──(요구·AC 명확, 의존성 해소)──▶ Ready ──(착수)──▶ In Progress
In Progress ──(구현·Gate 통과)──▶ In Review ──(리뷰 통과 + AC 확인)──▶ Done
Backlog/Ready/In Progress/In Review ──(외부 요인)──▶ Blocked ──(해소)──▶ 이전 상태
In Review ──(결함)──▶ In Progress
```

- **Ready 조건 (Definition of Ready)**: Objective, Scope/Out of Scope, AC, Verification Steps, Files Expected to Change가 채워져 있고 Dependencies가 해소됨.
- **Done 조건 (Definition of Done)**: 모든 AC 충족, 위험도별 필수 Gate 통과([quality-gates §3](../engineering/quality-gates.md#3-위험도별-필수-gate)), 리뷰 통과(Medium 이상), 관련 문서 갱신, Execution Log 기록. **커밋 여부는 Done 조건이 아니지만 미커밋 상태를 보고에 명시**한다.
- Blocked 시 사유와 해제 조건을 적는다. Agent가 할 일이 남아 있으면 Blocked가 아니다. 사용자 결정을 **요청한 뒤** 대기하는 상태가 Blocked다.
- Verification Steps에는 위험도별 필수 Gate([quality-gates §3](../engineering/quality-gates.md#3-위험도별-필수-gate))를 그대로 적거나 "quality-gates §3 <위험도> 기준"으로 링크한다. 일부만 골라 적지 않는다.
- 의존성은 [backlog.md](../tasks/backlog.md)와 milestone 파일에 같은 내용으로 적는다. 사용자 승인 의존성도 포함한다.

## 3. 분해 기준
다음 중 하나라도 해당하면 나눈다:
- AC가 6개를 넘는다
- 서로 다른 패키지(컴포넌트) 3개 이상을 수정한다
- 계약(스키마/API) 정의와 그 구현이 한 Task에 섞여 있다 → 계약 Task를 먼저 분리
- 하나의 세션에서 끝내기 어렵다고 예상된다

## 4. Worker 지시서 (Dispatch Spec)

Claude Code subagent 프롬프트, Orca `worker-start --spec-file`의 내용으로 동일하게 사용한다. 자기완결적이어야 한다.

```markdown
# Task HQ-XXX — <Title>
## 목표
<Objective>
## 반드시 읽을 문서
- CLAUDE.md
- docs/tasks/milestones/<M>.md 의 HQ-XXX 항목
- <관련 문서 경로#섹션>
## 수정 가능 파일 (이 외 수정 금지)
- <경로>
## 금지 사항
- 커밋/푸시, 의존성 추가, 범위 밖 파일 수정, ADR 확정
## 완료 증거 (보고에 포함)
- 실행한 명령과 결과 (Verification Steps)
- 변경 파일 목록
- AC별 충족 여부
## 실패 처리
- <non-zero exit가 Task 실패인지, 결과 수집 자체가 산출물인지 명시>
- 범위 밖 수정이 필요하면 멈추고 질문한다
## 보고 형식
CLAUDE.md §8 작업 보고 형식
```

## 5. Task 생성 규칙
- Agent는 작업 중 발견한 후속 작업을 Backlog 상태로 추가할 수 있다. Ready로 올리는 것은 Coordinator.
- 마일스톤 범위를 바꾸는 Task 추가는 사용자에게 보고한다.
