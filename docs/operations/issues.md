# Issues

> 목적: **실제로 발생한** 문제 기록. (잠재 문제는 [risks](risks.md), 개선 사항은 [technical-debt](technical-debt.md), 조사 주제는 [research](../research/README.md))
> 관리 책임: 발견한 Agent가 즉시 기록, Coordinator가 우선순위 지정.
> 상태: Open | In Progress | Resolved(검증 완료 시만) | Won't Fix(사용자 승인)
> 우선순위: P0(작업 중단) | P1(마일스톤 차단) | P2(우회 가능) | P3(경미)

## 템플릿
```markdown
### ISS-XXX — <Title>
- Status / Priority:
- Description:
- Impact:
- Root Cause:
- Proposed Solution:
- Verification Method:
- Related Tasks:
- Created / Updated:
```

---

### ISS-001 — 저장소에 커밋이 없어 worktree 기반 병렬 작업 불가
- Status / Priority: **Resolved** (2026-11-22) / P1
- Description: `main` 브랜치에 커밋이 하나도 없다. 빈 저장소에서 `git worktree add`는 `fatal: not a valid object name: 'HEAD'`로 실패한다 (2026-11-22 scratch 저장소에서 재현).
- Impact: Orca `--worktree new-child` 기반 병렬 Worker, 브랜치 기반 작업, diff 기반 리뷰(`git diff`의 기준점)가 불가능하다.
- Root Cause: 저장소 초기화 직후 상태.
- Proposed Solution: Harness 문서를 첫 커밋으로 남긴다 (HQ-001, 사용자 승인 필요).
- Verification Method: `git log --oneline -1` 출력 존재, scratch가 아닌 이 저장소에서 `git worktree list` 정상 동작.
- Related Tasks: HQ-001
- Created / Updated: 2026-11-22 / 2026-11-22
- Resolution: 사용자 승인을 받아 첫 커밋 `1234b4b`를 만들었다. 이 저장소에서 `git worktree list`가 정상 출력되는 것을 확인했다.

### ISS-002 — Event 계약이 짝 없는 서로게이트 문자를 통과시킨다
- Status / Priority: Open / P3
- Description: `packages/events`의 `idSchema`·`summarySchema`는 제어 문자와 NUL만 막는다. JSON에서 유효한 `"\ud800"` 같은 짝 없는 UTF-16 서로게이트가 계약 검증을 통과하지만, PostgreSQL jsonb는 이를 거부한다 (HQ-105 로컬 리뷰에서 재현: 500 `INTERNAL_ERROR`).
- Impact: Ingestion은 HQ-105에서 저장 전에 400으로 거부하도록 막았다. 계약 자체에는 남아 있어 다른 경로(시뮬레이터 자체 검증, 다른 저장 경로)는 같은 입력을 유효하다고 판단한다.
- Root Cause: 계약에서 "PostgreSQL에 저장 가능한 텍스트"를 정의하지 않았다.
- Proposed Solution: `primitives.ts`의 문자열 스키마에 `isWellFormed()` 검사를 추가하고 계약 테스트에 넣는다. 그 뒤 Ingestion의 별도 검사를 제거한다.
- Verification Method: 서로게이트가 든 샘플이 `parseIncomingEvent`에서 필드 경로와 함께 거부된다.
- Related Tasks: HQ-105 (임시 방어), HQ-101 후속
- Created / Updated: 2026-11-24
