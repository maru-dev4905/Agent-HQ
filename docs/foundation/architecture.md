# Architecture

> 목적: 시스템의 논리 구조, 컴포넌트 경계, 데이터 흐름, 배포 형태를 정의.
> 관리 책임: Architect. 구조 변경은 ADR을 동반한다.
> 상태: **전체 Proposed.** 기술 스택은 [ADR-0003](../decisions/ADR-0003-m1-tech-stack.md)에서 결정한다.

## 1. 설계 원칙 (Proposed)

1. **Event가 단일 진실 원천이다.** 화면·통계·제어 상태는 모두 Event Log에서 파생된 Projection이다 ([ADR-0002](../decisions/ADR-0002-event-sourced-core.md)).
2. **수집(Source)과 표현(View)을 분리한다.** 시뮬레이터, Claude Code, MCP 등 어떤 소스든 같은 Envelope로 들어온다. Dashboard와 3D Office는 같은 Projection을 소비한다.
3. **Local-first.** 로컬 단독으로 완전히 동작하고, Cloud는 동기화·공유 계층으로 추가한다 (NFR-001).
4. **관찰은 비침투적이다.** 수집 실패가 관찰 대상 Agent를 멈추지 않는다 (NFR-008).
5. **제어(Control Plane)는 관찰(Data Plane)과 분리한다.** M5 이전에는 Control Plane을 만들지 않는다.

## 2. 논리 구조

```text
 Sources                     Core                                   Views
┌───────────────────┐       ┌──────────────────────────────────┐   ┌──────────────┐
│ Simulator   (M1)  │──┐    │  Ingestion API                   │   │ Dashboard    │
│ Claude Code (M2)  │──┼──▶ │   - schema 검증 / 멱등성          │   │  (M1)        │
│  hooks→Collector  │  │    │   - redaction (마스킹)            │   ├──────────────┤
│ MCP observer (M3) │──┤    │        │                         │   │ 3D Office    │
│ 기타 Agent (TBD)  │──┘    │        ▼                         │   │  (M4)        │
└───────────────────┘       │  Event Store (append-only)       │   └──────▲───────┘
                            │        │                         │          │
                            │        ▼                         │          │
                            │  Projector ──▶ Read Models       │──────────┘
                            │                (agent state,     │  Query API +
                            │                 timeline, graph) │  Realtime channel
                            └──────────────────────────────────┘
                            Control Plane (M5, 별도) ── 명령도 Event로 기록
```

### 컴포넌트 책임

| 컴포넌트 | 책임 | 하지 않는 것 |
|---|---|---|
| Source Adapter | 외부 Agent의 신호를 Envelope로 변환해 전송 | 저장, 집계 |
| Local Collector (M2) | 로컬 Agent 신호 수집, 버퍼링, 재전송 | 화면 렌더링 |
| Ingestion API | 검증, 멱등성, 마스킹, 저장 요청 | 비즈니스 집계 |
| Event Store | Event의 영구 append-only 저장 | Event 수정 |
| Projector | Event → Read Model 변환, 재생성(Replay) | 외부 입력 수신 |
| Query API / Realtime | Read Model 조회, 변경 Push | Event 생성 |
| Views | 표현 | 상태의 원천 보유 |

## 3. 배포 형태 (Proposed, OQ-2 확정 필요)

| 모드 | 구성 | 상태 |
|---|---|---|
| Local | 단일 프로세스(또는 소수 프로세스) + 로컬 파일 DB + 브라우저 UI | M1 대상 |
| Cloud | 다중 사용자 서버 + 관리형 DB + 인증 | M6 이후, 범위 미정 |
| Hybrid | Local이 Cloud로 선택적 동기화 (Selective Storage 정책 적용) | 설계만 M2 이후 |

**Local과 Cloud의 차이로 생기는 위험**: [RSK-003](../operations/risks.md) (저장소 차이), [RSK-005](../operations/risks.md) (인증 부재 상태의 로컬 API 노출).

## 4. 기술 스택 현황

| 영역 | 상태 | 근거 |
|---|---|---|
| 언어 | Unknown (TypeScript 유력 후보) | [ADR-0003](../decisions/ADR-0003-m1-tech-stack.md) |
| 런타임/패키지 매니저 | Unknown (설치 확인: Node v24.14.0, pnpm 10.33.2, bun 1.4.2) | 2026-11-22 확인 |
| DB | Unknown | ADR-0003, RES-005 |
| Realtime 전송 | Unknown (SSE / WebSocket) | ADR-0003 |
| Frontend | Unknown | ADR-0003 |
| 3D 엔진 | Unknown | RES-004 (M4 전 결정) |
| Claude Code 연동 방식 | Unknown | RES-002 |
| MCP 관찰 방식 | Unknown | RES-003 |

> 이 표는 "결정됨"이 될 때만 갱신한다. 이전 대화에서 나온 기술 제안은 결정으로 간주하지 않는다.

## 5. 아키텍처 Open Questions
- Collector를 별도 프로세스로 둘지, Ingestion 서버가 직접 hook 요청을 받을지 (RES-002 결과에 의존)
- Projection을 동기(수신 즉시) 처리할지 비동기 큐로 처리할지 — M1은 동기 단일 프로세스로 시작하는 것을 제안
- Event Store와 Read Model을 같은 DB에 둘지
