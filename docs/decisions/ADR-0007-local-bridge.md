# ADR-0007: Local Bridge 구조 — command hook → 소유자 전용 spool → 상주 Bridge → HQ

- Status: Accepted (2026-11-27, 사용자 승인)
- Date: 2026-11-27
- Deciders: 사용자 / 제안: Claude (Architect, HQ-201)
- Supersedes: 없음. architecture §5(Local Bridge)와 security §4.3을 M2 범위에서 구체화한다

## Context
M2에서 사용자의 Claude Code 세션을 관찰한다. RES-002에서 다음이 확인되었다.
- hook 입력에는 시각·순번·heartbeat가 없다. 발생 시각과 세션 순번은 수집 쪽이 매겨야 한다(§2.2).
- 실패한 hook은 기본적으로 Agent를 막지 않는다. 단, `onFailure: "block"`과 종료 코드 2는 막는다(§2.1).
- hook 입력에는 D2 콘텐츠(`prompt`, `tool_input`, `tool_response`, `last_assistant_message`, `error`)와 경로(`cwd`, `transcript_path`)가 섞여 있다.
- 공식 hooks 문서(2026-11-27 확인)에 따르면 핸들러는 `command`와 `http` 등이 있다.
  - `http` hook은 JSON 입력을 POST 본문으로 보낸다. 헤더 값은 `allowedEnvVars`에 적은 환경 변수로 채울 수 있다.
  - 연결 실패와 2xx가 아닌 응답은 막지 않는 오류다.
  - 기본 timeout은 command·http 모두 600 s다. `SessionEnd`는 hook 전체에 1.5 s 예산이 있다(더 긴 hook timeout을 설정하면 최대 60 s까지 늘어남).
  - hook 입력과 환경 변수에는 Claude Code 버전이 없다.

M1의 HQ API는 그대로 쓸 수 있다.
- 등록 코드 → Connection 토큰(HQ-103)
- `POST /events` 배치, 멱등 키, `429`·`503`의 `Retry-After`(HQ-105, HQ-113)
- heartbeat에 따른 연결 상태와 끊김 이후 `unknown` 표시(HQ-108)
- 세션 `sequence` 구멍을 Gap으로 기록(HQ-108)

## Problem
hook 신호를 **Agent를 막지 않고, Bridge가 꺼져 있어도 잃지 않고, 같은 머신의 다른 사용자가 위조하지 못하게** 공통 Event로 만들어 HQ에 보내는 구조는 무엇인가? HQ-201 Scope의 11개 항목에 답한다.

## Options Considered (hook → Bridge 로컬 구간, 핵심 선택)
- **A. `command` hook → 소유자 전용 spool 디렉터리에 파일 하나를 원자적으로 쓰고 종료 → 상주 Bridge가 spool을 읽음 (제안)**
  - Bridge가 꺼져 있어도 신호가 디스크에 남는다.
  - Bridge가 포트를 열지 않는다(로컬 공격 표면 없음).
  - 로컬 토큰이 필요 없다.
  - 대가: hook마다 프로세스 하나를 띄운다(지연은 HQ-206에서 측정).
- B. `http` hook → Bridge가 `127.0.0.1`에서 받음, 헤더에 로컬 토큰
  - 프로세스를 띄우지 않아 빠르다.
  - 대가 1: Bridge가 꺼져 있으면 신호가 사라지는데, Bridge가 순번을 매기기 전이라 Gap으로도 잡히지 않는다.
  - 대가 2: 같은 머신의 다른 OS 사용자도 TCP 포트에 닿을 수 있어 토큰이 필수다. 토큰은 환경 변수(셸 설정)나 설정 파일에 있어야 한다.
  - 같은 OS 사용자에 대한 방어력은 A와 같다. 그 사용자는 토큰 파일도 읽을 수 있다.
- C. hook이 HQ API에 직접 전송
  - Connection 토큰이 hook 설정에 들어간다.
  - 재시도·순번·오프라인 보관을 할 곳이 없다.

