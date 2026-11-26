# Backlog

> 목적: 전체 Task 상태의 단일 원천. 상세는 마일스톤 파일을 본다. 의존성은 milestone 파일과 같은 내용으로 유지한다.
> 관리 책임: Coordinator. 최종 갱신: 2026-11-25
> 마일스톤 M*n* = 기획 명세서 Phase *n* ([roadmap](../foundation/roadmap.md))

## M0 — Harness Bootstrap / Phase 0 ([상세](milestones/M0-harness-bootstrap.md))

| ID | 제목 | 상태 | 위험도 | 의존성 |
|---|---|---|---|---|
| HQ-000 | Harness 문서 체계 구축 | Done | Low | — |
| HQ-001 | 첫 커밋 (Harness 문서) | Done | Low | HQ-000 |
| HQ-002 | 핵심 ADR 결정 (ADR-0001~0004) | Done | High | — |
| HQ-003 | 저장소 스캐폴드 + 로컬 개발 환경 + 로컬 Quality Gate | Done | Medium | HQ-002, Node 26 설치, 의존성 승인, Docker 실행 승인 |
| HQ-004 | CI + CodeRabbit + PR 흐름 | Done | Medium | HQ-003, CI 도입 승인 |
| HQ-005 | Claude Code 프로젝트 설정 (권한, subagent 정의) | Backlog | Medium | 설정 변경 승인 |

## M1 — Event Ingestion Core / Phase 1 ([상세](milestones/M1-event-ingestion-core.md))

| ID | 제목 | 상태 | 위험도 | 의존성 | 병렬 그룹 |
|---|---|---|---|---|---|
| HQ-101 | Event 계약 패키지 (Envelope + MVP Type) | Done | High | HQ-003 | A |
| HQ-102 | 결정적 시뮬레이터 (테스트용 Source) | Done | Medium | HQ-101 | B |
| HQ-103 | Connection 모델 + 토큰 인증 | Done | High | HQ-101, HQ-104 인터페이스 | B |
| HQ-104 | Event Store + G4 도입 | Done | High | HQ-101, Docker 실행 승인 | B |
| HQ-106 | Projector + Projections + Replay | Done | High | HQ-104 | C |
| HQ-105 | Ingestion API | Done | High | HQ-101, HQ-103, HQ-104 인터페이스, HQ-106 인터페이스 | C |
| HQ-107 | Query API + Realtime(SSE, Cursor Replay) | Done | Medium | HQ-105, HQ-106 | D |
| HQ-108 | Gap 감지와 Unknown/Stale 표시 | Done | Medium | HQ-103, HQ-106 | D |
| HQ-109 | 개발용 Dashboard v0 (Next.js) | Done | Medium | HQ-107 계약, HQ-108 | E |
| HQ-110 | 스파이크: Claude Code 신호 조사 (RES-002) | In Review | Low | 없음 (언제든 병행, scratch hook 설정은 승인 후) | — |
| HQ-111 | E2E: 시뮬레이터 → Ingestion → Dashboard | Backlog | Medium | HQ-102, HQ-105, HQ-108, HQ-109, E2E 도구 승인 | F |
| HQ-112 | 부하 측정 (RES-005) | Backlog | Low | HQ-102, HQ-105, HQ-107, HQ-109 | F |

병렬 그룹: 같은 문자는 선행 그룹이 끝난 뒤 병렬로 실행할 수 있다. B 그룹은 HQ-101 계약이 커밋된 뒤에 시작한다. 인터페이스 의존(HQ-104·HQ-106 인터페이스)은 해당 타입만 먼저 커밋되면 충족된다.

## M2 이후 (개요)
[roadmap](../foundation/roadmap.md)과 명세서 roadmap §5~§9를 본다. M1이 끝나면 M2(Local Bridge & Claude Code Adapter) Task를 상세화한다.
