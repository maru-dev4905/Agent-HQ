# ADR-0005: MVP에 Redis + BullMQ를 도입한다

- Status: Accepted (2026-11-22, 사용자 결정 — "Redis, BullMQ 설치 진행")
- Date: 2026-11-22
- Deciders: 사용자 / 기록: Claude (Architect)
- Supersedes: [ADR-0003](ADR-0003-m1-tech-stack.md)의 "MVP에서 도입하지 않는 것: Redis/BullMQ" 항목. 이 항목은 Proposed 상태였으며 사용자 결정으로 대체한다. ADR-0003의 나머지 결정은 그대로 유효하다.

## Context
ADR-0003은 MVP에서 Redis/BullMQ를 쓰지 않고 DB Outbox만 쓰자고 제안했다. 이 항목은 사용자 질의를 거치지 않아 Proposed로 남아 있었다. 사용자는 Redis와 BullMQ를 MVP에 도입하기로 결정했다. 기획 명세서도 권장 스택에 Redis + BullMQ를 넣었다 (architecture §6·§7).

## Problem
MVP의 Background Job(주기 작업, 지연 작업, 재시도)과 실시간 발행 보조를 무엇으로 처리할 것인가?

## Options Considered
1. Redis + BullMQ (명세서 권장, 사용자 선택)
2. DB Outbox + 프로세스 내 타이머만 사용 (ADR-0003 초안 제안)
3. Valkey(Redis 프로토콜 호환, BSD-3) + BullMQ — 라이선스를 이유로 고려할 수 있는 대안

## Decision
Option 1. 로컬 셀프호스트 Docker Compose에 Redis를 추가하고, API에서 BullMQ(`@nestjs/bullmq`)를 사용한다.

**사용 원칙 (명세서 architecture §6, data-governance §7과 정합)**
- **Redis를 영구 데이터의 유일한 저장소로 쓰지 않는다.** Event의 내구성은 PostgreSQL(Event Store + DB Outbox)이 보장한다. Redis 데이터가 사라져도 Event는 잃지 않아야 한다.
- MVP 용도: (a) Outbox Relay와 Realtime 알림 보조 (b) Connection heartbeat 만료 검사, Stale·Gap 판정 같은 주기·지연 작업 (c) Projection 재생성(Replay) 같은 긴 작업 (d) 이후 Pipeline 실행 큐(Phase 5).
- Job은 재실행되어도 결과가 같도록(멱등) 작성한다.
- Redis 포트는 `127.0.0.1`에만 publish한다.

## Reasons
- 사용자 결정이며, 명세서 권장 스택과 일치한다.
- Phase 5 Pipeline Executor에서 큐가 필요하므로, 초기부터 운영 방식을 익히고 패턴을 고정해 두는 이점이 있다.

## Consequences
- 로컬 실행 구성요소가 하나 늘어난다 (PostgreSQL + Redis). RSK-015(Docker 요구)의 부담이 조금 커진다.
- Redis 공식 이미지(Redis 8 이상)의 라이선스는 RSALv2/SSPLv1/AGPLv3 중 선택하는 방식이다. 로컬 개발·셀프호스트에서 이미지를 받아 쓰는 데는 문제가 없지만, **이미지를 재배포하거나 관리형 서비스로 제공할 때는 검토가 필요하다** → [RSK-018](../operations/risks.md). Valkey는 프로토콜 호환 대안이다.
- 통합 테스트(G4)에 Redis가 필요한 경우가 생긴다.

## Revisit Conditions
- Cloud 배포 형태를 결정할 때 (관리형 Redis 또는 Valkey 선택, 라이선스 검토)
- Redis 장애가 Event 유실로 이어지는 경로가 발견될 때 (설계 위반 → 즉시 수정)

## Related Documents
- [ADR-0003](ADR-0003-m1-tech-stack.md), [architecture 통합 노트](../foundation/architecture.md#통합-노트-agent-hq-2026-11-22), [M1](../tasks/milestones/M1-event-ingestion-core.md)