## Decision (제안)

**1. 프로세스 구조**
- `apps/bridge` 하나에 두 진입점을 둔다.
  - 상주 프로세스: `agent-hq-bridge run`
  - hook 명령: `agent-hq-hook`. 의존성 없는 단일 JS 파일이다.
- hook 명령 고정(HQ-207): 설치 명령이 **node 절대 경로, hook 스크립트 절대 경로, `BRIDGE_HOME` 절대 경로**를 hook 명령 줄에 박는다. 설치할 때 node 버전(20 이상)을 검사한다.
  - 그래서 사용자 PATH나 환경 변수가 바뀌어도 신호가 엉뚱한 곳으로 가지 않는다.
  - 고정한 node가 사라지면 hook이 시작조차 못 하고 아무 기록도 남지 않는다. Bridge는 `status`에서 hook 명령 경로가 유효한지 검사해 알린다.
- MVP에서는 Bridge를 사용자가 직접 실행한다. 자동 시작(launchd 등)은 하지 않는다.
- Bridge는 HQ로 나가는 연결만 쓰고 **포트를 열지 않는다**. Bridge가 꺼져 있으면 hook은 spool에 쓰고 끝나고, Bridge가 켜지면 쌓인 신호를 처리한다.

**2. hook → Bridge 로컬 구간 (A안)과 파일 보안**
- 디렉터리 구조: `<BRIDGE_HOME>`(기본 `~/.agent-hq/bridge`)
  - `spool/` — 완성된 항목
  - `spool/tmp/` — 쓰는 중인 항목
  - `dropped.log` — 유실 기록
  - `outbox/`
  - `credentials.json`
- 시작 검사(hook과 Bridge 모두)는 두 단계다.
  - **Bridge 소유 경로(엄격):** `~/.agent-hq`(기본 경로일 때), `BRIDGE_HOME`, `spool`, `spool/tmp`, `outbox`를 `lstat`로 본다.
    - symlink가 아니다.
    - 소유자가 현재 euid다.
    - `mode & 0o077 == 0`이다.
    - 파일(`credentials.json`, `dropped.log`, outbox 세그먼트)도 소유자가 euid이고 `0600`이어야 한다.
  - **그 위의 상위 디렉터리(완화):** `realpath`로 해석한 경로를 루트까지 본다.
    - 소유자가 euid 또는 root다.
    - group·other 쓰기 권한이 없다.
    - 예외: sticky bit 디렉터리(예: `/tmp`)는 바로 아래 항목을 euid가 소유한 경우에만 허용한다.
    - 그래서 홈이 `0750`이어도 통과한다. `/tmp` 아래에 다른 사용자가 미리 만든 디렉터리나 symlink는 거부된다.
  - 하나라도 어긋나면 Bridge는 거부하고 이유를 출력한다. hook은 조용히 끝낸다(종료 코드 0, 9항).
- 디렉터리는 Bridge만 만든다. `pair`와 `run`이 `0700`으로 만들고, umask와 무관하게 `chmod`로 확정한다.
  - 한계: Bridge를 처음 실행(`pair`)하기 전이나 검사에 실패한 동안에는 hook 신호가 기록 없이 사라진다. `dropped.log`도 그 안에 있기 때문이다. 설치 명령(HQ-207)은 `pair`를 마친 뒤에만 hook을 설치한다.
- `AGENT_HQ_BRIDGE_HOME`으로 경로를 바꿀 수 있지만 같은 검사를 통과해야 한다.
- hook 쓰기:
  - `spool/tmp/<name>`을 `O_CREAT|O_EXCL`(`'wx'`), `0600`으로 만들어 쓴 뒤 같은 파일시스템 안의 `spool/<name>`으로 rename한다(원자적).
  - `<name>`은 `<capturedAt ms>-<hrtime ns>-<pid>-<random>.json`이다. 충돌하지 않고 정렬할 수 있다.
