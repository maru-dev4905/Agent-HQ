# Roadmap

> 목적: 마일스톤의 순서, 목표, 종료 조건. 세부 Task는 [tasks/](../tasks/README.md)에 있다.
> 관리 책임: Coordinator가 제안하고 사용자가 승인한다.
> 출처: 기획 명세서 v0.1.0 `roadmap.md`([원본](../research/source/chatgpt-spec-v0.1/roadmap.md))의 Phase 구조를 채택했다 ([ADR-0004](../decisions/ADR-0004-adopt-spec-baseline.md)). 마일스톤 번호 M*n*은 명세서의 Phase *n*에 대응한다.
> 상태: Phase 구조 Confirmed / Phase별 Task 분해는 Proposed. 갱신 2026-11-22

## MVP 목표 (명세서 §1)
Claude Code에서 실행되는 외부 에이전트와 Subagent의 관찰 가능한 이벤트를 Agent HQ로 전달하고, 공통 Event Model을 통해 Dashboard와 3D Office에 실제 상태로 표현한다. 우선순위는 **정확한 관찰 → 신뢰할 수 있는 이벤트 → 이해 가능한 시각화**다.

| 마일스톤 | 명세서 Phase | 목표 | 종료 조건 (요약, 상세는 명세서와 milestone 파일) | 상태 |
|---|---|---|---|---|
| **M0** | Phase 0 Foundation & Decisions | Harness, ADR, Monorepo, 개발 환경 | 의존성 방향 명시, 기본 빌드·테스트 통과, 로컬 DB migration 실행 (Event Schema contract test는 M1 첫 Task HQ-101로 넘김) | In Progress |
| **M1** | Phase 1 Event Ingestion Core | 인증된 연결로 Event를 받아 저장·Projection·Realtime 처리 | 무효 Event 거부, 중복 방지, 수신·발생 시각 분리, Workspace 권한 검증, Cursor Replay, Gap/Unknown 표시 | Backlog |
| **M2** | Phase 2 Local Bridge & Claude Code Adapter | 로컬 Claude Code 이벤트 수집 | 연결·해제, 지원 hook 수신, Agent/Session 식별, Tool 매핑, 재연결 중복·누락 처리, Capability 표시, Secret 비노출 | Backlog |
| **M3** | Phase 3 Operations Dashboard | 실제 Event를 이해할 수 있는 UI | 상태 반영, 원본 Event 추적, 끊김·누락 표현, Dashboard·API 일치 | Backlog |
| **M4** | Phase 4 3D Office | 같은 Projection의 3D 표현 | Event 기반 상태 변화, Unknown/Idle 구분, Dashboard와 일치, 3D를 꺼도 기능 유지, 폭주 시 수집 비방해 | Backlog |
| **M5** | Phase 5 Initial Control & Pipeline | 제한된 범위의 HQ 실행·제어 | Pipeline Version 고정, Run 상태 전이 검증, 승인 전 위험 작업 차단 등 | Backlog |
| **M6** | Phase 6 Additional Adapters | OpenAI Agents SDK → LangGraph → Custom | 공통 Event Model 변경 없이 Adapter 추가 | Backlog |

## 명세서 대비 조정 (Proposed)
- **M1에 시뮬레이터와 개발용 Dashboard v0를 넣는다.** 실제 Runtime 없이 Phase 1 파이프라인 전체를 검증하기 위해서다 (사용자가 처음에 제시한 `Simulated Events → Ingestion → DB → Projection → Realtime Dashboard` 방향). Dashboard v0는 M3 Operations Dashboard의 출발점이다.
- **M1의 "Workspace 권한 검증"은 로컬 단일 Workspace + Connection 토큰으로 충족한다** ([security §5](../engineering/security.md#5-인증--권한--mvp-범위-proposed-res-007-s4)). 사용자 인증은 Cloud 단계 전에 ADR로 정한다.
- **Claude Code 신호 조사(RES-002, HQ-110)는 M1과 병행한다.** M2 설계와 Event Schema 점검의 입력이 된다.
- MCP Server 관리와 Tool 관찰은 명세서상 P1(MVP 이후)이다. 다만 Claude Code가 호출하는 MCP Tool은 M2의 Tool 이벤트로 관찰된다.

## 순서의 근거
- 명세서 §2 개발 원칙: 설계 문서와 Domain Contract를 먼저 확정하고, 3D는 이벤트 모델 이후에 연결하고, Local Bridge 보안과 데이터 정책을 초기부터 고려한다.
- 제어(M5)를 뒤에 두는 이유: 제품 원칙 2 "Observe before control" ([RSK-008](../operations/risks.md)).

## Open Questions
- MVP 3D Office 최소 범위 (OQ-6, RES-004) — M4 착수 전 ADR
- Cloud 배포 시점과 인증 Provider — MVP 이후
