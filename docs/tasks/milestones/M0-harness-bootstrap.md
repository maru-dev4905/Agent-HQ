# M0 — Harness Bootstrap (명세서 Phase 0 Foundation & Decisions)

> 목표: Agent와 사람이 일관되게 개발할 수 있는 문서·규칙·도구 기반을 만들고, 기술 스택을 결정하고, Monorepo와 로컬 개발 환경을 만든다.
> 종료 조건: (1) 첫 커밋 존재 ✅ (2) ADR-0001~0004 Accepted ✅ (3) 로컬 Quality Gate 명령 동작 (4) quality-gates.md에 실제 명령 기록 (5) 명세서 Phase 0 완료 조건: 의존성 방향 명시, 기본 빌드·테스트 통과, 로컬 DB migration 실행 가능. Event Schema contract test는 HQ-101(M1 첫 Task)에서 충족한다
> 상태: In Progress

---

### HQ-000 — Harness 문서 체계 구축
- Status: Done (2026-11-22, 사용자가 커밋을 승인해 검토 완료로 간주)
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
  - [x] 사용자 검토 완료
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
- Status: Done (2026-11-22)
- Risk: Low
- Objective: Harness 문서를 첫 커밋으로 남겨 worktree·diff 기반 작업을 가능하게 한다 (ISS-001 해결).
- Scope: HQ-000 산출물 커밋. 원격 push는 별도 승인.
- Out of Scope: 코드, 설정
- Dependencies: HQ-000 사용자 검토, 커밋 승인
- Files Expected to Change: (없음 — Git 이력만)
- Acceptance Criteria:
  - [x] `git log --oneline -1`에 커밋 존재 (`1234b4b`)
  - [x] 커밋에 Secret·개인정보 없음 (커밋 전 패턴 검색, 오탐만 확인)
- Verification Steps:
  1. `git show --stat HEAD`로 포함 파일 확인
  2. ISS-001 Verification Method 수행 후 Resolved 처리
- Execution Log:
  #### Run 2026-11-22-3
  - agent_id: claude-code:main · role: Coordinator · status: succeeded
  - result: 커밋 `1234b4b` (33 files). push 안 함
  - verification: `git show --stat HEAD`, `git worktree list` 정상 → ISS-001 Resolved

### HQ-002 — 핵심 ADR 결정 (ADR-0001~0004)
- Status: Done (2026-11-22)
- Risk: High
- Role: Architect (RES-001 수행) → 사용자 (승인)
- Objective: M1 착수에 필요한 ADR-0001(프로세스), ADR-0002(Event 중심 코어), ADR-0003(기술 스택)을 Accepted(또는 수정 후 Accepted)로 만든다.
- Background: RES-001, architecture.md 기술 스택(현재는 통합 노트 N1)
- Scope: RES-001 수행(공식 문서로 후보 버전·안정성 확인, 필요 시 scratch 프로토타입), ADR-0003에 버전·근거 기록, 세 ADR의 승인 요청. 요청 후 상태를 Blocked로 바꾼다.
- Out of Scope: 저장소에 패키지 설치, 스캐폴드
- Dependencies: 없음 (사용자 승인은 Task 후반)
- Files Expected to Change: `docs/decisions/ADR-0001-*.md`·`ADR-0002-*.md`·`ADR-0003-*.md`(Status 줄과 Proposed 본문), `docs/decisions/README.md`, `docs/foundation/architecture.md`, `docs/research/README.md`
- Acceptance Criteria:
  - [x] RES-001 Result 기록
  - [x] ADR-0001·0002·0003 Status = Accepted (승인 날짜 기록). ADR-0004(명세서 채택)도 추가로 Accepted
  - [x] architecture.md 기술 스택 갱신 (명세서 채택으로 §4 표 대신 통합 노트 N1)
- Verification Steps (변경 대상이 문서뿐이므로 Low 기준 Gate. High 위험인 결정 내용 자체는 사용자 승인으로 검증):
  1. G9 문서 Gate: ADR 상태와 architecture 표, decisions 색인 일치 확인
  2. G8 자가 점검