- Bridge 읽기:
  - `spool/`의 일반 파일만 대상이다. `tmp/`는 무시하고, 1시간 지난 tmp는 지운다.
  - `O_NOFOLLOW`로 열고 `fstat`로 일반 파일인지, 크기 64 KiB 이하인지 **읽기 전에** 확인한다.
  - 스키마로 검증하고, 실패하면 버린 뒤 개수만 기록한다. 항목 안의 문자열은 데이터로만 다룬다.
- **막는 범위:** 다른 OS 사용자. 디렉터리 권한과 시작 검사로 막고, Bridge가 포트를 열지 않아 다른 경로도 없다.
- **수용하는 위험: 같은 OS 사용자의 프로세스.** 여기에는 **관찰 대상인 Claude Code 자신**(예: prompt injection을 당한 Bash tool)도 들어간다. 이 프로세스는 spool에 위조 항목을 쓰고 토큰을 읽을 수 있다. 같은 사용자 권한은 이미 Claude Code 자격 증명과 작업 파일 전체에 닿으므로, 로컬 토큰을 둬도 방어력이 늘지 않는다. 따라서:
  - **HQ 표시는 관찰 대상 Agent에 대해 무결성을 보장하지 않는다.** 관찰 기록이지 증명이 아니다. 이 문구를 security §4.3과 사용자 안내에 둔다.
  - 위조 항목은 일반 Event와 같이 데이터로만 처리된다. 텍스트로만 렌더링하고(T5), 크기·rate limit을 건다(T8).
  - **재검토 조건:** 이 수용은 M5 제어 명령(HQ가 로컬에서 실행)이나 Cloud 연결을 도입할 때 다시 결정한다. Event가 실행을 일으키기 시작하면 위조의 영향이 달라진다.
- **용량 상한(DoS): hook이 직접 지킨다. Bridge가 꺼져 있어도 적용된다.**
  - 항목 하나는 4 KiB 이하다. allowlist를 거친 항목은 수백 바이트이므로 이를 넘으면 쓰지 않는다.
  - hook은 쓰기 전에 `spool/`의 항목 수를 센다(`readdir`). 10,000개 이상이면 쓰지 않고 유실만 기록한다(7항).
  - 그래서 spool은 최대 약 40 MiB(10,000 × 4 KiB)로 제한된다. 별도 표시 파일이나 카운터가 필요 없다.
  - 이 상한은 **근사치**다. 세기와 쓰기 사이에 잠금을 두지 않으므로, 동시에 실행된 hook 수만큼 넘을 수 있다(병렬 Tool 호출 수 정도, 수십 개 이하). 잠금은 hook 지연과 교착 위험을 늘리므로 두지 않는다. 목적은 디스크를 채우지 않는 것이라 이 오차로 충분하다.
  - `readdir` 비용(최대 10,000개)은 HQ-206에서 측정한다. 비용이 크면 같은 규칙을 지키는 더 싼 방법으로 바꾸고 기록한다.
  - `dropped.log`는 1 MiB까지 쓴다. 그 위로는 기록되지 않는다(한계).

**3. 매핑 위치와 allowlist**
- hook 명령: 상태 없이 **allowlist 필드만** 남기고 나머지는 디스크에 쓰기 전에 버린다.
  - allowlist 목록은 HQ-202 계약(`packages/adapter-claude-code`)에 정의하고, hook 스크립트가 그 목록을 쓴다.
  - 남기는 것은 식별자·열거형·숫자다. 예: `session_id`, `hook_event_name`, `agent_id`, `agent_type`, `tool_name`, `tool_use_id`, `mcp_server.name`, `duration_ms`, `is_interrupt`, `notification_type`, `reason`의 열거형 값, `source`, `tool_calls[].tool_use_id`·`tool_name`.
  - **자유 텍스트는 전부 버린다.** D2(`prompt`, `tool_input`, `tool_response`, `last_assistant_message`), `PostToolUseFailure.error`, `error_details`, `Notification.message`, `PermissionDenied.reason`, 경로(`cwd`, `transcript_path`)가 여기에 든다.
  - `StopFailure.error`는 자유 텍스트가 아니라 실패 종류(matcher 값, 예: `rate_limit`)이므로 토큰으로 남긴다(RES-002 §4).
  - 목록에 있는 필드라도 값이 토큰 모양(공백·경로 구분자 없음, 100자 이하)이 아니면 버린다. Runtime ID에는 `:`도 허용하지 않는다(멱등 키 구분).
  - 남긴 항목에 `capturedAt`(ms wall clock), `hrtime`, `ppid`(9항)를 붙인다.
  - `ppid`는 spool에만 두고 HQ Event로는 보내지 않는다(Envelope `source`가 strict).
