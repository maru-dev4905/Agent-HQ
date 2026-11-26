# M0 — Harness Bootstrap (명세서 Phase 0 Foundation & Decisions)

> 목표: Agent와 사람이 일관되게 개발할 수 있는 문서·규칙·도구 기반을 만들고, 기술 스택을 결정하고, Monorepo와 로컬 개발 환경을 만든다.
> 종료 조건: (1) 첫 커밋 존재 ✅ (2) ADR-0001~0004 Accepted ✅ (3) 로컬 Quality Gate 명령 동작 (4) quality-gates.md에 실제 명령 기록 (5) 명세서 Phase 0 완료 조건: 의존성 방향 명시, 기본 빌드·테스트 통과, 로컬 DB migration 실행 가능. Event Schema contract test는 HQ-101(M1 첫 Task)에서 충족한다
> 상태: Done (2026-11-23). 종료 조건 (1)~(5) 충족: 첫 커밋, ADR-0001~0004 Accepted, 로컬·CI Gate(`pnpm verify`), quality-gates 기록, Phase 0 완료 조건. HQ-005는 선택 Task로 Backlog에 남는다

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
- Status: Done (2026-11-22)
- Risk: Medium
- Objective: ADR-0003 스택으로 Monorepo 골격과 로컬 개발 환경(Docker Compose + PostgreSQL)을 만들고, G1·G2·G3·G6을 하나의 로컬 명령으로 실행할 수 있게 한다. 명세서 Phase 0 완료 조건을 충족한다.
- Background: ADR-0003, [architecture 통합 노트 N3](../../foundation/architecture.md#n3-monorepo-8-채택-단계적-생성), RSK-014, NFR-007, quality-gates §2
- Scope: Node 26 버전 고정 파일과 `packageManager` 필드, pnpm workspace, TS 6.0.x(strict) 공통 설정, lint/format 도구 선정(ESLint 또는 Biome — 의존성 승인 시 확정)과 설정, 테스트 러너, NestJS(Fastify) `apps/api` 골격과 health 엔드포인트, Next.js `apps/web` 골격, `packages/{domain,contracts,events,database,simulator}` 빈 골격, Prisma 7.10.x 고정과 초기 migration 1개, `docker-compose`(PostgreSQL, 127.0.0.1 바인딩), `.gitignore`(`.env*`, DB 볼륨), `.env.example`, 설치 스크립트 허용 목록(security §6), 의존 방향 lint 규칙, README 실행 절차, quality-gates.md 갱신
- Out of Scope: 제품 로직(Event 계약은 HQ-101), CI
- Dependencies: HQ-002 ✅, **사용자의 Node 26 LTS 설치**, 의존성 목록 승인, Docker 실행 승인
- Files Expected to Change: 루트 설정 파일, `apps/{api,web}/` 골격, `packages/*/` 골격, `docker-compose.yml`, `README.md`, `docs/engineering/quality-gates.md`, `docs/engineering/coding-standards.md`
- Acceptance Criteria:
  - [x] 클린 클론에서 README 절차만으로 설치·검증 명령 성공
  - [x] 샘플 단위 테스트 1개가 Gate에서 실행됨 (5개)
  - [x] 고의 타입 오류·lint 오류가 Gate를 실패시킴
  - [x] quality-gates.md의 G1·G2·G3·G6 상태가 `Local`, 명령 기록
  - [x] `docker compose`로 PostgreSQL을 기동하고 migration을 적용할 수 있다
  - [x] Compose의 모든 port publish가 `127.0.0.1:`로 시작한다
  - [x] 패키지 간 역방향 의존을 lint가 잡아낸다
  - [x] Prisma 버전이 정확히 7.10.x로 고정되어 있다 (`latest` 태그 미사용)
  - [x] (ADR-0005 추가) Compose에 Redis가 있고, API health가 PostgreSQL·Redis 상태를 보고한다
- Verification Steps (quality-gates §3 Medium):
  1. scratch 디렉터리에 클론 후 README 절차 실행
  2. 오류 주입 → Gate 실패 확인 → 원복
  3. G8 독립 리뷰 (lockfile·의존성 목록 포함)
- Execution Log:
  #### Run 2026-11-22-6
  - agent_id: claude-code:main · role: Worker · status: succeeded
  - 사용자 결정: Node 26 업그레이드(nvm에 v26.13.1 설치, 기본 alias는 24 그대로 → `.nvmrc` 추가), Redis·BullMQ 도입(ADR-0005), "4번부터 진행"을 의존성·Docker 실행 승인으로 해석
  - 환경 변경 (저장소 밖): Node 26용 전역 pnpm 10.33.2 설치(`npm i -g`), Docker Desktop 실행, Compose 컨테이너 `agent-hq-postgres-1`·`agent-hq-redis-1`과 볼륨 `agent-hq_postgres-data` 생성
  - 의존성 (모두 정확한 버전 고정, 라이선스 MIT 또는 Apache-2.0): 루트 dev — typescript 6.0.3, @types/node 26.6.6, eslint 10.15.0, @eslint/js 10.0.1, typescript-eslint 8.73.0, prettier 3.10.1, vitest 5.1.1 / api — @nestjs/{common,core,platform-fastify,testing} 12.6.0, @nestjs/bullmq 12.0.2, bullmq 6.7.8, ioredis 6.0.0, reflect-metadata 0.2.2, rxjs 7.8.2 / database — prisma·@prisma/client·@prisma/adapter-pg 7.10.1, pg 8.23.1 / web — next 16.4.6, react·react-dom 19.3.1, @types/react·@types/react-dom 19.3.0
  - 설치 스크립트: `@prisma/engines`, `prisma`, `msgpackr-extract` 차단 유지 (스크립트 없이 generate·migrate 동작 확인)
  - verification: `pnpm verify` exit 0 (원 저장소, 추적 파일만 복사한 클린 복사본 모두). 오류 주입 4종(타입, 의존 방향, floating promise, 실패 테스트)이 각각 Gate를 실패시킴. API 스모크: `127.0.0.1:4000`에만 LISTEN, `/health` → ok, Redis 중지 시 degraded, 재시작 시 ok 복구
  - 발견·수정: (1) 클린 복사본에서 `eslint.config.js` 타입 오류 발견 → 수정 (원 저장소에서는 tools typecheck 추가 후 전체 재실행을 빠뜨렸음) (2) Next build가 web tsconfig를 다시 써서 format 검사와 충돌 → Next 요구값 반영 (3) ioredis 미처리 error 로그 → 리스너 추가
  - feedback loop: (d) 도구/환경 → troubleshooting.md에 3건 기록. (e) "설정을 바꾸면 전체 verify 재실행"은 기존 규칙 범위이므로 규칙 추가 없음
  - G8 독립 리뷰: HQ-101과 합동 리뷰(Run 2026-11-22-7) → 반영 완료. HQ-003 관련 반영: 빈 `API_HOST`가 모든 인터페이스 바인딩으로 이어지던 문제 수정, pg 연결·ping timeout(2초), degraded면 `/health` 503, HealthService 단위 테스트, Nest factory provider로 클라이언트 생성, dev 스크립트 경합 제거, Compose 이미지 태그 고정(`postgres:18.7`, `redis:8.10.3`), `lint`·`test` 전에 Prisma generate
  - 남은 한계 (Nit, 수용): 의존 방향 lint는 정적 import만 잡는다. 동적 `import()`와 다른 패키지로의 상대 경로는 잡지 못한다 (coding-standards §4에 기록)

### HQ-004 — CI 및 문서 검사 자동화
- Status: Done (2026-11-23)
- Risk: Medium
- Objective: PR마다 Gate를 자동 실행하고, CodeRabbit 리뷰와 머지 준비 알림을 포함한 PR 흐름([review-protocol §6](../../agents/review-protocol.md#6-작업--머지-흐름-2026-11-23-사용자-결정-hq-004))을 만든다. (2026-11-23 사용자 결정으로 범위 확장)
- 범위 변경: GitHub Actions CI(verify, integration), `.coderabbit.yaml`, `ready-to-merge` 알림 워크플로, main 브랜치 보호(사용자 확인 후). 문서 링크 검사 자동화(TD-002)는 후속으로 미룬다
- Background: TD-002, RSK-011
- Scope: GitHub Actions 워크플로(승인 필요), 링크 검사, 의존성 취약점 검사 도입 검토
- Out of Scope: 배포
- Dependencies: HQ-003, CI 도입 승인
- Files Expected to Change: `.github/workflows/*`, `docs/engineering/quality-gates.md`, `docs/operations/technical-debt.md`
- Acceptance Criteria:
  - [x] PR에서 Gate(verify, integration) 실행, 실패 시 표시
  - [x] CodeRabbit이 PR을 한국어로 리뷰하고, Major 이상이 없으면 승인한다
  - [x] CodeRabbit 승인 + 모든 check 통과 시 `ready-to-merge` 라벨과 소유자 멘션 알림이 온다
  - [x] (머지 후) main 브랜치 보호에 필수 check 지정 (사용자 확인 후)
  - 후속으로 이동: 깨진 문서 링크가 CI를 실패시킴 (TD-002)
- Verification Steps:
  1. 실패를 의도한 테스트 PR로 확인 (사용자 승인 후)

- Execution Log:
  #### Run 2026-11-23-2
  - agent_id: claude-code:main (Worker), CodeRabbit (PR Reviewer) · status: succeeded
  - result: PR #1 머지(`ecbb753`, 사용자). CI(verify, integration) 첫 실행부터 통과. CodeRabbit 1차 CHANGES_REQUESTED(Minor 6건: 승인 차단 기준, 가이드라인 적용 범위, 알림 재시도·동시성, resolve 안내, AC 정리) → 공식 스키마로 확인 후 전부 반영 → 최신 커밋 APPROVED → `ready-to-merge` 라벨과 소유자 멘션 자동 생성 확인
  - main 브랜치 보호 (사용자 승인 2026-11-23): 필수 check `verify (G1 G2 G3 G6)`·`integration (G4)`·`CodeRabbit`, 승인 1건(CodeRabbit APPROVED가 충족), 새 push 시 기존 승인 무효화, force push·삭제 금지, 관리자 우회는 비상용으로 허용(Agent는 사용하지 않음)
  - 알게 된 점: `CodeRabbit` check는 수정 요청 상태에서도 success로 끝난다. 그래서 승인 여부는 check가 아니라 "승인 1건 필수" 규칙으로 막아야 한다

### HQ-006 — 리뷰 흐름 조정 (위험도별 CodeRabbit)
- Status: Done (2026-11-26, PR #10 머지 `9285002`)
- Risk: 2 (CI 워크플로·저장소 보호 규칙 변경)
- Objective: CodeRabbit 자동 리뷰 중단과 사용량 한도에 맞춰, 로컬 독립 리뷰를 필수로 두고 CodeRabbit은 위험도 2~3 PR에서만 쓰도록 머지 흐름을 바꾼다.
- Background: 2026-11-25 CodeRabbit "star 10개 미만" 자동 리뷰 중단, PR #9의 사용량 한도 거절, 2026-11-26 사용자 결정(위험도 0~3, 2~3은 CodeRabbit 지적을 수정 작업으로 반영)
- Scope: 위험도 0~3 체계(quality-gates §3, task-protocol), review-protocol §6 머지 흐름, CLAUDE.md §6 상시 승인(`risk:*` 라벨), `.github/workflows/ready-to-merge.yml` 위험도 판정, GitHub `risk:0`~`risk:3` 라벨 생성, main 보호 규칙에서 승인 필수와 `CodeRabbit` 필수 check 제거(CI 필수 유지)
- Out of Scope: CodeRabbit 플랜 변경, `.coderabbit.yaml` 변경
- Dependencies: 사용자 승인(2026-11-26: 보호 규칙 변경, 워크플로 수정, 라벨 상시 승인)
- Files Expected to Change: `.github/workflows/ready-to-merge.yml`, `CLAUDE.md`, `docs/agents/{review-protocol,task-protocol,subagent-roles}.md`, `docs/engineering/quality-gates.md`, 상태 문서
- Acceptance Criteria:
  - [ ] 위험도 0~1 PR은 CI 통과만으로 `ready-to-merge`, 위험도 2~3·라벨 없음은 CodeRabbit 최신 커밋 승인까지 필요
  - [ ] main 보호 규칙: 필수 check `verify`·`integration`만, 승인 수 0, force push·삭제 금지 유지
  - [ ] 문서의 승인·흐름 규칙이 서로 일치 (CLAUDE.md §6 단일 원천)
- Role: Coordinator → Reviewer(독립) → CodeRabbit
- Verification Steps: 워크플로 스크립트 모의 실행(위험도별 9가지 경우), 보호 규칙 API 조회, 이 PR(risk:2)의 `pull_request`·`pull_request_review` 경로. `workflow_run` 경로와 위험도 0~1 경로는 머지 뒤 main의 워크플로로 동작하므로 **머지 후 첫 PR에서 검증**한다
- Execution Log:
  #### Run 2026-11-26-1
  - agent_id: claude-code:main · status: In Review
  - result: 위험도 0~3 체계와 위험도별 리뷰 규칙, `ready-to-merge.yml`(risk 라벨 판정, 라벨 없으면 3, 라벨 변경 시 재평가), CLAUDE.md §6 라벨 상시 승인
  - 로컬 리뷰 1회차: Request Changes (Major 2: subagent-roles의 옛 위험도 표가 작은 코드 수정을 자가 점검으로 허용, 라벨 상시 승인이 라벨 낮추기까지 포함해 CodeRabbit 우회 가능. Minor 5, Nit 4) → 반영: subagent-roles 0~3 표, 상시 승인은 Task 위험도와 같은 라벨만(낮추기는 건별 승인), `risk` 라벨 확인 책임 명시, 규칙·승인·ADR·보안 문서는 최소 위험도 1, 열린 Task(HQ-005·111·112) 위험도 재분류, 머지 후 검증 항목 명시, ready_for_review 트리거 추가
  - PR #10: risk:2 → CodeRabbit 1차 APPROVED (Minor 3: `ready-to-merge`가 로컬 리뷰 통과를 보장하지 않음을 명시, changelog의 라벨 상시 승인 범위, current-status의 위험도 0 자가 점검 예외) → 재리뷰 사용량을 아끼려고 HQ-112 브랜치에서 반영
  - verification: 워크플로 스크립트를 가짜 GitHub 객체로 모의 실행 — 9가지 경우 모두 기대대로(risk:0·1 CI만, risk:2 미승인 불가, risk:3 승인 시 가능, 라벨 없음 불가, CI 실패 불가, 복수 라벨은 가장 높은 값, labeled 이벤트 재평가, synchronize 시 라벨 제거)

### HQ-005 — Claude Code 프로젝트 설정
- Status: Backlog
- Risk: 2 (harness 설정)
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
