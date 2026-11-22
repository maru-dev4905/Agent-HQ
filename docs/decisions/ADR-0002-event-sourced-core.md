# ADR-0002: Event Log를 단일 진실 원천으로 하는 코어

- Status: **Proposed** — 사용자 승인 필요
- Date: 2026-11-22
- Deciders: 사용자 / 제안: Claude (Architect)
- Supersedes: 없음

## Context
Agent HQ는 여러 소스(시뮬레이터, Claude Code, MCP)에서 실행 이벤트를 받고, 같은 데이터를 Dashboard·3D Office·통계·(향후) 제어 기능에서 사용한다. 초기 방향으로 `Simulated Agent Events → Event Ingestion → Database → Projection → Realtime Dashboard`가 제시되었다.

## Problem
관찰 데이터를 "현재 상태 테이블"로 저장할 것인가, "불변 Event Log + 파생 Projection"으로 저장할 것인가?

## Options Considered
### Option A — Append-only Event Log + Projection (Event Sourcing 경량형)
- 장점: 실행 과정 재생(Replay)·타임라인이 자연스럽다. 새 화면(3D Office) 추가 시 Projection만 추가. Projection 버그는 재생성으로 복구. 감사 로그(M5 제어)와 일관.
- 단점: 저장 용량 증가, Projection 재생성 비용, 스키마 버전 관리 필요, 개발 복잡도.
### Option B — 현재 상태 CRUD 테이블 + 별도 로그
- 장점: 단순, 익숙함.
- 단점: 상태와 로그 불일치 위험, 과거 재구성 어려움, 화면 추가 시 스키마 변경.
### Option C — 외부 관측 플랫폼(OpenTelemetry 백엔드 등)에 위임
- 장점: 기존 생태계 재사용.
- 단점: Agent 도메인(위임, Task) 모델링이 제한적, Local-first 요구와 충돌 가능, 외부 의존. (단, OTel을 **입력 소스**로 받는 것은 배제하지 않는다 — RES-002)

## Decision (제안)
Option A. 단, **경량형**: 별도 이벤트 스토어 제품을 도입하지 않고 일반 DB의 append-only 테이블 + 동기 Projector로 시작한다. CQRS 분산 구성, 메시지 브로커는 M1에서 도입하지 않는다.

## Reasons
- 제품의 핵심 가치(실행 과정 시각화, 재생)가 Event 시간축 그 자체다.
- Selective Storage 정책을 Event 단위(payload 마스킹)로 적용하기 쉽다.
- 시뮬레이터의 결정적 Event 스트림이 그대로 테스트 픽스처가 된다 (Replay 동일성 테스트).
- 가정(미검증): M1 규모(NFR-003)에서 단일 DB로 충분하다 → RES-005에서 확인.

## Consequences
- Event Envelope와 스키마 버전 관리가 필수가 된다 ([domain-model §3](../foundation/domain-model.md#3-event-envelope-proposed-v0)).
- 보존 기간·삭제 정책이 필요하다 (append-only와 "삭제권" 충돌) → [data-governance](../engineering/data-governance.md), [RSK-004](../operations/risks.md).
- Projection 재생성 시간이 Event 수에 비례 → 스냅샷은 필요할 때 TD로 등록.

## Revisit Conditions
- Projection 전체 재생성이 로컬에서 1분을 넘을 때
- 초당 Event가 단일 프로세스 처리 한계를 넘을 때 (RES-005 측정)
- Cloud 다중 사용자 단계(M6)에서 동시성 요구가 생길 때

## Related Documents
- [architecture.md](../foundation/architecture.md), [domain-model.md](../foundation/domain-model.md)
- [M1 milestone](../tasks/milestones/M1-simulated-event-pipeline.md)
