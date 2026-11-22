# M0 — Harness Bootstrap

> 목표: Agent와 사람이 일관되게 개발할 수 있는 문서·규칙·도구 기반을 만들고, 기술 스택을 결정해 첫 코드를 쓸 준비를 한다.
> 종료 조건: (1) 첫 커밋 존재 (2) ADR-0001·0002·0003 Accepted (또는 대체 ADR Accepted) (3) 로컬 Quality Gate 명령 동작 (4) quality-gates.md에 실제 명령 기록
> 상태: In Progress

---

### HQ-000 — Harness 문서 체계 구축
- Status: In Review
- Risk: Low
- Role: Coordinator (Claude Code)
- Objective: 문서 체계, CLAUDE.md, Agent 협업 규칙, 초기 Backlog를 만든다.
- Background: 사용자 요청 (2026-11-22). 기능 구현은 하지 않는다.
- Scope: `CLAUDE.md`, `README.md`, `docs/**`
- Out of Scope: 제품 코드, 패키지 설치, 설정 파일, 커밋
- Dependencies: —
- Files Expected to Change: `CLAUDE.md`, `README.md`, `docs/**`
- Acceptance Criteria:
  - [x] 요청된 디렉터리 구조의 문서가 모두 존재
  - [x] 확인한 명령·버전만 사실로 기록, 나머지는 Proposed/Unknown
  - [ ] 사용자 검토 완료
- Verification Steps:
  1. 문서 내 상대 링크 검사 (G9)
  2. 독립 리뷰 (Reviewer subagent)
