# RES-002 — Claude Code 신호 조사 (HQ-110)

> 목적: Claude Code hook이 실제로 주는 신호를 확인하고, Event 계약(HQ-101)과 M2 Claude Code Adapter 설계의 입력을 만든다.
> 상태: **Concluded** — 1단계(공식 문서)와 2단계(scratch hook 실험, 2026-11-25 사용자 승인) 완료
> 작성: 2026-11-25, Claude Code (HQ-110). 설치 버전: Claude Code **2.1.331**
> 데이터 처리: [data-governance N4](../engineering/data-governance.md#n4-개발-과정의-데이터-즉시-적용) — 실제 세션 데이터는 저장소 밖에만 두고, 원문을 문서에 붙이지 않는다.

## 1. 근거 수준 표시
- **[문서]**: 공식 hook 레퍼런스(`https://code.claude.com/docs/en/hooks`, 2026-11-25 조회, 페이지에 버전·날짜 표시 없음)에 적힌 내용.
- **[실험]**: scratch 프로젝트에서 직접 관찰한 내용 (2단계).
- **[미확인]**: 문서에 없고 아직 관찰하지 않은 내용. 추정해서 채우지 않는다 (adapter-spec §6).

## 2. 공식 문서에서 확인한 사실

### 2.1 설정과 실행 [문서]
- 설정 위치: `~/.claude/settings.json`(사용자), `.claude/settings.json`(프로젝트), `.claude/settings.local.json`(로컬), 관리 정책, plugin `hooks/hooks.json`, skill·subagent frontmatter.
- **여러 위치의 hook은 서로 대체하지 않고 합쳐진다.** 프로젝트 hook은 사용자 전역 hook(Orca, iTerm2)과 **함께** 실행된다. 같은 이벤트에 맞는 hook은 병렬로 실행된다 → 전역 설정을 건드리지 않고 공존할 수 있다(RSK-009 완화).
- 핸들러 유형: `command`, `http`, `mcp_tool`, `prompt`, `agent`. 기본 timeout은 command·http 600초, `SessionEnd`는 전체 1.5초 예산(설정으로 최대 60초).
- `async: true`인 command hook은 백그라운드로 실행되고 차단할 수 없다. 종료 코드 2 외의 실패(시작 실패, 0·2 외 종료 코드, 잘못된 JSON, HTTP 오류)는 기본적으로 **차단하지 않는** 오류다 → 관찰 hook이 Agent를 막지 않는다는 원칙(NFR-008)을 설정만으로 지킬 수 있다. 단, `onFailure: "block"`은 쓰지 않는다.
- hook이 백그라운드 프로세스를 띄우면 stdout·stderr를 반드시 리디렉션해야 한다(안 그러면 도구 호출이 막힘).
- 보안: command hook은 사용자 권한 전체로 실행된다. `-p`/SDK 실행은 작업 폴더를 신뢰된 것으로 간주한다.

### 2.2 모든 hook 입력에 공통인 필드 [문서]
`session_id`, `prompt_id`(첫 입력 전에는 없음), `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `agent_id`·`agent_type`(subagent 안에서 실행될 때, 또는 `--agent` 세션), 도구 문맥 이벤트의 `effort`.
- **타임스탬프·sequence 번호·주기적 heartbeat는 문서에 없다.** 시간 관련 필드는 도구 이벤트의 `duration_ms`와 재개 시 `SessionStart`의 `seconds_since_last_response`뿐이다.

### 2.3 이벤트별 신호 [문서]
| hook | 언제 | 쓸 만한 입력 | 차단 가능 |
|---|---|---|---|
| `SessionStart` | 새 세션·재개(`source`: startup/resume/clear/compact/fork) | `source`, `model`, `agent_type` | 아니오 |
| `SessionEnd` | 세션 종료(`reason`: clear/resume/logout/prompt_input_exit/other) | `reason` | 아니오, 1.5초 예산 |
| `UserPromptSubmit` | 프롬프트 제출(예약 작업·백그라운드 subagent 보고 포함) | `prompt`(D2) | 예 |
| `PreToolUse` | 도구 실행 직전(권한 확인 전) | `tool_name`, `tool_input`(D2), `tool_use_id`, `mcp_server.name` | 예 |
| `PostToolUse` | 도구 성공 후 | `tool_use_id`, `tool_response`(D2), `duration_ms` | 아니오(exit 2 무효) |
| `PostToolUseFailure` | 시작된 도구가 실패 | `tool_use_id`, `error`(D2/D3 가능), `is_interrupt`, `duration_ms` | 아니오 |
| `PostToolBatch` | 병렬 도구 묶음이 모두 끝난 뒤 | `tool_calls[]` | 예 |
| `PermissionRequest` | 권한 프롬프트 직전 | `tool_name`, `tool_input` (**`tool_use_id` 없음**) | 결정 가능 |
| `PermissionDenied` | auto 모드 분류기가 거부 | `tool_use_id`, `reason` | — |
| `Notification` | 알림(`permission_prompt`, `idle_prompt`, `agent_needs_input`, `agent_completed` 등) | `notification_type`, `message` | 아니오 |
| `Stop` | 메인 Agent가 응답을 마침(사용자 중단 시 미발생) | `last_assistant_message`(D2) | 예 |
| `StopFailure` | API 오류로 턴 종료(`rate_limit`, `authentication_failed`, `server_error` 등) | `error`, `error_details` | 아니오 |
| `SubagentStart` | subagent 시작·재개 | `agent_id`, `agent_type` | 아니오 |
| `SubagentStop` | subagent 종료 | `agent_id`, `agent_type`, `last_assistant_message`(D2) | 예 |
| `PreCompact`/`PostCompact` | 컨텍스트 압축 전후 | `trigger` | 전만 |
| 기타 | `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `Elicitation*`, `PreModelSwitch` 등 | — | — |

## 3. 실험 결과 [실험]
scratch 프로젝트(저장소 밖)의 `.claude/settings.local.json`에만 `async` 기록 hook을 두고 `claude -p`(2.1.331)로 세션 6개를 실행했다. 사용자 전역 hook은 수정하지 않았다(함께 실행됨). 기록은 필드 이름·타입·길이와 식별자·열거형 값뿐이다.

| # | 작업 | 관찰 |
|---|---|---|
| 1 | `ls`, 파일 2개 읽기(병렬 요청), 없는 파일 읽기, 허용되지 않은 `touch` | 18건. `PreToolUse`→`PostToolUse`(`duration_ms`)→`PostToolBatch`. 없는 파일은 `PostToolUseFailure`(`is_interrupt: false`, `error` 문자열). 허용되지 않은 명령은 `PreToolUse`→`PermissionRequest`(**`tool_use_id` 없음**) 뒤 Post 이벤트가 **없고**, `PostToolBatch.tool_calls`에만 그 `tool_use_id`가 있다 |
| 2 | subagent 1개(general-purpose)가 파일 2개 읽기 | 16건. `SubagentStart`/`SubagentStop`에 `agent_id`·`agent_type`. subagent 안의 도구 hook에도 같은 `agent_id`·`agent_type`. **메인 세션 hook에는 `agent_id`가 없다.** `SubagentStart`에는 부모 Agent나 그 subagent를 만든 `Agent` 도구의 `tool_use_id`가 없다(메인의 `Agent` 도구 `PreToolUse` 직후에 발생). subagent의 병렬 도구는 완료 순서대로 Post가 도착했다(Read가 먼저 시작한 Bash보다 먼저) |
| 3~5 | `sleep` 명령 실행 시도 | 실행 전에 거부되어 `PreToolUse`·`PermissionRequest` 없이 **`PostToolBatch`에만** 호출이 나타났다(Claude Code가 단독 `sleep`을 막는 것으로 보임). 세션은 스스로 끝남 |
| 6 | 도구(`python3 wait.py`, 45초) 실행 중 SIGTERM | `SessionStart`→`UserPromptSubmit`→`PreToolUse` 뒤 **`SessionEnd`(`reason: other`)만** 왔다. 실행 중이던 도구의 Post 이벤트와 `Stop`은 없다 |

- 모든 `-p` 세션의 `SessionEnd.reason`은 `other`였다. `SessionStart.source`는 `startup`. `SessionStart`에 `model` 필드는 없었다.
- 관찰하지 못한 hook: `Notification`, `StopFailure`, `PermissionDenied`, `PreCompact`/`PostCompact`, `TaskCreated`/`TaskCompleted`, `TeammateIdle`(대화형 세션·특정 조건에서 발생). SIGKILL 때 `SessionEnd`가 없을 것은 당연하지만 확인하지 않았다.
- **세션당 Event량**: 작은 작업 기준 4~18건. 도구 호출 하나당 대략 Pre + Post + (Batch 공유) ≈ 2~3건, 세션 고정 4건(Start, Prompt, Stop, End), subagent당 2건 + 그 안의 도구.
- 정리: 기록 파일, scratch 프로젝트, 기록 스크립트를 실험 직후 삭제했다(§7).

## 4. adapter-spec §6 초기 범위 ↔ hook 매핑

| 초기 범위 | hook | Agent HQ Event | 근거 |
|---|---|---|---|
| Session 연결 | `SessionStart` | `agent.connected` — 메인 Agent. `externalSessionId = session_id`, 메인 Agent의 외부 ID는 `session_id`에서 만든다(메인에는 `agent_id`가 없음) | [문서]+[실험] |
| Session 종료 | `SessionEnd` | `agent.disconnected`(명시적, `reason` → payload `reason`). SIGTERM에서도 발생. SIGKILL·정전 등은 신호 없음 → Connection 끊김 → `unknown`(HQ-108) | [문서]+[실험] |
| 활동 상태 | `UserPromptSubmit` | `agent.status.changed` → `working` | [문서]+[실험] |
| | `Stop` | `agent.status.changed` → `waiting`(사용자 입력 대기, `rawStatus: "stop"`) 제안 — **결정 필요**(아래 6) | [문서]+[실험] |
| | `Notification`(`permission_prompt`, `agent_needs_input`) / `PermissionRequest` | `agent.status.changed` → `waiting`(`rawStatus` = 알림 유형) | [문서], `PermissionRequest`는 [실험] |
| | `StopFailure` | `agent.failed`(`errorCode` = matcher 값, 예: `rate_limit`) | [문서] |
| Subagent 시작/종료 | `SubagentStart` / `SubagentStop` | `agent.started`(`externalAgentId = agent_id`, `roleHint = agent_type`, `parentExternalAgentId` = 메인 Agent) / `agent.completed` | [문서]+[실험] |
| Tool 시작/완료/실패 | `PreToolUse` / `PostToolUse` / `PostToolUseFailure` | `tool.call.started` / `completed`(`durationMs = duration_ms`) / `failed`(`is_interrupt` → `errorCode: "interrupted"`). `externalToolCallId = tool_use_id`, `serverName = mcp_server.name`, Agent는 `agent_id`(없으면 메인) | [문서]+[실험] |
| 실행되지 않은 Tool | `PostToolBatch`에 있는데 Post 이벤트가 없는 `tool_use_id` | `tool.call.failed`(`errorCode: "not_executed"` — 권한 거부·실행 전 거부). Pre 없이 Batch에만 있는 호출도 같은 규칙(그 경우 `started` 없이 `failed`만) | [실험] |
| 부모-자식 관계 | 공통 `agent_id` | subagent의 부모는 메인 Agent로 둔다. subagent 안에서 다시 subagent를 만드는 경우의 부모는 **[미확인]** — 확인 전까지 `parentExternalAgentId`를 비워 두고 추정하지 않는다 | [실험] 일부 |
| 연결 상태·Gap | (해당 hook 없음) | Bridge heartbeat → `connection.health.changed`. Bridge가 세션별 `sequence`를 매겨 전송 중 유실을 `event.gap.detected`로 드러낸다 | [문서]: heartbeat·sequence 없음 |

## 5. 설계 시사점 (M2 Bridge·Adapter 입력)

### 5.1 비침투성
- hook은 **로컬 Bridge의 outbox에 한 줄 기록하고 즉시 끝나는** command로 둔다. 네트워크 전송·재시도는 Bridge가 맡는다. 실패해도 막지 않도록 종료 코드는 0 또는 1만 쓰고 `onFailure`를 두지 않는다. `SessionEnd`는 1.5초 예산 안에 끝나야 한다.
- 프로젝트·로컬 설정의 hook은 전역 hook과 합쳐져 함께 실행되므로, 설치할 때 사용자 전역 설정을 수정할 필요가 없다(RSK-009). 설치 위치(사용자 설정 vs 프로젝트 설정)는 M2에서 사용자 동의 흐름과 함께 정한다.

### 5.2 콘텐츠(D2/D3)
- `tool_input`, `tool_response`, `prompt`, `last_assistant_message`, `error`, `Notification.message`는 D2이고 Secret이 섞일 수 있다. 기본 수집은 **길이와 keyed 해시만** 보내고 원문은 보내지 않는다(data-governance N1·N2). 계약의 `inputSummary`·`outputSummary`·`message`는 Workspace opt-in 전까지 비워 둔다. 실험의 기록 스크립트가 이 방식이 가능함을 보였다.

### 5.3 순서·시각
- hook 입력에 발생 시각이 없으므로 hook이 실행된 시각(Bridge가 outbox에 적는 시각)을 `occurredAt`으로, `timestampQuality: "collected"`로 보낸다.
- `sequence`는 Bridge가 세션별로 hook 도착 순서대로 매긴다. 병렬 도구의 Post는 완료 순서로 도착하므로(실험 2) `sequence`는 "도착 순서"이지 "시작 순서"가 아니다. Projection은 도구 상태를 `tool_use_id`로 묶으므로 문제없다. Gap 감지(HQ-108)는 Bridge→HQ 전송 유실만 잡는다(hook 자체가 실행되지 않은 경우는 잡지 못함).
- heartbeat가 없으므로 Agent 생존은 알 수 없다. Agent 침묵은 Stale 표시로만 보여 주고 `idle`로 추론하지 않는다.

### 5.4 끝나지 않은 Tool
- SIGTERM으로 끝난 세션은 실행 중이던 도구의 종료 이벤트를 남기지 않는다(실험 6). `SessionEnd` 시점에 열린 호출을 "실패"로 만들면 추정이 되므로, Bridge는 **열린 호출을 그대로 두고** 세션 종료만 보낸다. Dashboard는 Agent가 `disconnected`이고 도구가 끝나지 않았음을 그대로 보여 준다. 열린 호출을 별도로 표시할지는 M2 UI에서 정한다.

### 5.5 멱등 키
- 도구: `<session_id>:<tool_use_id>:<started|completed|failed>`. 세션·상태 이벤트: `<session_id>:<hook_event_name>:<Bridge 순번>`(hook 입력에 이벤트 고유 ID가 없음). subagent: `<session_id>:<agent_id>:<started|completed>`.

## 6. Event 계약 대조 결과 (HQ-101, M1 종료 조건 9)
- **결론: 계약을 깨는 변경은 필요 없다. ADR 없이 schemaVersion 1을 유지한다.** 위 매핑은 현재 Envelope(`source.externalSessionId`·`externalAgentId`, `sequence`, `timestampQuality: "collected"`)와 MVP Type, 기존 payload 필드(`toolName`, `externalToolCallId`, `serverName`, `durationMs`, `errorCode`, `roleHint`, `parentExternalAgentId`, `reason`, `rawStatus`)로 모두 표현된다.
- 표현 규약으로 정할 것(M2 Adapter 계약 테스트에 넣는다): `errorCode` 값 `interrupted`, `not_executed`; 메인 Agent 외부 ID 규칙; `Stop` → 상태 매핑.
- **사용자 결정 필요**: `Stop`(응답을 마치고 사용자 입력을 기다림)을 `waiting`으로 볼지 `idle`로 볼지. domain-model N1은 `idle`을 "Runtime이 명시적인 신호로 대기 상태를 보고했을 때"로 정의한다. 이 문서는 사람의 다음 입력을 기다리는 상태라 `waiting`을 제안한다(`agent.completed` → `idle` 매핑과 구분).
- Task: hook에 Agent HQ Task에 해당하는 신호가 확인되지 않았다(`TaskCreated`/`TaskCompleted` 미관찰). adapter-spec 비목표에 따라 Claude Code Adapter는 `task.*`를 만들지 않는다.
- HQ-108의 Open 항목(연결 끊김 해제 기준): Claude Code에는 heartbeat가 없고 `occurredAt`은 Bridge가 hook 실행 시각으로 찍는다. Bridge outbox가 재연결 후 끊기기 전 이벤트를 flush하면 현재 규칙(끊긴 뒤 무엇이든 받으면 해제)에 따라 `unknown`이 풀린다. 이를 막으려면 해제 기준을 "끊긴 시각 이후의 `occurredAt`"으로 바꿔야 하는데, Bridge 시계와 서버 시계가 같은 기계라는 MVP 전제에서만 안전하다. **M2 Bridge 설계 때 결정**하도록 넘긴다.

## 7. 수집 파일 삭제 기록
- 2026-11-25T10:23:33Z: scratch 디렉터리 `hq110/`(기록 파일 `log.jsonl` 55줄, scratch 프로젝트와 그 `.claude/settings.local.json`, 기록 스크립트, 실행 출력)를 `rm -rf`로 삭제하고 존재하지 않음을 확인했다. 기록 파일에는 원문 콘텐츠가 없었다(필드 이름·타입·길이, 식별자, 열거형 값만). 저장소에는 아무 실험 데이터도 커밋하지 않았다.