- 상태가 필요한 매핑은 Bridge가 HQ-202 `mapHook`으로 한다. 세션 순번, subagent 실행 순번, 열린 Tool 호출이 여기에 든다.
- **원문 콘텐츠는 spool·outbox·로그 어디에도 남지 않는다.**

**4. Bridge 저장소와 처리 단위**
- 새 의존성 없이 Node 내장 기능만 쓴다. outbox는 JSONL 세그먼트 파일(0600)이다.
- **spool 항목 하나 = outbox의 처리 기록 하나.** outbox 줄마다 다음을 같은 줄에 담아 append한다.
  - 원본 spool 파일 이름(`spoolId`). Event를 하나도 만들지 않는 항목도 줄을 남긴다.
  - 그 항목이 만든 Event들
  - 그 시점의 세션 상태 스냅샷: 다음 순번, subagent 실행 순번, 열린 Tool 호출, `not_executed` 확정을 기다리는 호출
- Bridge는 항목을 **하나씩 차례로** 처리한다. 줄을 append한 뒤 바로 spool 파일을 지우고, 그다음 항목이나 타이머로 넘어간다.
  - 그래서 재시작할 때 중복 여부는 **마지막 spool 줄**(`spoolId`가 `timer:`로 시작하지 않는 마지막 줄)의 `spoolId`만 확인하면 된다.
  - 타이머 줄은 spool 파일을 지운 뒤에만 append되므로, 둘 사이에 끼어들 수 없다.
- 재시작 순서:
  1. 잘린 마지막 줄(JSON 파싱 실패)은 버리고, 그 항목은 처리하지 않은 것으로 다룬다.
  2. 마지막 온전한 줄의 상태로 이어 간다.
  3. spool에 그 `spoolId`가 남아 있으면 다시 매핑하지 않고 지운다.
- `not_executed`는 spool 항목이 아니라 타이머로 생긴다. 타이머가 만료되면 Bridge가 `spoolId: "timer:<호출 ID>"` 줄을 같은 방식으로 append한다.
  - 그래서 "outbox에는 썼지만 spool을 지우기 전에 죽은" 경우에도 같은 항목이 새 순번(= 새 멱등 키)으로 두 번 나가지 않는다(RES-002 §5.5의 세션 이벤트 키는 순번을 포함한다).
- 전송 cursor는 별도 파일에 원자적으로(tmp + rename) 갱신한다.
- 세그먼트는 1 MiB마다 새로 연다. 전송이 끝난 **이전** 세그먼트는 7일 뒤 삭제한다.
  - **가장 최근 세그먼트는 삭제하지 않는다.** 그 마지막 줄이 재시작 때 복원할 상태이기 때문이다.
  - 새 세그먼트를 열 때는 첫 줄에 현재 상태 스냅샷(`spoolId: "checkpoint"`)을 쓴다. 이전 세그먼트가 지워져도 상태가 남는다.
- SQLite(`node:sqlite`)는 쓰지 않는다. 안정성 등급을 확인하지 않았고, 세션당 Event가 4~18건(RES-002 §3)이라 필요 없다.

