# ADR-0006: Event 계약 — 외부 ID는 `source`로 받고, 미정의 payload 필드는 버리고 보고한다

- Status: Accepted (2026-11-22, 사용자 승인)
- Date: 2026-11-22
- Deciders: 사용자 / 제안: Claude (Architect, HQ-101 독립 리뷰 결과 반영)
- Supersedes: 없음. 기획 명세서 event-schema §3 Envelope의 `agentInstanceId`·`taskId` 해석을 구체화한다

## Context
HQ-101에서 Event 계약을 Zod로 구현하던 중, 독립 리뷰가 두 가지 설계 문제를 지적했다.
1. 명세서 Envelope는 Source가 `agentInstanceId`·`taskId`(HQ 내부 ID)를 보내는 형태다. 그런데 외부 Runtime(Claude Code, 시뮬레이터)은 HQ 내부 ID를 알 수 없다. domain-model §5는 "외부 Runtime ID를 HQ 내부 ID로 대체하지 않는다. 외부 ID는 Workspace·Connection 범위에서 유일하다"고 정한다. 그대로 두면 두 Connection이 같은 `agt_1`을 보낼 때 서로 다른 Agent가 하나로 합쳐진다.
2. payload를 strict(미정의 필드 거부)로 하면, 명세서 §11 "하위 호환 Optional Field 추가 우선"이 같은 `schemaVersion` 안에서 깨진다. 새 필드를 보내는 Adapter의 이벤트가 통째로 거부되어 유실된다.

## Problem
(1) Source가 Agent와 Task를 어떤 ID로 가리키는가? (2) 계약에 없는 필드를 어떻게 처리하는가?

## Options Considered
### (1) ID
- A. Source가 HQ ID를 보낸다 (명세서 문면 그대로) — Source가 HQ ID를 알 방법이 없다
- B. Envelope의 `agentInstanceId`·`taskId`를 "Connection 범위의 외부 ID"로 재해석한다 — 같은 이름이 문서마다 다른 의미가 된다
- **C. 외부 ID는 `source.externalAgentId`·`source.externalTaskId`, payload의 `externalToolCallId`·`parentExternalAgentId`·`parentExternalTaskId`로 받는다. `agentInstanceId`·`taskId`는 서버 소유 필드로, Ingestion이 `(workspaceId, connectionId, 외부 ID)` 매핑으로 부여한다 (제안)**
### (2) 미정의 필드
- A. 거부 (strict) — 호환성 문제
- B. 통과 (passthrough) — 콘텐츠가 저장될 위험 (D2 기본 미저장 원칙 위반)
- **C. 버리고(strip) 버린 필드의 이름만 보고한다. 값은 저장하지도 로그에 남기지도 않는다. 서버 소유 필드(`receivedAt`, `storeSequence`, `agentInstanceId`, `taskId`)는 거부한다 (제안)**

## Decision (제안)
(1) C, (2) C. 구현: `packages/events` (`parseIncomingEvent`의 `ignoredFields`).

## Reasons
- domain-model §5(외부 ID 보존, 범위 내 유일)와 명세서 §11(하위 호환 확장)을 모두 지킨다.
- strip이면 계약에 없는 필드의 값이 저장 경로로 들어가지 않는다. "파싱 결과만 저장·로그한다"는 규칙과 함께 쓰면 D2 원칙이 유지된다.

## Consequences
- HQ-105(Ingestion)에 외부 ID → HQ ID 매핑 테이블과 부여 로직이 필요하다. HQ-104 스키마에 반영한다.
- 명세서 §5 예시처럼 Source가 `agentInstanceId`를 보내면 거부된다. Adapter 문서(adapter-spec 통합 노트)에 명시한다.
- `ignoredFields`가 계속 나오면 계약 확장이 필요하다는 신호다. HQ-105는 이를 집계해 보여 줄 수 있어야 한다.

## Revisit Conditions
- HQ Managed Mode(Phase 5)에서 HQ가 직접 만든 Event가 HQ ID를 이미 알고 있을 때 → 서버 내부 경로는 별도 처리
- 버려진 필드 때문에 디버깅이 어렵다는 피드백이 나올 때 → Developer Mode용 Raw Event 정책(명세서 §11 "원본 Raw Event 저장은 별도 정책") 검토

## Related Documents
- [event-schema 통합 노트 N7](../foundation/event-schema.md#n7-hq-101-계약-구현-2026-11-22), [domain-model §5](../foundation/domain-model.md), [HQ-101](../tasks/milestones/M1-event-ingestion-core.md)