- Execution Log:
  #### Run 2026-11-22-4
  - agent_id: claude-code:main · role: Architect · status: succeeded
  - result: RES-001(npm registry·nodejs.org·endoflife.date 조회) 수행. 사용자가 제공한 기획 명세서 v0.1.0을 검토(RES-007)했다. 사용자 질의 2회로 결정: 명세서를 기준 문서로 채택, 로컬 셀프호스트, NestJS+Fastify, Next.js, Prisma 7.10.x, Node 26 LTS, SSE+REST, ADR-0001·0002 승인
  - changed_files: docs/decisions/*, docs/foundation/*, docs/engineering/{security,data-governance}.md, docs/research/*, docs/tasks/*, docs/operations/*
  - verification: G9 링크 검사와 독립 리뷰 — Run 2026-11-22-5
  - decisions: ADR-0001~0004 Accepted
  #### Run 2026-11-22-5
  - agent_id: claude-code:main (검증), claude-code:subagent:general-purpose (독립 리뷰, 읽기 전용) · role: Reviewer/Worker · status: succeeded
  - verification:
    - G9 링크·앵커 검사 (scratch 일회성 스크립트): 1차 `files=51 problems=3` → 수정 후 `files=51 problems=0`
    - G8 독립 리뷰: Request Changes (Blocker 2, Major 8, Minor 9, Nit 1) → 20건 모두 반영. 주요 수정: M1 의존성 그래프를 Edge 표로 교체, Replay Cursor를 `storeSequence`로 정의, 토큰 기반 `workspaceId`·`connectionId`, Connection 등록 부트스트랩(일회성 코드), `disconnected`/`unknown` 구분 규칙, Docker port publish 규칙, High 위험 Task의 G4 적용 조건
    - #17(ADR-0003의 Redis 보류)은 사용자 결정 사항이 아니어서 Status 줄에 "Proposed, 사용자 확인 대기"로 표시
  - feedback loop: 원인은 (a) 의존성을 그래프·Task·backlog 세 곳에 따로 적어 생긴 불일치. 그래프를 Edge 표 하나로 바꾸고, backlog와 같은 내용을 유지하는 규칙은 기존 task-protocol을 그대로 따른다

### HQ-003 — 저장소 스캐폴드 + 로컬 개발 환경 + 로컬 Quality Gate
- Status: Blocked (Node 26 설치, 의존성 목록 승인, Docker 실행 승인 대기)
- Risk: Medium
- Objective: ADR-0003 스택으로 Monorepo 골격과 로컬 개발 환경(Docker Compose + PostgreSQL)을 만들고, G1·G2·G3·G6을 하나의 로컬 명령으로 실행할 수 있게 한다. 명세서 Phase 0 완료 조건을 충족한다.
- Background: ADR-0003, [architecture 통합 노트 N3](../../foundation/architecture.md#n3-monorepo-8-채택-단계적-생성), RSK-014, NFR-007, quality-gates §2
- Scope: Node 26 버전 고정 파일과 `packageManager` 필드, pnpm workspace, TS 6.0.x(strict) 공통 설정, lint/format 도구 선정(ESLint 또는 Biome — 의존성 승인 시 확정)과 설정, 테스트 러너, NestJS(Fastify) `apps/api` 골격과 health 엔드포인트, Next.js `apps/web` 골격, `packages/{domain,contracts,events,database,simulator}` 빈 골격, Prisma 7.10.x 고정과 초기 migration 1개, `docker-compose`(PostgreSQL, 127.0.0.1 바인딩), `.gitignore`(`.env*`, DB 볼륨), `.env.example`, 설치 스크립트 허용 목록(security §6), 의존 방향 lint 규칙, README 실행 절차, quality-gates.md 갱신
- Out of Scope: 제품 로직(Event 계약은 HQ-101), CI
- Dependencies: HQ-002 ✅, **사용자의 Node 26 LTS 설치**, 의존성 목록 승인, Docker 실행 승인
- Files Expected to Change: 루트 설정 파일, `apps/{api,web}/` 골격, `packages/*/` 골격, `docker-compose.yml`, `README.md`, `docs/engineering/quality-gates.md`, `docs/engineering/coding-standards.md`
- Acceptance Criteria:
  - [ ] 클린 클론에서 README 절차만으로 설치·검증 명령 성공
  - [ ] 샘플 단위 테스트 1개가 Gate에서 실행됨
  - [ ] 고의 타입 오류·lint 오류가 Gate를 실패시킴
  - [ ] quality-gates.md의 G1·G2·G3·G6 상태가 `Local`, 명령 기록
  - [ ] `docker compose`로 PostgreSQL을 기동하고 migration을 적용할 수 있다
  - [ ] Compose의 모든 port publish가 `127.0.0.1:`로 시작한다
  - [ ] 패키지 간 역방향 의존을 lint가 잡아낸다
  - [ ] Prisma 버전이 정확히 7.10.x로 고정되어 있다 (`latest` 태그 미사용)
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