**5. Pairing·자격 증명**
- 등록: `agent-hq-bridge pair [--api <URL>]`가 등록 코드를 **stdin(프롬프트)으로** 받아 `POST /connections`로 등록한다(`adapterId: "claude-code"`, `runtime: "claude-code"`).
  - argv는 `ps`로 다른 OS 사용자에게 보이고, 그 사용자도 `127.0.0.1` API에 닿을 수 있다. 그래서 코드를 argv로 받지 않는다.
- 토큰 저장: `<BRIDGE_HOME>/credentials.json`(0600)에 tmp + rename으로 원자적으로 쓴다. 읽을 때 2항의 소유자·권한 검사를 한다. 로그·오류·outbox에는 쓰지 않는다.
  - OS Secret Store(keychain)는 MVP에서 쓰지 않는다. 새 의존성이나 플랫폼별 코드가 필요하고, 같은 사용자 위협은 2항에서 수용했기 때문이다. Cloud 연결 때 다시 검토한다(data-governance §6).
- 응답별 처리:
  - `401`(토큰 없음·무효·폐기·만료, HQ-103 Guard): 전송과 heartbeat를 멈추고, outbox는 보존하고, "재등록 필요"를 출력한다.
  - `400`(계약 위반): issues가 있으면 `issues[].path`가 가리키는 Event만 격리하고 나머지를 다시 보낸다. issues가 없으면 배치를 반으로 나눠 다시 보내고, 단건이면 격리한다.
  - `413`(body 상한): 배치를 반으로 나눠 다시 보내고, 단건이면 격리한다.
  - `403`은 두 경우를 나눈다.
    - **issues가 Event를 가리키면**(`events.N.workspaceId` 등 소유권 불일치): 그 Event만 격리하고 나머지를 다시 보낸다.
    - **issues가 없으면**(Host·Origin 거부 — Bridge의 API 주소 설정 문제): 격리하지 않는다. 전송을 멈추고 outbox를 보존한 뒤 "API 주소 설정 확인"을 출력하고, 백오프 최대 간격으로 계속 다시 시도한다. 설정을 고치면 그대로 이어서 전송된다.
  - `409`(같은 `id` 또는 같은 `idempotencyKey`에 다른 내용): issues 경로(`events.N.id`, `events.N.idempotencyKey`)가 가리키는 Event만 격리한다.
- 격리 규칙:
  - 격리한 Event는 HQ에 저장되지 않는다.
  - **격리를 Source 쪽 Gap으로 드러낸다.** Bridge는 격리한 순번의 **연속 구간마다** `event.gap.detected`를 새 순번으로 만들어 보낸다.
    - payload는 `reason: "bridge_quarantined: <n> event(s)"`이고, `fromSequence`·`toSequence`는 그 구간이다.
    - 예: 3, 4, 7이 격리되면 `3~4`와 `7~7` 두 개를 보낸다. 범위 하나로 합치면 격리되지 않은 5, 6까지 유실로 보이기 때문이다.
    - 세션의 마지막 Event가 격리되어 뒤따르는 Event가 없을 때도 유실이 보인다.
    - 같은 구멍을 HQ의 Gap 감지도 따로 기록할 수 있다. 중복 표시는 숨김보다 낫다. 실제 동작은 HQ-204 테스트로 확인해 기록한다.
    - 이 gap Event 자체가 격리되면 다시 만들지 않는다. `status`의 격리 개수로만 드러난다.
  - 격리 기록에는 개수, 오류 코드, Event Type만 남기고 Event 내용은 남기지 않는다. 30일 뒤 삭제한다.
  - `agent-hq-bridge status`가 격리 개수를 보여 준다.
  - 격리는 Bridge 버그 신호이므로 테스트로 막는다.
- 재등록하면 새 Connection이 된다. 외부 ID 매핑이 Connection 범위라서(ADR-0006), 같은 세션이 새 Agent로 보인다. 이 한계를 문서에 적는다.

