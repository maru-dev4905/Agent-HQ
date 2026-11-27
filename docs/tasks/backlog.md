# Backlog

> 목적: 전체 Task 상태의 단일 원천. 상세는 마일스톤 파일을 본다. 의존성은 milestone 파일과 같은 내용으로 유지한다.
> 관리 책임: Coordinator. 최종 갱신: 2026-11-27
> 마일스톤 M*n* = 기획 명세서 Phase *n* ([roadmap](../foundation/roadmap.md)). 위험도: 열린 Task는 0~3 숫자(HQ-006), 완료된 Task의 Low·Medium·High 표기는 이력으로 둔다(0~1·2·3)

## M0 — Harness Bootstrap / Phase 0 ([상세](milestones/M0-harness-bootstrap.md))

| ID | 제목 | 상태 | 위험도 | 의존성 |
|---|---|---|---|---|
| HQ-000 | Harness 문서 체계 구축 | Done | Low | — |
| HQ-001 | 첫 커밋 (Harness 문서) | Done | Low | HQ-000 |
| HQ-002 | 핵심 ADR 결정 (ADR-0001~0004) | Done | High | — |
| HQ-003 | 저장소 스캐폴드 + 로컬 개발 환경 + 로컬 Quality Gate | Done | Medium | HQ-002, Node 26 설치, 의존성 승인, Docker 실행 승인 |
| HQ-004 | CI + CodeRabbit + PR 흐름 | Done | Medium | HQ-003, CI 도입 승인 |
| HQ-005 | Claude Code 프로젝트 설정 (권한, subagent 정의) | Backlog | 2 | 설정 변경 승인 |
| HQ-006 | 리뷰 흐름 조정 (위험도별 CodeRabbit) | Done | 2 | 사용자 승인(2026-11-26) |

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
| HQ-110 | 스파이크: Claude Code 신호 조사 (RES-002) | Done | Low | 없음 (언제든 병행, scratch hook 설정은 승인 후) | — |
| HQ-111 | E2E: 시뮬레이터 → Ingestion → Dashboard | Done | 2 | HQ-102, HQ-105, HQ-108, HQ-109, E2E 도구 승인 | F |
| HQ-112 | 부하 측정 (RES-005) | Done | 1 | HQ-102, HQ-105, HQ-107, HQ-109 | F |
| HQ-113 | 쓰기 경로 최적화 (Replay·Ingestion 배치·lock 대기) | Done | 3 | HQ-112 | G |
| HQ-114 | Gap 감지 증분 검사 | Backlog (보류) | 2 | HQ-112 | G |

병렬 그룹: 같은 문자는 선행 그룹이 끝난 뒤 병렬로 실행할 수 있다. B 그룹은 HQ-101 계약이 커밋된 뒤에 시작한다. 인터페이스 의존(HQ-104·HQ-106 인터페이스)은 해당 타입만 먼저 커밋되면 충족된다.

M1 Done (2026-11-27, 종료 조건 점검은 M1 파일 머리말). HQ-114는 보류 상태로 M2 기간에 남는다.

## M2 — Local Bridge & Claude Code Adapter / Phase 2 ([상세](milestones/M2-local-bridge-claude-code.md))

| ID | 제목 | 상태 | 위험도 | 의존성 | 병렬 그룹 |
|---|---|---|---|---|---|
| HQ-200 | M1 종료 점검과 M2 Task 분해 | Done | 1 | M1 종료 | — |
| HQ-201 | ADR-0007 Local Bridge 구조와 보안 (Proposed) | Blocked (승인 대기) | 3 | HQ-200, Accepted는 사용자 승인 | A |
| HQ-202 | Claude Code Adapter 매핑 패키지 | In Review | 3 | HQ-200 (subagent 재개 연결 규칙만 HQ-201 결정을 따름) | A |
| HQ-203 | Local Bridge: Pairing·자격 증명·heartbeat·Capability 보고 | Backlog | 3 | HQ-201 Accepted, HQ-202 Capability 선언 (ADR-0007 제안대로면 새 의존성 없음) | B |
| HQ-204 | Local Bridge: Outbox·전송·재연결 | Backlog | 3 | HQ-203 | C |
| HQ-205 | ADR-0007 결정의 HQ 쪽 반영 (끊김 해제·세션 생존) | Backlog | 3 | HQ-201 Accepted | B |
| HQ-206 | Claude Code hook 수집 명령 | Backlog | 3 | HQ-201 Accepted, HQ-202, HQ-204 outbox 인터페이스 | D |
| HQ-207 | hook 설치·제거 명령 | Backlog | 3 | HQ-206, hook 설치 위치 결정(ADR-0007) | E |
| HQ-208 | Capability 계약 | Backlog | 3 | HQ-202 Capability 선언 | B |
| HQ-209 | Capability 저장·조회 | Backlog | 3 | HQ-208, migration 승인 | C |
| HQ-210 | Capability 화면 표시 | Backlog | 2 | HQ-209 | D |
| HQ-211 | 실제 Claude Code 세션 관찰 검증 | Backlog | 3 | HQ-203~HQ-210, 실제 세션 관찰 사용자 동의, scratch hook 설정 승인 | F |

승인 공통(Docker, 새 의존성, migration 적용, CI 변경)은 CLAUDE.md §6을 따른다. 위 표에는 Task 고유 승인만 적는다.

## M3 이후 (개요)
[roadmap](../foundation/roadmap.md)과 명세서 roadmap §6~§9를 본다. M2가 끝나면 M3(Operations Dashboard) Task를 상세화한다.
