# Current Status

> 목적: 프로젝트의 현재 상태와 세션 간 인계. **모든 세션이 시작할 때 읽고, 끝날 때 갱신한다.**
> 관리 책임: Coordinator (매 세션)
> 최종 갱신: 2026-11-22 — Claude Code (HQ-001·HQ-002 수행, 기획 명세서 통합)

## 1. 요약
- 단계: **M0 / Phase 0 Foundation & Decisions — In Progress**
- 제품 기준 문서: 기획 명세서 v0.1.0 채택 ([ADR-0004](../decisions/ADR-0004-adopt-spec-baseline.md)). 원본은 [research/source/chatgpt-spec-v0.1/](../research/source/chatgpt-spec-v0.1/README.md)
- 기술 스택 결정 ([ADR-0003](../decisions/ADR-0003-m1-tech-stack.md)): 로컬 셀프호스트(Docker Compose), TypeScript 6.0.x, Node 26 LTS, pnpm, NestJS+Fastify, Next.js, PostgreSQL, Prisma 7.10.x, SSE+REST
- 제품 코드: 없음 · 자동 Quality Gate: 없음
- Git: `main`, 커밋 `1234b4b`(첫 커밋). 원격 `origin` = GitHub (push 안 함). **이번 세션의 명세서 통합 변경은 미커밋.**

## 2. 진행 중 / 대기
| Task | 상태 | 비고 |
|---|---|---|
| HQ-003 Monorepo 골격 + 로컬 개발 환경 | Blocked | Node 26 LTS 설치(사용자), 의존성 목록 승인, Docker 실행 승인 필요 |
| HQ-005 Claude Code 프로젝트 설정 | Backlog | 설정 변경 승인 필요 |
| HQ-110 Claude Code 신호 조사 | Backlog | 언제든 병행 가능 (scratch hook 설정은 승인 후) |

## 3. 사용자 결정 대기
1. 명세서 통합 변경분 커밋 승인
2. ADR-0003의 "MVP에서 Redis/BullMQ 미도입(DB Outbox 사용)" 확인 — 질의하지 않았던 항목이라 Proposed로 남아 있음
3. Node 26 LTS 설치 (설치 방법은 사용자 선택 — nvm, fnm, 공식 설치 파일 등)
4. HQ-003 의존성 목록 승인 (HQ-003 착수 시 정확한 패키지·버전 목록을 제시)
5. 남은 Open Questions: OQ-5(Orca 등 기존 도구와의 관계), OQ-6(MVP 3D 최소 범위), 명세서 Open Decisions
6. HQ-005(프로젝트 `.claude/settings.json`, subagent 정의) 도입 여부

## 4. 인계 사항 (직전 세션 → 다음 세션)
- 제품·도메인·이벤트·보안·UX는 명세서가 기준이다. 통합 문서의 **"통합 노트"가 본문보다 우선**한다.
- 이전 초안(snake_case Envelope, Event v0, M1 Simulated Pipeline)은 Deprecated다. 이력은 커밋 `1234b4b`에 있다.
- ISS-001은 해소됐다. 이제 Orca `new-child` worktree 병렬 작업이 가능하다 (커밋된 기준이 있어야 함 — 통합 변경을 커밋한 뒤 사용).
- HQ-003을 시작하기 전에 `node --version`이 26.x인지 확인한다.