**6. 전송**
- 배치: 최대 500건 또는 256 KiB. 대기 중인 Event가 있으면 1 s 안에 보낸다.
- 실패: 지수 백오프(1 s → 최대 60 s, full jitter)로 다시 보낸다. `429`·`503`은 `Retry-After`를 우선한다.
- 같은 배치를 다시 보내도 멱등 키로 중복 저장되지 않는다. at-least-once 전송에 멱등을 더해 결과적으로 한 번 저장된다(4항이 키 안정성을 보장).
- heartbeat: 15 s마다(HQ 기본 임계값 30 s/90 s).
- Capability: 등록할 때와 Bridge가 시작할 때마다 보고한다. 형태와 경로는 HQ-208이 정한다.

**7. `sequence`·`occurredAt`·유실 표시**
- `occurredAt`: hook이 찍은 `capturedAt`, `timestampQuality: "collected"`.
- Bridge는 spool 항목을 파일 이름 순서(`capturedAt` ms, 그다음 `hrtime` ns)로 처리하고, 세션별 `sequence`를 처리 순서대로 0부터 매긴다.
  - `hrtime`은 같은 부팅 안에서만 의미가 있고, 프로세스끼리 비교할 수 있는지는 확인하지 않았다(HQ-206). 그래서 동점을 가를 때만 쓴다.
  - rename이 늦게 끝난 항목은 뒤 항목보다 늦게 처리될 수 있다. 그래서 **`sequence`는 처리 순서이지 발생 순서가 아니다.** Projector는 `occurredAt`을 먼저 비교하므로 상태 계산에는 영향이 없다.
  - 세션 상태는 outbox와 함께 영속한다(4항).
- **유실 표시: Bridge가 Source 쪽 `event.gap.detected`를 보낸다.** 순번을 건너뛰지 않는다.
  - 순번 건너뛰기는 HQ의 Gap 감지(`findGaps`)가 구멍 **뒤에 오는 Event**로만 찾으므로, 세션 끝(`SessionEnd` 유실 등)과 첫 Event의 유실을 영구히 놓친다.
  - 동작:
    - hook이 spool에 쓰지 못하면(상한 초과, 쓰기 오류) `dropped.log`에 `{capturedAt, sessionKey, hookEventName}` 한 줄을 append한다.
      - `sessionKey`는 `session_id`의 SHA-256 앞 16자리다. 파일 이름이나 경로에 stdin 값을 쓰지 않으므로 path traversal이 생기지 않는다.
      - 파일은 `O_APPEND`로 열고 한 줄을 `write` 한 번에 쓴다.
    - Bridge는 `dropped.log`를 읽은 offset을 파일 식별자(inode)와 함께 영속하며 이어 읽는다. 잘라내지 않는다.
    - 회전: 상한에 이르면 Bridge가 `dropped.log`를 `dropped.log.1`로 rename한다. 이전 파일을 끝까지 읽은 뒤 offset을 초기화한다.
    - Bridge는 유실 기록을 spool 항목과 같은 시간 순서에 넣어, 그 위치에 `event.gap.detected`를 만든다.
      - 계약에는 `reason` 문자열과 선택 필드 `fromSequence`·`toSequence`만 있다(packages/events). 그래서 개수는 `reason: "hook_dropped: <n> signal(s)"`로 쓰고, from/to는 생략한다.
      - 이 Event는 세션의 메인 Agent에 붙고 자기 순번을 받는다. 이 표현을 HQ-202 계약 테스트에 넣는다.
  - 이 Gap은 Source가 보낸 것이므로 HQ 자체 Gap 기록과 겹치지 않는다. Source가 보낸 gap Event는 순번에 포함된다(gap-store 주석).
  - 한계:
    - timeout으로 hook이 아무것도 쓰지 못한 경우는 감지하지 못한다.
    - `dropped.log`도 쓰지 못하면 감지하지 못한다.
    - 유실된 신호가 어느 세션의 것인지만 알고 내용은 모른다.
    - `dropped.log`에는 `agent_id`가 없어서, subagent의 유실도 메인 Agent에 붙는다.
    - **첫 신호 전에 전부 유실된 세션**은 Bridge가 모르는 세션이라 Event로 표시할 수 없다(붙일 Agent가 없음). 이런 유실은 세션 키별 개수로 `agent-hq-bridge status`에 "알 수 없는 세션의 유실"로 보여 준다(운영자 경고).

