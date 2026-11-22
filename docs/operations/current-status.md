# Current Status

> 목적: 프로젝트의 현재 상태와 세션 간 인계. **모든 세션이 시작 시 읽고 종료 시 갱신한다.**
> 관리 책임: Coordinator (매 세션)
> 최종 갱신: 2026-11-22 — Claude Code (Harness 구축 세션)

## 1. 요약
- 단계: **M0 Harness Bootstrap — In Progress**
- 제품 코드: 없음
- 자동 Quality Gate: 없음 ([quality-gates](../engineering/quality-gates.md))
- Git: `main` 브랜치, **커밋 없음**. 원격 `origin` = `https://github.com/maru-dev4905/Agent-HQ.git` (push는 승인 필요). 이번 세션의 문서는 모두 미커밋 상태.

## 2. 진행 중 / 대기
| Task | 상태 | 비고 |
|---|---|---|
| HQ-000 Harness 문서 체계 | In Review | 사용자 검토 대기 |
| HQ-001 첫 커밋 | Blocked | 커밋 승인 요청함 |
| HQ-002 M1 핵심 ADR 결정 | Ready | RES-001 조사 후 ADR-0001~0003 승인 요청 |
| HQ-005 Claude Code 프로젝트 설정 | Backlog | 설정 변경 승인 필요 |

## 3. 사용자 결정 대기
1. 문서 일괄 첫 커밋 승인 (HQ-001)
2. ADR-0001 (ADR 프로세스) 확인, ADR-0002 (Event Log 중심 코어) 승인 여부
3. ADR-0003 (M1 기술 스택) 승인/수정
4. product.md Open Questions (OQ-1 ~ OQ-7), 특히 OQ-2(Cloud 역할), OQ-5(Orca 등 기존 도구와의 관계)
5. 프로젝트 `.claude/settings.json` 및 subagent 정의 도입 여부 (HQ-005)

## 4. 인계 사항 (직전 세션 → 다음 세션)
- 이번 세션에서 docs/ 전체 구조와 CLAUDE.md, README.md를 처음 만들었다 ([changelog](changelog.md)).
- 미커밋 파일: `CLAUDE.md`, `README.md`, `docs/**` 전체.
- 다음 세션은 사용자 결정(§3)을 먼저 확인한다. 결정 전에는 HQ-003(스캐폴드)을 시작하지 않는다.
- 첫 커밋 전에는 Orca `new-child` worktree 병렬 작업을 하지 않는다 ([ISS-001](issues.md)).