- Execution Log:
  #### Run 2026-11-22-1
  - agent_id: claude-code:main · role: Coordinator/Architect/Documenter
  - status: succeeded (사용자 검토 대기)
  - changed_files: CLAUDE.md, README.md, docs/** (33개 Markdown 파일)
  - verification:
    - G9 링크·앵커 검사 (scratch의 일회성 Python 스크립트, 저장소에 넣지 않음): 1차 `files=33 problems=0`, 리뷰 반영 후 재실행 결과는 Run 2026-11-22-2
    - G8 독립 리뷰 (Claude Code general-purpose subagent, 읽기 전용): Request Changes. Blocker 1, Major 10, Minor 12, Nit 1
  - decisions: ADR-0001~0003 Proposed
  #### Run 2026-11-22-2
  - agent_id: claude-code:main · role: Worker (리뷰 반영)
  - status: succeeded
  - result: 리뷰 24건 중 23건 반영. #24 후반부(projectId 표기)는 `orca worktree current` 출력이 `github:maru-dev4905/agent-hq`임을 확인해 반영하지 않음. #22(product.md)는 해당 내용이 이미 "해석" 열에 있어 문구만 다듬음
  - verification: G9 재실행 — 최종 보고 직전 결과 `files=33 problems=0`
  - feedback loop: 리뷰 결과 원인은 (b) 문서 간 중복으로 생긴 불일치, (a) Task 필드 누락. task-protocol에 "Gate는 §3 그대로", "의존성 동기화" 규칙 추가

### HQ-001 — 첫 커밋 (Harness 문서)
- Status: Blocked (커밋 승인 요청함, 2026-11-22)
- Risk: Low
- Objective: Harness 문서를 첫 커밋으로 남겨 worktree·diff 기반 작업을 가능하게 한다 (ISS-001 해결).
- Scope: HQ-000 산출물 커밋. 원격 push는 별도 승인.
- Out of Scope: 코드, 설정
- Dependencies: HQ-000 사용자 검토, 커밋 승인
- Files Expected to Change: (없음 — Git 이력만)
- Acceptance Criteria:
  - [ ] `git log --oneline -1`에 커밋 존재
  - [ ] 커밋에 Secret·개인정보 없음
- Verification Steps:
  1. `git show --stat HEAD`로 포함 파일 확인
  2. ISS-001 Verification Method 수행 후 Resolved 처리

### HQ-002 — M1 핵심 ADR 결정 (ADR-0001·0002·0003)
- Status: Ready
- Risk: High
- Role: Architect (RES-001 수행) → 사용자 (승인)
- Objective: M1 착수에 필요한 ADR-0001(프로세스), ADR-0002(Event 중심 코어), ADR-0003(기술 스택)을 Accepted(또는 수정 후 Accepted)로 만든다.
- Background: RES-001, architecture.md §4
- Scope: RES-001 수행(공식 문서로 후보 버전·안정성 확인, 필요 시 scratch 프로토타입), ADR-0003에 버전·근거 기록, 세 ADR의 승인 요청. 요청 후 상태를 Blocked로 바꾼다.
- Out of Scope: 저장소에 패키지 설치, 스캐폴드
- Dependencies: 없음 (사용자 승인은 Task 후반)
- Files Expected to Change: `docs/decisions/ADR-0001-*.md`·`ADR-0002-*.md`·`ADR-0003-*.md`(Status 줄과 Proposed 본문), `docs/decisions/README.md`, `docs/foundation/architecture.md`, `docs/research/README.md`
- Acceptance Criteria:
  - [ ] RES-001 Result 기록
  - [ ] ADR-0001·0002·0003 Status = Accepted (승인 날짜 기록) 또는 대체 ADR
  - [ ] architecture.md §4 표 갱신
- Verification Steps (quality-gates §3 Low — 문서만 변경):
  1. G9 문서 Gate: ADR 상태와 architecture 표, decisions 색인 일치 확인
  2. G8 자가 점검

### HQ-003 — 저장소 스캐폴드 + 로컬 Quality Gate
- Status: Backlog
- Risk: Medium
- Objective: 승인된 스택으로 빈 모노레포를 만들고 G1·G2·G3·G6을 하나의 로컬 명령으로 실행 가능하게 한다.
- Background: RSK-014, NFR-007, quality-gates §2
- Scope: 패키지 매니저 설정, 런타임 버전 고정, TS 설정(strict), lint/format, 테스트 러너, 빈 패키지 골격(coding-standards §4), `.gitignore`(`.env*`, 로컬 DB 파일 패턴 포함), `.env.example`, 설치 스크립트 허용 목록(security §6), README 실행 절차, quality-gates.md 갱신
- Out of Scope: 제품 로직, CI
- Dependencies: HQ-001, HQ-002, 의존성 설치 승인
- Files Expected to Change: 루트 설정 파일, `packages/*/` 골격, `README.md`, `docs/engineering/quality-gates.md`, `docs/engineering/coding-standards.md`
- Acceptance Criteria:
  - [ ] 클린 클론에서 README 절차만으로 설치·검증 명령 성공
  - [ ] 샘플 단위 테스트 1개가 Gate에서 실행됨
  - [ ] 고의 타입 오류·lint 오류가 Gate를 실패시킴
  - [ ] quality-gates.md의 G1·G2·G3·G6 상태가 `Local`, 명령 기록
- Verification Steps (quality-gates §3 Medium):
  1. scratch 디렉터리에 클론 후 README 절차 실행
  2. 오류 주입 → Gate 실패 확인 → 원복
  3. G8 독립 리뷰 (lockfile·의존성 목록 포함)

### HQ-004 — CI 및 문서 검사 자동화
- Status: Backlog
- Risk: Medium
- Objective: PR마다 로컬 Gate와 문서 링크 검사를 자동 실행한다.
- Background: TD-002, RSK-011
- Scope: GitHub Actions 워크플로(승인 필요), 링크 검사, 의존성 취약점 검사 도입 검토
- Out of Scope: 배포
- Dependencies: HQ-003, CI 도입 승인
- Files Expected to Change: `.github/workflows/*`, `docs/engineering/quality-gates.md`, `docs/operations/technical-debt.md`
- Acceptance Criteria:
  - [ ] PR에서 Gate 실행, 실패 시 표시
  - [ ] 깨진 문서 링크가 CI를 실패시킴
- Verification Steps:
  1. 실패를 의도한 테스트 PR로 확인 (사용자 승인 후)

### HQ-005 — Claude Code 프로젝트 설정
- Status: Backlog
- Risk: Medium
- Objective: 문서 규칙 일부를 Claude Code 설정으로 강제하고, 역할별 subagent 정의를 만든다 (TD-001).
- Background: agent-workflow §4, subagent-roles §3
- Scope: 프로젝트 `.claude/settings.json` 권한(deny/ask) 제안, `.claude/agents/` 역할 정의(Reviewer, Architect 등) 제안. 적용 전 설정 키를 설치 버전 공식 문서로 확인.
- Out of Scope: 사용자 전역 `~/.claude/settings.json` 수정, 수집용 hook(M2)
- Dependencies: HQ-001, 설정 변경 승인
- Files Expected to Change: `.claude/settings.json`, `.claude/agents/*.md`, `docs/agents/*.md`, `docs/engineering/security.md`
- Acceptance Criteria:
  - [ ] `git push`, `rm -rf` 등이 확인 요청 또는 차단됨
  - [ ] Reviewer subagent가 읽기 전용 도구만 가짐
  - [ ] 기존 전역 hook(Orca, iTerm2) 정상 동작 유지 (RSK-009)
- Verification Steps:
  1. 새 세션에서 금지 명령 시도 → 차단 확인
  2. Orca 상태 표시 정상 확인
