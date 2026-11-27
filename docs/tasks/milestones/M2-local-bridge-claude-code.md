# M2 — Local Bridge & Claude Code Adapter (명세서 Phase 2)

> 목표: 사용자가 평소처럼 Claude Code를 쓰는 동안, 지원되는 hook 신호를 Local Bridge가 공통 Event로 바꿔 HQ에 보내고 Dashboard에서 관찰한다.
> 종료 조건 (명세서 Phase 2): (1) 연결·해제 확인 (2) 지원 hook Event 수신 (3) Agent·Session 식별 (4) Tool Event 매핑 (5) 재연결 때 중복·누락 처리 (6) 지원하지 않는 Capability를 정확히 표시 (7) Secret이 로그·Event에 노출되지 않음
> 상태: In Progress (2026-11-27 계획 작성, HQ-200)
> 입력: [RES-002](../../research/RES-002-claude-code-signals.md) §4~§6.1(hook ↔ Event 매핑, 설계 시사점, 미결 사항), [adapter-spec](../../foundation/adapter-spec.md) §3~§6·§10·N2, [architecture](../../foundation/architecture.md) §5·N2·N3, [security §4.3·§4.6](../../engineering/security.md#43-local-bridge-명세서-4--추가), RSK-001·RSK-009·RSK-016
> 각 Task의 Verification은 [quality-gates §3](../../engineering/quality-gates.md#3-위험도별-필수-gate)의 위험도별 필수 Gate를 따른다. 아래에는 Task 고유 확인만 적는다.
> 승인 공통: Docker(`pnpm infra:up`, `pnpm test:integration`, `pnpm test:e2e`), 새 의존성, migration 적용, CI 설정 변경은 CLAUDE.md §6 승인 대상이다. 각 Task의 Dependencies에는 그 Task 고유의 승인만 적는다.

## 의존성 (Edge 목록 — 각 Task의 Dependencies와 backlog.md가 원천)

| Task | 선행 Task·승인 |
|---|---|
| HQ-200 | M1 종료 |
| HQ-201 | HQ-200, Accepted는 사용자 승인 |
| HQ-202 | HQ-200 (subagent 재개 연결 규칙만 HQ-201 결정을 따른다) |
| HQ-203 | HQ-201 Accepted, HQ-202 Capability 선언, 새 의존성 승인(ADR-0007에서 제안) |
| HQ-204 | HQ-203 |
| HQ-205 | HQ-201 Accepted |
| HQ-206 | HQ-201 Accepted, HQ-202, HQ-204 outbox 인터페이스 |
| HQ-207 | HQ-206, hook 설치 위치 결정(ADR-0007) |
| HQ-208 | HQ-202 Capability 선언 |
| HQ-209 | HQ-208, migration 승인 |
| HQ-210 | HQ-209 |
| HQ-211 | HQ-203~HQ-210, 실제 세션 관찰 사용자 동의, scratch hook 설정 승인 |

병렬 그룹: A = HQ-201·HQ-202, B = HQ-203·HQ-205·HQ-208 (HQ-201 Accepted 뒤. HQ-208은 HQ-202만 있으면 시작 가능), C = HQ-204·HQ-209, D = HQ-206·HQ-210, E = HQ-207, F = HQ-211.

## M1에서 이어 가는 항목
- HQ-114 Gap 증분 검사: M1 파일에 보류 상태로 남고, 시작 조건(로그 50만 건 또는 정상 상태 1회 1 s 초과)을 M2 기간에도 본다
- RES-002 §6.1 미결 사항 → HQ-201(결정), HQ-202·HQ-205(반영), HQ-206·HQ-211(측정)
- NFR-002a 목표 수치 확정 (사용자 결정 대기, M1 종료 조건은 아님)

## 명세서 Phase 2 Task ↔ M2 Task
Local Bridge Bootstrap·Device Pairing·Secure Connection → HQ-201·HQ-203 / Claude Code Hook Integration → HQ-206·HQ-207 / Event Normalization·Subagent Mapping·Tool Event Mapping → HQ-202 / Local Outbox·Retry → HQ-204 / Disconnect·Reconnect → HQ-204·HQ-205 / Capability Declaration → HQ-202·HQ-203·HQ-208~HQ-210.
adapter-spec §10 테스트 요구: mapping·duplicate·out-of-order·secret → HQ-202, runtime version → HQ-208(버전 기록)·HQ-211(실제 버전 확인), capability → HQ-202·HQ-208, connection lifecycle·disconnect/reconnect → HQ-203·HQ-204, unsupported control → HQ-210(제어 없음 표시). security §4.6: Token expiration/revocation·Local Bridge pairing → HQ-203, Secret redaction → HQ-202·HQ-211.

---

### HQ-200 — M1 종료 점검과 M2 Task 분해
- Status: In Review (2026-11-27) · Risk: 1 (계획 문서) · Role: Coordinator → Reviewer
- Objective: M1 종료 조건을 근거와 함께 확인해 닫고, M2를 실행 가능한 Task로 나눈다.
- Background: M1 마지막 Task(HQ-111) 완료, backlog "M1이 끝나면 M2 Task를 상세화한다"
- Scope: M1 종료 기록(milestone·roadmap·backlog), 이 파일 작성, current-status·changelog, CLAUDE.md §2 현재 단계 문구
- Out of Scope: ADR 작성(HQ-201), 코드
- Interfaces: 없음 (문서)
- Dependencies: M1 종료
- Files Expected to Change: `CLAUDE.md` §2(현재 단계 문구, G5 명령), `docs/tasks/milestones/M1-event-ingestion-core.md`, 이 파일, `docs/tasks/backlog.md`, `docs/foundation/roadmap.md`, `docs/operations/{current-status,changelog}.md`
- Acceptance Criteria:
  - [x] M1 종료 조건 9개마다 충족 근거(Task·테스트)가 기록된다
  - [x] M2 Task마다 Scope·Out of Scope·AC·Dependencies·Files Expected to Change가 있다
  - [x] 사용자 결정이 필요한 항목이 Task 의존성과 current-status에 적힌다
- Verification: 위험도 1 기준 (문서 링크·모순 G9, 로컬 독립 리뷰)
- Risks: CLAUDE.md는 Coordinator 관리 문서(사람 승인)다 — §2 문구 변경을 PR에서 사용자에게 확인받는다
- Execution Log:
  #### Run 2026-11-27-2
  - agent_id: claude-code:main (Coordinator) · status: In Review
  - result: M1 종료 근거 표(M1 파일 머리말), M2 Task HQ-200~HQ-211
  - 로컬 리뷰: Request Changes (Major 6, Minor 10, Nit 7) → 반영: 의존성 표·backlog 일치, RES-002 §6.1 미결(유실 Stop·재개, timeout 유실 감지)과 세션 생존 판정을 HQ-201에 추가, 끊김 해제 기준 구현 Task(HQ-205) 신설, Capability를 계약·저장·화면(HQ-208~210)으로 분리하고 Bridge 보고를 HQ-203에, Bridge 코어를 pairing(HQ-203)과 outbox(HQ-204)로 분리, Projection 확인을 `apps/api/test`로(의존 방향), 위조 위협 범위를 다른 OS 사용자로 한정하고 같은 사용자 프로세스는 ADR에서 수용 여부 결정, security §4.6·adapter-spec §10 테스트 대응표, allowlist 필드 AC, HQ-211 위험도 3, 승인 공통 문구, 필수 필드(Background·Interfaces·Risks), M1 파일 HQ-103 상태·조건 3 근거 수정
  - 리뷰 지적 중 사실 확인으로 바꾼 것: Runtime 버전은 Envelope `source`가 strict라 Event에 넣을 수 없음 → HQ-208 Snapshot에서 기록

### HQ-201 — ADR-0007 Local Bridge 구조와 보안 (Proposed)
- Status: Backlog · Risk: 3 (보안 경계·제품 결정) · Role: Architect → Reviewer(보안)
- Objective: Bridge 구현 전에 프로세스 구조, hook → Bridge 로컬 구간, 자격 증명, 전송·재연결 규칙을 하나의 결정으로 묶는다. 사용자 승인 후 HQ-203~HQ-207이 시작된다.
- Background: RSK-016("Phase 2 착수 전 Bridge 보안 ADR"), security §4.3, RES-002 §5·§6.1, architecture §5
- Scope: 다음 항목마다 선택지·장단점·추천을 담은 ADR 초안. 필요하면 저장소 밖 scratch에서 짧은 검증 스파이크(측정값과 삭제 기록 남김)
  1. 프로세스 구조: 상주 Bridge 프로세스(`apps/bridge`) + hook마다 실행되는 짧은 hook 명령. Bridge가 꺼져 있을 때 hook이 무엇을 하는가
  2. hook → Bridge 로컬 구간: 소유자 전용 spool 디렉터리(0700/0600)에 append vs 로컬 소켓/HTTP + 로컬 토큰. **위협 범위**: 다른 OS 사용자는 막는다. 같은 OS 사용자의 다른 프로세스는 파일 권한으로 막을 수 없으므로 대응 가능 범위(로컬 토큰 등)와 **수용하는 위험**을 명시한다(RSK-016)
  3. 매핑 위치: hook 명령이 원본을 넘기고 Bridge가 매핑하는가, hook 명령이 매핑해 D2를 즉시 버리는가(spool에 원문이 남는지 여부)
  4. Bridge 저장소: 영속 outbox 형식(JSONL vs SQLite), 보관 기간, 전송 완료 표시. 새 런타임·의존성이 필요하면 여기서 제안한다
  5. Pairing·자격 증명: HQ-103 등록 코드 → Connection 토큰 재사용, 토큰 저장 위치·권한, 폐기·만료 시 Bridge 동작
  6. 전송: 배치, 지수 백오프 + jitter, `429`·`503`의 `Retry-After` 준수, heartbeat 주기, Capability 보고 시점
  7. `sequence`·`occurredAt`: Bridge가 세션별 도착 순서로 매김, `timestampQuality: "collected"`
  8. 연결 끊김 해제 기준(RES-002 §6, HQ-108 Open): 재연결 뒤 flush된 과거 Event가 `unknown`을 풀어도 되는가
  9. **세션 생존 판정**: Bridge가 상주하면 Claude Code가 SIGKILL로 죽어도 Connection heartbeat는 계속된다. Bridge heartbeat(연결)와 세션 생존을 어떻게 구분해 보여 줄지(Stale만으로 충분한지 포함)
  10. RES-002 §6.1 미결: 유실된 `SubagentStop` 뒤 같은 `agent_id` 재개 시 연결 규칙, timeout으로 유실된 hook Event를 감지할 방법(hook 쪽 순번 등)
  11. hook 설치 위치: 프로젝트 `.claude/settings.local.json` vs 사용자 설정. 전역 설정을 자동 수정하지 않는다(RSK-009, adapter-spec N2)
- Out of Scope: 구현, Cloud TLS, 제어 명령(M5)
- Interfaces: Produces ADR-0007(HQ-203~HQ-207의 설계 기준)
- Dependencies: HQ-200. **Accepted는 사용자 승인**(CLAUDE.md §6)
- Files Expected to Change: `docs/decisions/ADR-0007-local-bridge.md`, `docs/decisions/README.md`, `docs/foundation/architecture.md` 통합 노트, `docs/engineering/security.md` §4.3, `docs/operations/risks.md`(RSK-016), `docs/research/RES-002-claude-code-signals.md` §6.1
- Acceptance Criteria:
  - [ ] 위 11개 항목마다 결정(또는 명시적 보류와 이유)이 있다
  - [ ] 위협(위조 — 다른 OS 사용자·같은 사용자 프로세스, 토큰 유출, Bridge 정지 중 hook)마다 대응 또는 수용 근거가 있다
  - [ ] hook이 Agent 실행을 막지 않는 조건(종료 코드, timeout, Bridge 부재)이 명시된다
  - [ ] 사용자가 Accepted/수정 결정을 내린다
- Verification: 위험도 3 기준(보안 검토 포함)
- Risks: 문서만으로 정할 수 없는 값(timeout, 유예 시간)은 측정 Task(HQ-206)로 넘기고 ADR에 "측정 후 확정"으로 둔다

### HQ-202 — Claude Code Adapter 매핑 패키지 (순수 함수 + 계약 테스트)
- Status: In Review (2026-11-27) · Risk: 3 (공용 패키지, Event 계약 표현 규약) · Role: Worker → Reviewer
- Objective: hook 입력 한 건(과 세션 상태)을 받아 공통 Event를 만드는 매핑을 네트워크·파일 없이 결정적으로 구현한다. Bridge 설계와 독립적으로 먼저 진행한다.
- Background: RES-002 §4 매핑표, §5.3~§5.5, §6 표현 규약, adapter-spec §10
- Scope:
  - `packages/adapter-claude-code`(architecture N3): hook 입력 Zod 스키마. **allowlist 필드만 복사**하고 나머지(`tool_input`·`prompt` 등 D2, `cwd`·`transcript_path` 같은 경로, 오류 원문)는 버린다
  - 세션 상태(메인 Agent 외부 ID, subagent 실행 순번, 열린 Tool 호출), Bridge가 매길 `sequence`·시각은 입력
  - 매핑: SessionStart/End, UserPromptSubmit, Stop(`waiting`, `rawStatus: "stop"`), Notification·PermissionRequest(`waiting`), StopFailure, SubagentStart/Stop(FIFO 실행 연결, 유실 Stop 처리는 ADR-0007 결정을 따름), Pre/PostToolUse, PostToolUseFailure(`interrupted`), PostToolBatch(`not_executed`는 확정 조건 충족 때만, 유예 시간은 입력)
  - 멱등 키 규칙(§5.5). Runtime 버전은 Envelope에 필드가 없으므로(`source`는 strict) Event에 넣지 않는다 — 버전 기록은 HQ-208 Capability Snapshot에서 정한다
  - Capability 선언(adapter-spec §4): attached만, 제어 unsupported, `features`(subagents·toolEvents true, messageEvents·tokenUsage·artifacts·replay·reconciliation false)
- Out of Scope: hook 실행·전송·저장(HQ-203~HQ-206), 계약(schemaVersion 1) 변경, D2 길이·해시 필드(필요하면 별도 Task)
- Interfaces: Consumes `@agent-hq/events` / Produces `pickAllowed`, `mapHook(state, input, meta) → { state, events, ignored }`, `expirePending`, `mapDropped`, `CLAUDE_CODE_CAPABILITIES`
- Dependencies: HQ-200. 새 workspace 패키지(외부 의존성은 이미 쓰는 Zod만. 그 밖이 필요하면 승인)
- Files Expected to Change: `packages/adapter-claude-code/**`, 루트 `package.json`·`pnpm-lock.yaml`·`tsconfig.json`(references), `eslint.config.js`(의존 방향), `vitest.shared.ts`(alias), `apps/api/package.json`(devDependency)·`apps/api/test/claude-code-mapping.int.test.ts`(Projection 확인 — 패키지가 apps에 의존하지 않도록 API 쪽에 둔다), `docs/foundation/adapter-spec.md` 통합 노트
- Acceptance Criteria:
  - [x] RES-002 §4 표의 hook 행마다 매핑 테스트가 있고 결과 Event가 계약 검증을 통과한다
  - [x] 같은 입력 순서 → 같은 Event(멱등 키 포함). 재개된 subagent와 뒤늦은 Post가 중복으로 버려지지 않고, 병렬 Tool의 Post가 시작 순서와 다르게 와도(out-of-order) 호출별로 맞게 묶인다
  - [x] allowlist 밖 필드(픽스처에 넣은 표식 문자열: D2·경로·오류 원문)가 결과 Event 어디에도 없다
  - [x] 매핑 결과를 API에 넣으면 메인 Agent·subagent의 부모 관계와 Tool 상태가 기대대로 조회된다(`apps/api/test` 통합 테스트)
  - [x] 모르는 hook 이름·필드는 조용히 잘못 매핑하지 않는다(`ignored`로 보고)
  - [x] Capability 선언이 계약 형태 테스트를 통과한다
- Verification: 위험도 3 기준 + G4(Projection 확인)
- Risks: 실제 hook 입력과의 차이는 합성 픽스처로 못 잡는다 → HQ-211에서 실제 세션으로 확인
- 범위 변경: `docs/engineering/coding-standards.md` §4 의존 방향 표. `zod`는 쓰지 않음(allowlist가 형식 검사, 결과 Event는 `parseIncomingEvent`로 검증) → 외부 의존성 추가 없음
- Execution Log:
  #### Run 2026-11-27-5
  - agent_id: claude-code:main (Worker) · status: In Review
  - result: `packages/adapter-claude-code` — `allowlist.ts`(import 없음), `map.ts`(`mapHook`·`expirePending`·`mapDropped`), `capabilities.ts`. 규약은 adapter-spec N3
  - verification: 단위 22개(hook 행별 매핑, 결정성, 재개 subagent·유실 Stop, out-of-order Post, `not_executed` 규칙 1~3·늦은 Post, 표식 문자열 비노출, 모르는 입력 보고, Capability), 통합 3개(`apps/api/test/claude-code-mapping.int.test.ts`: 부모 관계·Tool·재전송 중복 0·dropped gap → unknown → 회복). `pnpm verify`(단위 219), `pnpm test:integration`(72)
  - 로컬 리뷰(보안 포함): Request Changes (Major 3, Minor 7, Nit 4) → 반영: 같은 Tool 병렬 호출에서 PermissionRequest 대상이 모호하면 표시하지 않고 규칙 3으로(실행된 호출에 not_executed가 나가던 문제), 같은 hook 중복 입력은 `ignored: duplicate`(같은 키·다른 내용 → 409 → 가짜 Gap 방지, 대기 중 호출 초기화 방지), 바뀐 세션만 복사 + `pruneSessions`(순번 보존), 시각 사전 검사·숫자 비교, ID 토큰은 `:` 금지·100자, `mapDropped` 입력 검사·모르는 세션 무시, Capability `features` 고정, lint에 `@agent-hq/domain` 금지 추가. ADR-0007과 함께 정한 것: 모호한 subagent Stop은 실행을 지정하지 않음(`unmatched`)
  - verification(수정 후): 단위 28개, `pnpm verify`(단위 225), `pnpm test:integration`(72)

### HQ-203 — Local Bridge: Pairing·자격 증명·heartbeat·Capability 보고
- Status: Backlog · Risk: 3 (자격 증명, 신규 앱) · Role: Worker → Reviewer(보안)
- Objective: Bridge가 등록 코드로 HQ에 연결해 토큰을 안전하게 보관하고, heartbeat와 Capability를 보고하며, 폐기·만료를 올바르게 처리한다.
- Background: security §4.3·§4.6(Local Bridge pairing, Token expiration/revocation), HQ-103, ADR-0007 5·6
- Scope: `apps/bridge` 골격(ADR-0007 구조), pairing 명령, 토큰 저장(소유자 전용), heartbeat 루프, Capability 보고(전달 경로는 HQ-208 계약), 폐기·만료 시 전송 중단과 상태 출력, 종료 처리
- Out of Scope: outbox·Event 전송(HQ-204), hook 명령(HQ-206)
- Interfaces: Consumes `POST /connections`·heartbeat API, `CLAUDE_CODE_CAPABILITIES` / Produces Bridge 설정·자격 증명 모듈(HQ-204가 사용)
- Dependencies: HQ-201 Accepted, HQ-202 Capability 선언, 새 의존성 승인(ADR-0007 제안)
- Files Expected to Change: `apps/bridge/**`, 루트 `package.json`·`pnpm-lock.yaml`·`tsconfig.json`·`eslint.config.js`, `docs/engineering/quality-gates.md`(Bridge 테스트 위치)
- Acceptance Criteria:
  - [ ] 등록 코드로 한 번만 등록되고, 같은 코드 재사용·만료 코드는 거부된다
  - [ ] 토큰 파일이 소유자 전용 권한이고, 토큰이 로그·오류 메시지에 없다
  - [ ] heartbeat를 멈추면 Query API에서 Connection `disconnected`, Agent `unknown`이 된다(HQ-108)
  - [ ] 토큰을 폐기(`admin revoke`)하거나 만료되면 Bridge가 전송을 멈추고 재등록이 필요하다고 알린다
- Verification: 위험도 3 기준 + G4(Bridge ↔ 실제 API)
- Risks: Bridge 테스트를 CI에 넣으려면 workflow 변경 승인이 필요하다

### HQ-204 — Local Bridge: Outbox·전송·재연결
- Status: Backlog · Risk: 3 (Event 유실·중복 경로) · Role: Worker → Reviewer
- Objective: outbox에 들어간 Event를 Bridge·API 재시작에도 잃지 않고, 한 번씩(멱등) 보낸다.
- Background: architecture §5 재연결, RES-002 §5.3, ADR-0007 4·6·7
- Scope: 영속 outbox, 세션별 `sequence`, 배치 전송, 지수 백오프 + jitter, `Retry-After`, 전송 완료 표시와 정리
- Out of Scope: hook 명령(HQ-206), HQ 쪽 끊김 해제 규칙(HQ-205)
- Interfaces: Consumes HQ-203 자격 증명 모듈, `POST /events` / Produces outbox 쓰기 인터페이스(HQ-206이 사용 — 이 Task 시작 시 먼저 확정·커밋)
- Dependencies: HQ-203
- Files Expected to Change: `apps/bridge/**`
- Acceptance Criteria:
  - [ ] API를 멈췄다 다시 띄워도 outbox의 Event가 누락 없이 저장되고 중복은 0건이다(통합 테스트)
  - [ ] Bridge를 강제 종료 후 재시작해도 보내지 않은 Event가 이어서 전송된다
  - [ ] `503`·`429`에서 `Retry-After`를 지키고 백오프에 jitter가 있다
  - [ ] outbox 일부를 일부러 버리면 HQ에 Gap(`event.gap.detected`)이 기록된다
- Verification: 위험도 3 기준 + G4

### HQ-205 — ADR-0007 결정의 HQ 쪽 반영 (끊김 해제·세션 생존)
- Status: Backlog · Risk: 3 (Projection 규칙) · Role: Worker → Reviewer
- Objective: ADR-0007의 연결 끊김 해제 기준과 세션 생존 판정을 Projection·조회·Dashboard 표시에 반영한다. 결정이 "현행 유지"면 그 근거와 테스트만 남기고 닫는다.
- Background: RES-002 §6(HQ-108 Open), ADR-0007 8·9, domain-model N5
- Scope: `projectConnectionLoss`·`shownAgentStatus` 규칙 변경(결정 시), Replay 동일성 유지, 화면 사유 문구
- Out of Scope: Bridge 쪽 동작
- Interfaces: Consumes ADR-0007 / Produces domain-model N5 갱신
- Dependencies: HQ-201 Accepted
- Files Expected to Change: `apps/api/src/projection/**`, `apps/api/test/gap-stale.int.test.ts`, `apps/web/lib/status.ts`, `docs/foundation/domain-model.md` 통합 노트
- Acceptance Criteria:
  - [ ] 끊긴 뒤 재연결해 끊기기 전 Event가 flush돼도 ADR 결정대로 표시된다(통합 테스트)
  - [ ] 실시간 = Replay, 순서 무관 테스트가 유지된다
- Verification: 위험도 3 기준 + G4

### HQ-206 — Claude Code hook 수집 명령
- Status: Backlog · Risk: 3 (관찰 대상 Agent 실행 경로) · Role: Worker → Reviewer(보안)
- Objective: Claude Code가 실행하는 hook 명령이 입력을 Bridge 로컬 구간에 넘기고 즉시 끝나며, 실패해도 Claude Code를 막지 않는다.
- Background: RES-002 §5.1·§5.4, security §4.3, ADR-0007 1~3
- Scope: hook 진입점(stdin JSON → ADR-0007 3에 따라 매핑 또는 원본 전달), 로컬 구간 인증, 짧은 timeout, Bridge 부재 시 동작, 지연 측정(RES-002 §6.1 동기 hook timeout 값)
- Out of Scope: 설정 파일 설치(HQ-207)
- Interfaces: Consumes HQ-204 outbox 쓰기 인터페이스, HQ-202 `mapHook`
- Dependencies: HQ-201 Accepted, HQ-202, HQ-204 outbox 인터페이스
- Files Expected to Change: `apps/bridge/**`(hook 진입점) 또는 ADR-0007이 정한 위치, `docs/research/RES-002-claude-code-signals.md`(측정값)
- Acceptance Criteria:
  - [ ] hook 1회 실행 지연(p50·p99)을 측정해 기록하고 timeout 값을 정한다
  - [ ] Bridge가 꺼져 있거나 spool이 가득 차도 종료 코드 0/1로 빠르게 끝나고 Claude Code를 막지 않는다
  - [ ] ADR-0007이 막기로 한 범위(최소: 다른 OS 사용자)의 위조 Event가 거부된다
  - [ ] 입력 원문(D2·경로)이 ADR-0007이 허용한 곳 밖(spool·로그)에 남지 않는다
- Verification: 위험도 3 기준
- Risks: 같은 OS 사용자 프로세스의 위조는 ADR-0007의 수용 위험으로 남을 수 있다

### HQ-207 — hook 설치·제거 명령
- Status: Backlog · Risk: 3 (harness 설정 파일을 쓰는 도구) · Role: Worker → Reviewer
- Objective: 사용자가 명시적으로 고른 위치에만 Agent HQ hook을 추가·제거하고, 기존 hook(Orca, iTerm2 등)과 공존한다.
- Background: RSK-009, adapter-spec N2, RES-002 §5.1
- Scope: 설치 명령(대상 설정 파일 지정 필수, 변경 미리 보기 → 확인 후 쓰기, 백업), 제거 명령(Agent HQ가 넣은 항목만), 사용자 전역 설정은 자동 수정하지 않고 붙여 넣을 내용만 출력
- Out of Scope: 이 저장소의 `.claude/settings*.json` 변경(HQ-005, 별도 승인)
- Interfaces: Consumes HQ-206 hook 명령 경로·timeout
- Dependencies: HQ-206, hook 설치 위치 결정(ADR-0007)
- Files Expected to Change: `apps/bridge/**`(CLI), `README.md`(설치 안내)
- Acceptance Criteria:
  - [ ] 기존 hook이 있는 설정 파일에 설치·제거해도 다른 항목이 그대로다(픽스처 테스트)
  - [ ] 미리 보기 없이 파일을 쓰지 않는다. 설치를 두 번 해도 항목이 중복되지 않는다
  - [ ] 사용자 전역 설정 경로를 대상으로 주면 쓰지 않고 안내만 출력한다
- Verification: 위험도 3 기준

### HQ-208 — Capability 계약
- Status: Backlog · Risk: 3 (API 계약) · Role: Architect → Reviewer
- Objective: Connection의 Capability Snapshot 형태와 전달 경로를 계약으로 정한다.
- Background: adapter-spec §4("UI는 실제 연결의 Capability Snapshot을 사용"), 제품 원칙 "지원하지 않는 기능을 지원하는 것처럼 표현하지 않는다"
- Scope: Snapshot 스키마(Runtime·Adapter 버전 포함 — adapter-spec §4 "Runtime 버전에 따라 달라질 수 있다"), 전달 경로(등록 요청 필드 또는 별도 보고 API) 결정, `ConnectionView` 필드(미선언 = 알 수 없음), architecture N6·N7 갱신
- Out of Scope: 저장·구현(HQ-209), 화면(HQ-210)
- Interfaces: Consumes `CLAUDE_CODE_CAPABILITIES` 형태 / Produces 계약(HQ-203·HQ-209·HQ-210이 사용)
- Dependencies: HQ-202 Capability 선언
- Files Expected to Change: `packages/contracts/src/{connections,query}/**`, `docs/foundation/architecture.md` N6·N7
- Acceptance Criteria:
  - [ ] 잘못된 Snapshot(모르는 control 값, 타입 오류)이 계약 테스트에서 거부된다
  - [ ] 미선언과 "전부 미지원"이 계약에서 구분된다
- Verification: 위험도 3 기준(순수 계약 → 계약 테스트로 G4 대체)

### HQ-209 — Capability 저장·조회
- Status: Backlog · Risk: 3 (migration) · Role: Worker → Reviewer
- Objective: 계약대로 받은 Capability를 저장하고 Query API로 제공한다.
- Background: HQ-208
- Scope: migration, 저장소, 등록·보고 경로 처리, `GET /workspaces/:id/connections` 응답
- Out of Scope: 화면(HQ-210)
- Interfaces: Consumes HQ-208 계약
- Dependencies: HQ-208, migration 승인
- Files Expected to Change: `packages/database/**`(schema·migration·store), `apps/api/src/{connections,query}/**`, `apps/api/test/connections.int.test.ts`
- Acceptance Criteria:
  - [ ] 선언한 Connection은 Snapshot이, 미선언 Connection은 "알 수 없음"이 조회된다(통합 테스트)
  - [ ] 기존 Connection 행에 migration을 적용해도 데이터가 보존된다
- Verification: 위험도 3 기준 + G4

### HQ-210 — Capability 화면 표시
- Status: Backlog · Risk: 2 · Role: Worker → Reviewer
- Objective: Dashboard Connection 영역에 Capability를 항목별 지원/미지원/알 수 없음으로 보여 주고, 제어 기능은 "지원 안 함"으로 표시한다.
- Background: HQ-208·HQ-209, adapter-spec §10 Unsupported control
- Scope: Connection 컴포넌트, 상태 문구(아이콘 + 텍스트), E2E 확인 추가
- Out of Scope: 제어 버튼(M5), Capability 기반 UI 분기 전체(M3)
- Interfaces: Consumes HQ-208 `ConnectionView`
- Dependencies: HQ-209
- Files Expected to Change: `apps/web/app/components/connections.tsx`, `apps/web/lib/status.ts`, `apps/web/app/components/render.test.tsx`, `e2e/dashboard.spec.ts`
- Acceptance Criteria:
  - [ ] 시뮬레이터 Connection은 "알 수 없음", Capability를 선언한 Connection은 항목별로 보인다(G5)
  - [ ] 제어(pause·resume·cancel)는 지원하는 것처럼 보이는 요소 없이 "지원 안 함"으로 표시된다
- Verification: 위험도 2 기준 + G5

### HQ-211 — 실제 Claude Code 세션 관찰 검증
- Status: Backlog · Risk: 3 (관찰 대상 Agent에 hook 설치, Secret 검증) · Role: QA → Reviewer(보안)
- Objective: scratch 프로젝트의 실제 Claude Code 세션을 Bridge로 관찰해 M2 종료 조건을 확인한다.
- Background: M2 종료 조건 (1)~(7), adapter-spec §6 "버전별 계약 테스트"
- Scope: scratch 프로젝트(저장소 밖)에 HQ-207로 hook 설치 → 세션 시작, 프롬프트, Tool(성공·실패·거부), subagent, 종료(정상·SIGTERM·SIGKILL), Bridge 재시작·API 재시작 중 작업 → Dashboard 확인. Secret 비노출 검사(표식 Secret 문자열을 프롬프트·파일에 넣고 DB·API 로그·Bridge 파일 검색). 실제 입력과 HQ-202 픽스처의 차이 기록, Claude Code 버전 기록. 결과를 RES-002 후속 절(또는 새 RES)로 남기고 수집 파일 삭제 기록
- Out of Scope: 이 저장소 개발 세션의 dogfooding(별도 동의)
- Interfaces: 없음 (검증)
- Dependencies: HQ-203~HQ-210, **실제 세션 관찰 사용자 동의**(adapter-spec N2), scratch hook 설정 승인
- Files Expected to Change: `docs/research/RES-002-claude-code-signals.md`(또는 새 RES), 이 파일, 차이가 발견되면 HQ-202 픽스처(별도 수정 Task)
- Acceptance Criteria:
  - [ ] 종료 조건 (1)~(7)마다 관찰 결과와 근거가 기록된다
  - [ ] Bridge·API 재시작 구간에서 누락은 Gap으로, 중복은 0건으로 확인된다
  - [ ] 표식 Secret이 DB·API 로그·Bridge 파일 어디에도 없다
- Verification: 위험도 3 기준 + 수동 확인 기록
- Risks: 실제 세션에는 사용자 콘텐츠가 들어간다 — scratch 프로젝트와 합성 프롬프트만 쓰고, 수집 파일은 검증 후 삭제한다
