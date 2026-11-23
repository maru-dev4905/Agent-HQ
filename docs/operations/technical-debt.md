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

### TD-003 — Prisma 7.10.x 고정과 8.0 전환 예정
- Status / Priority: Open / Medium
- Description: ADR-0003에서 Prisma를 7.10.x로 고정했다. npm `latest` 태그는 이미 8.0 RC(8.0.0-rc.34, 2026-11-22 확인)를 가리킨다.
- Impact: 8.0 정식 출시 후 마이그레이션 비용이 생긴다. 태그 없이 설치하면 RC가 설치될 위험이 있다.
- Root Cause: 메이저 전환기에 프로젝트를 시작했다.
- Proposed Solution: 버전을 정확히 고정하고 lockfile을 리뷰한다. raw SQL은 저장소 계층에만 둔다. 8.0 정식 출시 시 업그레이드 Task를 만든다.
- Verification Method: `package.json`에 정확한 버전 범위가 있고, lockfile에 8.x RC가 없다.
- Related Tasks: HQ-003, HQ-104
- Created / Updated: 2026-11-22

### TD-004 — Event Store가 읽어 온 JSON을 재검증 없이 타입 단언
- Status / Priority: Open / Low
- Description: `toStoredEvent`가 DB의 `source`·`payload` JSON을 `as unknown as StoredEvent`로 단언한다. 근거는 "append만 쓰고, append는 계약 검증된 이벤트만 받으며, UPDATE는 trigger로 막힌다"는 것이다.
- Impact: 스키마 버전이 바뀌거나 DB를 수동으로 고치면 잘못된 형태가 타입 검사 없이 전달될 수 있다.
- Proposed Solution: `schemaVersion`이 2가 되는 시점에 읽기 경로에서 버전별 변환·검증을 추가한다. 그 전에는 테스트에서 round-trip 동일성을 검증한다(현재 계약 테스트).
- Verification Method: schemaVersion 2 도입 Task의 AC에 포함.
- Related Tasks: HQ-104
- Created / Updated: 2026-11-23