**8. 연결 끊김 해제 기준**
- **현행 유지.** Agent별 규칙(`shownAgentStatus`)이다. Connection이 끊긴 시각(`connectionLostAt`)이 **그 Agent의** 마지막 수신(`lastReceivedAt`)보다 늦으면 `unknown`이고, 그 Agent의 Event를 새로 받으면 풀린다. heartbeat로는 풀리지 않는다(HQ-108).
- 이유:
  - 재연결 후 Bridge가 flush하는 Event는 끊긴 동안 실제로 수집한 신호다. Bridge 기준으로 그 구간을 메운다.
  - 메우지 못한 부분은 7항의 Gap으로 드러난다.
  - 발생 시각 기준으로 바꾸면 Bridge 시계와 서버 시계를 비교해야 하는데, 그렇게 하지 않는다.
- HQ-205는 이 결정을 테스트로 고정한다.

**9. hook의 출력과 세션 생존**
- **hook은 stdout에 아무것도 쓰지 않는다.**
  - 일부 hook(`SessionStart`, `UserPromptSubmit` 등)은 종료 코드 0일 때 stdout을 Claude 컨텍스트에 넣는 것으로 알려져 있다. 정확한 범위는 HQ-206에서 공식 문서로 확인한다.
  - stderr에는 입력 내용을 쓰지 않는다. 오류도 고정 문구만 쓴다.
  - 종료 코드는 항상 0이다. 2(차단)는 쓰지 않는다.
  - 이 세 가지를 테스트로 고정한다.
- Bridge heartbeat는 **Bridge 연결**의 생존이다. 세션 생존과 구분한다.
  - Claude Code가 `SessionEnd` 없이 죽으면(SIGKILL 등) MVP에서는 Stale 표시(HQ-108)로만 드러낸다.
- 조건부 확장(HQ-206 측정):
  - hook의 `ppid`가 Claude Code 프로세스로 확인되어야 한다. `sh -c`로 실행되면 `ppid`는 곧 끝나는 셸이므로 이 경우를 측정에 넣는다.
  - 또 Node 내장 기능만으로 PID 재사용을 구분할 수 있어야 한다(프로세스 시작 시각 등).
  - 둘 다 확인되면 Bridge가 그 PID가 사라진 것을 관찰해 `agent.disconnected`(`reason: "process_exited"`)를 보낸다. 하나라도 안 되면 Stale만 쓴다.
  - 결과는 HQ-206 기록과 domain-model 통합 노트에 남긴다.

**10. RES-002 §6.1 미결 사항**
- 유실된 `SubagentStop`:
  - 병렬 Tool 호출의 hook이 동시에 실행되는지는 **확인하지 않았다**(RES-002 §2.1 "같은 이벤트의 hook은 병렬", §6.1). 그래서 시작 순서 보장을 전제하지 않는다.
  - 규칙(HQ-202 구현):
    - 이전 실행이 아직 열려 있는데 새 `SubagentStart`가 오면, 다음 `SubagentStop`은 **어느 실행의 것인지 알 수 없다.** 이전 실행의 늦은 Stop일 수도 있고 새 실행 자신의 Stop일 수도 있다.
    - 그 Stop은 실행을 지정하지 않는 키(`<agent_id>:unmatched:<sequence>`)로 보내고, 새 실행은 열어 둔다. 그다음 Stop은 새 실행에 연결한다.
    - 이렇게 하면 늦게 도착한 이전 Stop이 새 실행에 붙지 않는다. `agent.completed`는 어느 경우든 그대로 보낸다(관찰한 사실).
  - 빠진 실행은 열린 채 남는다. Agent 상태는 다음 Event로 갱신되고, "종료 미확인" 상태는 만들지 않는다(Event Type 없음).
  - HQ-206 측정에서 순서가 보장되면 규칙을 단순화할 수 있다.
