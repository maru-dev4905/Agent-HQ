# Technical Debt

> 목적: 현재는 동작하지만 장기적으로 개선해야 하는 사항.
> 관리 책임: 발견한 Agent가 기록, Coordinator가 Task화 시점 결정.
> 상태: Open | Scheduled(Task 연결) | Resolved(검증 후) | Accepted(사용자 승인 하에 유지)
> 우선순위: High | Medium | Low

## 템플릿
```markdown
### TD-XXX — <Title>
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

### TD-001 — Tool Governance가 문서 규칙으로만 존재
- Status / Priority: Scheduled / Medium
- Description: 위험 명령 금지, 커밋 승인 등이 CLAUDE.md·security.md의 문서 규칙일 뿐 설정(`.claude/settings.json` 권한, hook)으로 강제되지 않는다.
- Impact: Agent가 규칙을 놓치면 막을 수단이 없다.
- Root Cause: 설정 변경은 사용자 승인 사항이라 이번 단계에서 적용하지 않음.
- Proposed Solution: HQ-005에서 프로젝트 권한 deny/ask 목록 제안 → 승인 후 적용.
- Verification Method: 금지 명령 시도 시 Claude Code가 차단/확인 요청하는지 확인.
- Related Tasks: HQ-005
- Created / Updated: 2026-11-22

### TD-002 — 문서 링크·일관성 검사가 수동
- Status / Priority: Scheduled / Low
- Description: G9 문서 Gate가 수동이다.
- Impact: 링크 깨짐, 문서 간 모순이 누적될 수 있다.
- Proposed Solution: HQ-004에서 Markdown 링크 검사 스크립트 또는 도구 도입 (의존성 추가 시 승인).
- Verification Method: 고의로 깨뜨린 링크를 검사가 잡아내는지 확인.
- Related Tasks: HQ-004
- Created / Updated: 2026-11-22
