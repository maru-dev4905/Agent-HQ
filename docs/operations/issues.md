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
- Status / Priority: Open / P1
- Description: `main` 브랜치에 커밋이 하나도 없다. 빈 저장소에서 `git worktree add`는 `fatal: not a valid object name: 'HEAD'`로 실패한다 (2026-11-22 scratch 저장소에서 재현).
- Impact: Orca `--worktree new-child` 기반 병렬 Worker, 브랜치 기반 작업, diff 기반 리뷰(`git diff`의 기준점)가 불가능하다.
- Root Cause: 저장소 초기화 직후 상태.
- Proposed Solution: Harness 문서를 첫 커밋으로 남긴다 (HQ-001, 사용자 승인 필요).
- Verification Method: `git log --oneline -1` 출력 존재, scratch가 아닌 이 저장소에서 `git worktree list` 정상 동작.
- Related Tasks: HQ-001
- Created / Updated: 2026-11-22 / 2026-11-22