- timeout 유실 감지: 7항의 한계다.
- `not_executed` 유예 시간: 5 s로 시작하고 HQ-206에서 조정한다.
- D2 길이·해시 필드: 추가하지 않는다(M2 범위 밖).

**11. hook 설정**
- 설치 위치:
  - 기본은 관찰할 프로젝트의 `.claude/settings.local.json`이다. 사용자가 프로젝트마다 고른다.
  - 사용자 전역 `~/.claude/settings.json`에는 쓰지 않고, 붙여 넣을 내용만 출력한다(RSK-009, adapter-spec N2).
  - hook은 기존 전역 hook(Orca, iTerm2)과 합쳐져 함께 실행된다(RES-002 §2.1).
- 실행 방식:
  - 모든 hook을 **동기 `command`**로 둔다. async hook끼리는 도착 순서가 보장되지 않는다(RES-002 §5.4).
  - `timeout`은 2 s, `SessionEnd`는 1 s로 시작한다. `SessionEnd` 예산 1.5 s는 전역 hook과 나눠 쓴다(설정으로 최대 60 s까지 늘어남).
  - node 콜드 스타트를 포함한 지연을 HQ-206에서 측정해 조정한다.
  - `onFailure`는 지정하지 않는다(기본 continue).

## Reasons
- Agent를 막지 않는다(NFR-008, adapter-spec N2): 동기 hook이어도 짧은 timeout, 종료 코드 0, `onFailure` 없음이면 실패와 timeout 모두 막지 않는 오류다.
- 유실 경로가 줄어든다: Bridge가 꺼져 있어도 신호가 남는다. 상한을 넘으면 Source 쪽 Gap으로 그 위치에 드러난다. Bridge 재시작에도 멱등 키가 바뀌지 않는다.
- 콘텐츠 비저장 원칙(data-governance)을 디스크 수준에서 지킨다. 원문을 쓰기 전에 버린다.
- 새 의존성과 열린 포트가 없다. 공격 표면과 승인할 항목이 작다.
- M1 API를 바꾸지 않는다. Capability만 HQ-208에서 추가한다.

## Consequences
- 장점:
  - 보안 경계를 OS 사용자 단위로 설명할 수 있다.
  - Bridge 정지·재시작·HQ 정지에도 데이터가 이어진다.
- 단점과 한계:
  - hook마다 프로세스 시작 비용이 든다(측정 필요).
  - 같은 OS 사용자 프로세스(관찰 대상 Agent 포함)의 위조는 막지 못한다(수용, M5·Cloud 때 재검토). HQ 표시는 무결성 증명이 아니다.
  - timeout 유실과 `dropped.log`까지 실패한 유실은 감지하지 못한다.
  - node 경로가 바뀌면 hook이 아무것도 남기지 못한다(`status` 검사로 알림).
  - 재등록하면 Agent가 새로 보인다.
  - SIGKILL 세션은 Stale로만 보일 수 있다.
- 후속 Task: HQ-202~HQ-207의 설계 기준이 된다. HQ-203의 "새 의존성 승인"은 이 결정이 Accepted되면 필요 없다(Node 내장만 사용).

## Status 변경 조건
- 사용자 승인 → Accepted.
- HQ-206 측정에서 병렬 hook 순서·`hrtime` 비교 가능성·`ppid`·stdout 범위가 이 ADR의 전제와 다르면 해당 규칙을 새 ADR로 바꾼다.
- HQ-206 측정에서 hook 지연 p99가 동기 hook timeout(2 s)에 가깝거나, Tool 실행 체감 지연이 문제가 되면 새 ADR로 B안(`http` hook)이나 hook 실행 방식을 다시 검토한다.
