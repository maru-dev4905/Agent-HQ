# Backlog

> 목적: 전체 Task 상태의 단일 원천. 상세는 마일스톤 파일 참조. 의존성은 milestone 파일과 같은 내용으로 유지한다.
> 관리 책임: Coordinator. 최종 갱신: 2026-11-22

## M0 — Harness Bootstrap ([상세](milestones/M0-harness-bootstrap.md))

| ID | 제목 | 상태 | 위험도 | 의존성 |
|---|---|---|---|---|
| HQ-000 | Harness 문서 체계 구축 | In Review (사용자 검토) | Low | — |
| HQ-001 | 첫 커밋 (Harness 문서) | Blocked (커밋 승인 요청함) | Low | HQ-000, 커밋 승인 |
| HQ-002 | M1 핵심 ADR 결정 (ADR-0001·0002·0003) | Ready | High | RES-001(Task 내 수행), 사용자 승인 |
| HQ-003 | 저장소 스캐폴드 + 로컬 Quality Gate | Backlog | Medium | HQ-001, HQ-002, 의존성 설치 승인 |
| HQ-004 | CI 및 문서 검사 자동화 | Backlog | Medium | HQ-003, CI 도입 승인 |
| HQ-005 | Claude Code 프로젝트 설정 (권한, subagent 정의) | Backlog | Medium | HQ-001, 설정 변경 승인 |

## M1 — Simulated Event Pipeline ([상세](milestones/M1-simulated-event-pipeline.md))

| ID | 제목 | 상태 | 위험도 | 의존성 | 병렬 그룹 |
|---|---|---|---|---|---|
| HQ-101 | Event 스키마 v0 (계약) | Backlog | High | HQ-003, ADR-0002 Accepted | A |
| HQ-102 | 결정적 시뮬레이터 | Backlog | Medium | HQ-101 | B |
| HQ-104 | Event Store (append-only) + G4 도입 | Backlog | High | HQ-101 | B |
| HQ-103 | Ingestion API (검증·멱등·마스킹·한도) | Backlog | High | HQ-101, HQ-104 저장소 인터페이스 커밋 | B |
| HQ-105 | Projector + Read Models + Replay | Backlog | High | HQ-104 | C |
| HQ-106 | Query API + Realtime(SSE) 채널 | Backlog | Medium | HQ-103, HQ-105 | D |
| HQ-107 | Dashboard v0 (Agent 목록·상태·타임라인) | Backlog | Medium | HQ-106 API 계약 | D |
| HQ-108 | E2E: 시뮬레이터 → Ingestion → Dashboard | Backlog | Medium | HQ-102, HQ-103, HQ-107 | E |
| HQ-110 | 스파이크: Claude Code 신호 조사 (RES-002) | Backlog | Low | 없음 (언제든 병행) | — |
| HQ-111 | 부하 측정 (RES-005) | Backlog | Low | HQ-102, HQ-103, HQ-106 | E |

병렬 그룹: 같은 문자는 선행 그룹 완료 후 병렬 실행 가능. B 그룹은 HQ-101 계약이 커밋된 뒤에만 시작하고, HQ-103은 HQ-104의 저장소 인터페이스(타입)가 커밋된 뒤 시작한다.

## M2 이후 (개요)
[roadmap](../foundation/roadmap.md) 참조. M1 종료 시 M2 Task를 상세화한다.
