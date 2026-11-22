# Orca CLI — 확인된 사용 방식

> 목적: 이 프로젝트에서 사용하는 Orca CLI 명령과 패턴. **실제 설치 버전에서 `--help`로 확인한 것만** 기록한다.
> 관리 책임: Coordinator. Orca 업데이트 시 재확인한다.
> 확인 일자: 2026-11-22 · 버전: `orca` 1.4.256 (`/Applications/Orca.app/Contents/Resources/bin/orca`) · runtime 상태: ready

## 1. 이 저장소의 Orca 등록 상태 (확인)

| 항목 | 값 |
|---|---|
| repo 등록 | 예 (`orca repo list`에 `Agent-HQ` 존재) |
| projectId | `github:maru-dev4905/agent-hq` |
| 현재 worktree branch | `refs/heads/main` (커밋 없음, head = 0000…) |

## 2. 최신 가이드 불러오기 (필수)

Orca 사용 전, 설치된 바이너리에 맞는 가이드를 읽는다. 이 문서보다 우선한다.

```bash
orca skills get orchestration          # 조정(coordinator)·worker 규칙
orca skills get orca-cli               # worktree, terminal 제어
orca <command> --help                  # 개별 명령 플래그
```

## 3. 확인된 명령 (1.4.256)

| 목적 | 명령 |
|---|---|
| 상태 확인 | `orca status` |
| 현재 worktree 확인 | `orca worktree current` |
| worktree 목록/요약 | `orca worktree list`, `orca worktree ps` |
| Worker 시작 | `orca orchestration worker-start --spec-file <path> --worktree current\|new-child --agent <claude\|codex\|…> [--task-title <t>] [--name <n>] [--deps <json>] [--keep-open]` |
| Worker에 메시지 | `orca orchestration send --to dispatch:<dispatch_id> --subject "<s>" --body "<b>"` |
| 질문에 답장 | `orca orchestration reply --id <message_id> --body "<b>"` |
| Worker 조회 | `orca orchestration worker-show`, `worker-read --source auto`, `worker-list` |
| Worker 중지 | `orca orchestration worker-stop` (사용 전 recovery 가이드 확인) |
| Task DAG | `orca orchestration task-create --spec-file <p> [--deps <json_array>]`, `task-list`, `task-update` |
| 승인 대기 Gate | `orca orchestration gate-create --task <id> --question "<q>" [--options <json>]`, `gate-resolve`, `gate-list` |
| Run 조회 | `orca orchestration run-list`, `run-show`, `inbox` |

Worker(피호출자) 측 규칙: Task/Dispatch ID가 포함된 지시를 받은 Agent는 `orca skills get orchestration`의 worker 규칙을 따른다(질문은 `ask`, 완료는 `worker_done`).

## 4. 프로젝트 사용 패턴 (Proposed)

### 4.1 병렬 구현 (계약 확정 후)
1. Coordinator가 Task별 지시서를 `docs/`가 아닌 scratch 경로에 작성 ([task-protocol §4](task-protocol.md#4-worker-지시서-dispatch-spec)).
2. 쓰기 Worker가 2개 이상이면 각자 `--worktree new-child --name hq-<task>`로 분리.
3. 모든 Worker를 시작한 뒤 턴을 종료한다 — Orca가 완료 시 Coordinator를 깨운다 (**폴링 스크립트 금지**).
4. 각 worktree 결과를 Reviewer가 검토 → Coordinator가 사용자 승인 후 통합.

### 4.2 교차 리뷰
`--worktree current --agent codex`로 읽기 전용 Reviewer를 띄우고, 지시서에 "수정 금지, review-protocol 형식으로 보고"를 명시한다.

### 4.3 승인 대기
ADR 승인 같은 사용자 결정은 `gate-create`로 해당 Task를 막아 둔다. Gate 해제(`gate-resolve`)는 사용자 답을 받은 뒤에만 한다.

## 5. 주의 사항
- **커밋이 없는 저장소에서는 `new-child` worktree를 만들 수 없을 것으로 본다.** 빈 저장소에서 `git worktree add`가 `fatal: not a valid object name: 'HEAD'`로 실패하는 것은 확인했다(2026-11-22, scratch 저장소). Orca를 거쳤을 때의 동작은 직접 실행해 보지 않았다. 첫 커밋(HQ-001) 전에는 `--worktree current`만 사용한다 → [ISS-001](../operations/issues.md).
- `--worktree current` Worker는 Coordinator와 **같은 작업 트리**를 쓴다. 쓰기 Worker는 1개만.
- Worker의 터미널에 직접 입력해 조종하지 않는다. `send`를 쓴다.
- 침묵·타임아웃만으로 Worker가 종료되었다고 판단하지 않는다.
- `worker-start` 실패 시 재실행하지 말고 출력의 `failedStage`를 확인한 뒤 `orca skills get orchestration --reference references/recovery-and-cleanup.md`를 따른다.
- `--model`은 사용자가 지정했을 때만 준다.
- Orca는 사용자 전역 Claude Code 설정에 hook을 설치해 Agent 상태를 수집한다 (확인: `~/.claude/settings.json`). 프로젝트 hook과의 공존을 고려한다 ([RSK-009](../operations/risks.md)).

## 6. 미확인 (Unknown)
- 저장소 단위 Orca 설정 파일(`orca.yaml`의 setup hook, environment recipe 등)을 이 프로젝트에 둘지: 가이드에 `orca.yaml`의 `environmentRecipes` 언급만 확인. 필요해지면 `orca skills get orca-per-workspace-env`로 확인 후 Task화.
- Orca 자체를 Agent HQ의 데이터 소스로 쓸 수 있는지 (OQ-5) — RES-006.
