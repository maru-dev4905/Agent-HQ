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

### TD-005 — Projection Replay가 Workspace의 append를 막는다
- Status / Priority: Open / Medium
- Description: `replay`(관리 CLI `agent-hq-admin replay`)는 Read Model을 비우고 다시 쓰는 작업을, Workspace lock을 잡은 한 트랜잭션에서 수행한다(최대 10분). 그동안 같은 Workspace의 append는 lock을 기다리다 10초 timeout으로 실패한다.
- Impact: Source가 이벤트를 보내는 중에 replay하면 Ingestion이 오류를 돌려준다. Adapter는 재시도한다.
- Root Cause: Replay의 원자성(중간 상태가 보이지 않음)을 처리량보다 우선했다.
- Proposed Solution: 지금은 **오프라인 작업으로 운영**한다(관리 CLI 도움말에 명시). 로그가 커지면 Read Model을 새 테이블에 만든 뒤 교체하는 방식이나 스냅샷을 검토한다.
- Verification Method: 큰 로그에서 replay 소요 시간 측정 (HQ-112).
- Related Tasks: HQ-106, HQ-112
- Created / Updated: 2026-11-24

### TD-006 — Ingestion rate limit이 프로세스 메모리에 있다
- Status / Priority: Open / Low
- Description: Connection별 token bucket(`apps/api/src/ingestion/rate-limiter.ts`)을 API 프로세스 메모리에 둔다. 재시작하면 초기화되고, API 프로세스가 여럿이면 각자 따로 센다.
- Impact: 로컬 셀프호스트(프로세스 하나)에서는 문제가 없다. 수평 확장하거나 Cloud에 배포하면 한도가 프로세스 수만큼 늘어난다.
- Root Cause: M1은 단일 프로세스이고, 새 의존성(`@fastify/rate-limit` 등) 없이 T8을 막는 것을 우선했다.
- Proposed Solution: 여러 프로세스를 띄우는 시점에 Redis 기반 카운터(ADR-0005의 Redis 재사용)로 옮긴다.
- Verification Method: 프로세스 2개에서 같은 Connection 한도가 합산되어 적용되는지 확인.
- Related Tasks: HQ-105
- Created / Updated: 2026-11-24

### TD-007 — Outbox relay와 SSE 스트림이 단일 프로세스를 가정한다
- Status / Priority: Open / Low
- Description: Outbox relay(`apps/api/src/realtime/outbox-relay.ts`)는 Outbox 항목을 읽어 같은 프로세스의 스트림에 신호를 보내고 항목을 지운다. API 프로세스가 여럿이면 한 프로세스가 지운 항목의 신호를 다른 프로세스의 스트림이 받지 못한다. 동시 스트림 상한(`SSE_MAX_STREAMS`)도 프로세스별이다.
- Impact: 이벤트가 빠지지는 않는다. 다른 프로세스의 스트림은 자체 재조회 주기(기본 5초)에 따라 늦게 받는다. 로컬 셀프호스트(프로세스 하나)에서는 영향이 없다.
- Root Cause: M1은 단일 프로세스이고, Outbox는 알림 용도일 뿐 전달 보장은 cursor 읽기가 맡는다(ADR-0002).
- Proposed Solution: 여러 프로세스를 띄우는 시점에 Redis pub/sub 또는 PostgreSQL `LISTEN/NOTIFY`로 신호를 프로세스 간에 퍼뜨린다. Outbox 정리는 한 프로세스(또는 BullMQ job)가 맡는다.
- Verification Method: 프로세스 2개에서 한쪽에 연결한 스트림이 다른 쪽 Ingestion 이벤트를 relay 주기 안에 받는지 확인.
- Related Tasks: HQ-107
- Created / Updated: 2026-11-25

### TD-008 — Gap 감지가 매 주기 events 전체를 훑는다
- Status / Priority: Open / Low
- Description: `createGapStore().findGaps`는 `sequence`가 있는 모든 이벤트에 window 함수를 돌린다(기본 10초마다).
- Impact: 로그가 작은 Phase 1에서는 문제없다. 이벤트가 수백만 건이 되면 DB 부하가 커진다.
- Root Cause: 정확성(늦게 온 이벤트 포함)을 단순한 구현으로 먼저 확보했다.
- Proposed Solution: 마지막으로 확인한 `storeSequence` 이후에 이벤트가 온 세션만 다시 검사하거나, 세션별 최대 `sequence`·개수를 요약 테이블로 유지한다. 같은 이유로, 연결 끊김 이벤트는 그 Connection의 Agent 행 전체(직접 `disconnected`를 보고한 Agent 제외)를 Workspace lock 안에서 갱신한다. Agent가 많아지면 행 수 상한이나 Connection 단위 기록으로 바꾼다.
- Verification Method: HQ-112 부하 측정에서 Gap 감지 한 주기의 실행 시간 측정.
- Related Tasks: HQ-108, HQ-112
- Created / Updated: 2026-11-25
