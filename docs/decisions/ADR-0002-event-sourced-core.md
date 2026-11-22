# ADR-0002: Event Log를 단일 진실 원천으로 하는 코어

- Status: Accepted (2026-11-22, 사용자 승인)
- Date: 2026-11-22
- Deciders: 사용자 / 제안: Claude (Architect)
- Supersedes: 없음

## Context
Agent HQ는 여러 Source(시뮬레이터, Claude Code Adapter, 이후 다른 Adapter)에서 실행 이벤트를 받는다. 같은 데이터를 Dashboard·3D Office·통계·(향후) 제어에서 사용한다. 기획 명세서 v0.1.0([ADR-0004](ADR-0004-adopt-spec-baseline.md))도 같은 방향을 제시한다. D-009는 Dashboard와 3D Office가 공통 Event/Projection을 소비한다고 하고, event-schema §6은 append-only log와 재생성 가능한 Projection을 요구한다.

## Problem
관찰 데이터를 "현재 상태 테이블"로 저장할 것인가, "불변 Event Log + 파생 Projection"으로 저장할 것인가?

## Options Considered
### Option A — Append-only Event Log + Projection (Event Sourcing 경량형)
- 장점: 실행 과정 재생(Replay)과 타임라인이 자연스럽다. 새 화면(3D Office)은 Projection만 추가하면 된다. Projection 버그는 재생성으로 복구한다. 감사 로그·제어 기록과도 일관된다.
- 단점: 저장 용량 증가, Projection 재생성 비용, 스키마 버전 관리 필요.
### Option B — 현재 상태 CRUD 테이블 + 별도 로그
- 장점: 단순하다.
- 단점: 상태와 로그가 어긋날 위험이 있고, 과거 재구성과 Gap/Unknown 표현이 어렵다.
### Option C — 외부 관측 플랫폼(OpenTelemetry 백엔드 등)에 위임
- 단점: Agent 도메인(Mission, Task, 위임, Approval) 모델링이 제한적이다. 명세서도 "특정 Telemetry 표준에 완전히 종속하지 않는다"고 정했다 (OTel 호환은 후속 검토).

## Decision
Option A, 경량형으로 시작한다.
- Event는 [event-schema](../foundation/event-schema.md)의 공통 Envelope를 따르고 PostgreSQL의 append-only 테이블에 저장한다 ([ADR-0003](ADR-0003-m1-tech-stack.md)).
- 중복 판정은 `(workspaceId, connectionId, idempotencyKey)` 범위로 한다.
- Projection(`agent_current_state`, `task_current_state`, `connection_health` 등)은 Event에서 계산하며 언제든 재생성할 수 있어야 한다.
- 초기에는 Ingestion 요청 안에서 동기로 Projection을 갱신한다. Realtime 발행은 DB Outbox 또는 같은 수준의 내구성 있는 방식으로 한다. 메시지 브로커와 별도 이벤트 스토어 제품은 도입하지 않는다.

## Reasons
- 제품의 핵심 가치(실행 과정 시각화, 재생, Gap/Unknown 표시)가 Event 시간축 자체에 있다.
- Selective Storage 정책을 Event 단위(`sensitivity`, payload 마스킹)로 적용하기 쉽다.
- 시뮬레이터의 결정적 Event 스트림을 그대로 테스트 픽스처로 쓸 수 있다 (Replay 동일성 테스트).
- 가정(미검증): MVP 규모에서 단일 PostgreSQL로 충분하다 → RES-005에서 측정.

## Consequences
- Envelope와 스키마 버전 관리가 필수가 된다.
- 보존 기간과 삭제 정책이 필요하다. append-only와 "삭제권"이 충돌하므로, 불변을 "수정 금지"로 정의하고 Workspace·Session 단위 물리 삭제 후 Projection을 재생성한다 ([RSK-004](../operations/risks.md)).
- Projection 재생성 시간은 Event 수에 비례한다. 스냅샷은 필요해질 때 TD로 등록한다.

## Revisit Conditions
- Projection 전체 재생성이 로컬 기준 1분을 넘을 때
- 초당 Event가 단일 프로세스 처리 한계를 넘을 때 (RES-005 측정)
- Cloud 다중 사용자 단계에서 동시성 요구가 생길 때

## Related Documents
- [event-schema.md](../foundation/event-schema.md), [domain-model.md](../foundation/domain-model.md), [architecture.md](../foundation/architecture.md)
- [M1 milestone](../tasks/milestones/M1-event-ingestion-core.md)
