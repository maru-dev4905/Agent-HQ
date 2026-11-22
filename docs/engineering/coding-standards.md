# Coding Standards

> 목적: 코드 작성 규칙. Agent와 사람이 같은 기준으로 작성·리뷰하기 위함.
> 관리 책임: Architect. 상태: §1·§3·§5는 **적용**, §2·§4는 ADR-0003(Accepted)에 따른 규칙으로 HQ-003부터 적용 (lint 설정으로 옮길 항목은 HQ-003에서 반영).
> 도구로 강제 가능한 규칙은 lint/format 설정으로 옮기고 이 문서에는 원칙만 남긴다.

## 1. 공통 원칙 (언어 무관)

1. **계약 우선.** 모듈 간 데이터(특히 Event)는 스키마/타입을 먼저 정의하고 구현한다. 경계에서는 런타임 검증을 한다 (외부 입력은 신뢰하지 않는다).
2. **작은 변경.** 한 Task = 한 목적. 리팩터링과 기능 변경을 섞지 않는다.
3. **명시적 오류 처리.** 오류를 삼키지 않는다. 사용자/호출자에게 의미 있는 오류 코드와 메시지를 반환한다. 관찰 대상 Agent 쪽 코드(수집기·hook)는 실패해도 Agent를 막지 않는다 (NFR-008).
4. **결정성.** 시간·랜덤·ID 생성은 주입 가능하게 만든다 (`Clock`, `IdGenerator`, seed). 테스트와 시뮬레이터 재현성을 위해서다.
5. **Secret·콘텐츠 비로깅.** 로그에 프롬프트·파일 내용·토큰을 남기지 않는다 ([security](security.md)).
6. **주석은 "왜"를 쓴다.** 무엇을 하는지는 코드로 드러낸다.
7. **죽은 코드 금지.** 주석 처리된 코드, 사용하지 않는 export를 남기지 않는다.

## 2. TypeScript 6.0.x / NestJS / Next.js

- `strict: true`. `any` 금지(불가피하면 `unknown` + 좁히기, 사유 주석).
- 외부 입력은 스키마 검증 후 타입을 얻는다 (스키마 → 타입 추론, 타입을 손으로 중복 정의하지 않음).
- `enum` 대신 문자열 리터럴 유니온.
- 모듈 경계는 패키지 `index.ts`의 public export로만 접근 (깊은 import 금지).
- 비동기 함수의 Promise를 버리지 않는다 (floating promise lint 규칙).
- NestJS: 기능 단위 모듈 하나가 디렉터리 하나다. 다른 모듈의 provider는 그 모듈이 export한 것만 주입한다. 컨트롤러에 도메인 로직을 넣지 않는다.
- Prisma: 버전은 ADR-0003의 고정 범위를 지킨다. Prisma Client는 `packages/database`의 저장소 계층 밖에서 직접 쓰지 않는다. raw SQL도 저장소 계층 안에서만 쓴다.
- Next.js: UI 전용이다. 도메인 DB에 직접 접근하지 않고 API와 SSE만 쓴다 ([architecture](../foundation/architecture.md) §3.1).

## 3. 명명

| 대상 | 규칙 | 예 |
|---|---|---|
| Event type | [event-schema §4](../foundation/event-schema.md) Namespace 형식: `<domain>.<sub?>.<verb past>` 소문자, 점 구분 | `tool.call.started`, `agent.status.changed` |
| Event 필드 (wire format) | camelCase | `occurredAt`, `idempotencyKey` |
| DB 컬럼 | Prisma 모델은 camelCase, 테이블·컬럼 매핑은 HQ-003에서 정한다 | — |
| TS 변수/함수 | camelCase | `applyEvent` |
| 타입/클래스 | PascalCase | `AgentState` |
| 파일 | kebab-case | `agent-state.ts` |

Wire format과 코드 내부가 모두 camelCase이므로 변환 계층을 두지 않는다. (이전 초안의 snake_case 규칙은 ADR-0004로 Deprecated)

## 4. 디렉터리 구조와 의존 방향

구조는 [architecture §8과 통합 노트 N3](../foundation/architecture.md#n3-monorepo-8-채택-단계적-생성)을 따른다.

의존 방향 (Proposed — HQ-003에서 lint 규칙으로 강제):
```text
apps/web ──HTTP/SSE──▶ apps/api
apps/api      → packages/{domain, contracts, events, database}
apps/bridge   → packages/{events, contracts, adapters, adapter-claude-code}   (Phase 2)
packages/database → packages/{domain, events}
packages/events   → packages/domain
packages/contracts → packages/{domain, events}
packages/simulator → packages/{events, contracts}
packages/domain   → (의존 없음)
```
- `apps/*`끼리는 코드로 서로 import하지 않는다. 통신은 계약(`packages/contracts`)으로만 한다.
- `packages/*`는 `apps/*`를 import하지 않는다.

## 5. 의존성 추가 규칙
- Task 또는 ADR에 근거가 있어야 한다. 사용자 승인 필요 ([CLAUDE.md §6](../../CLAUDE.md)).
- 유지보수 상태·라이선스를 확인하고 Task 기록에 남긴다.
- 버전은 lockfile로 고정한다.
