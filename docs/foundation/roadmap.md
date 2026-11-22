# Roadmap

> 목적: 마일스톤 순서와 각 단계의 목표·종료 조건. 세부 Task는 [tasks/](../tasks/README.md).
> 관리 책임: Coordinator 제안 → 사용자 승인. 상태: **Proposed**

| 마일스톤 | 목표 | 종료 조건 (요약) | 상태 |
|---|---|---|---|
| **M0** Harness Bootstrap | 문서·규칙·도구 기반 구축, 스택 결정, 저장소 스캐폴드 | 첫 커밋, ADR-0001~0003 결정, HQ-003의 통합 Gate 명령([quality-gates §2](../engineering/quality-gates.md#2-통합-명령-proposed)) 동작 | In Progress |
| **M1** Simulated Event Pipeline | `Simulator → Ingestion → DB → Projection → Realtime Dashboard` | 시뮬레이터 시나리오가 실시간으로 Dashboard에 표시, Replay 동일성 테스트 통과 | Backlog |
| **M2** Claude Code Integration | 실제 Claude Code 세션 관찰 | 로컬 Claude Code 세션의 Tool Call/Subagent가 Dashboard에 표시, Agent 동작 무간섭 | Backlog |
| **M3** MCP & Delegation Observability | MCP 도구 흐름과 다중 Agent 위임 그래프 | MCP 호출과 위임 관계가 시각화 | Backlog |
| **M4** 3D Office | 같은 Projection의 3D 표현 | 3D 화면에서 Agent 상태가 실시간 반영 | Backlog |
| **M5** Control & Orchestration | 실행 제어, 워크플로 | 중단/재개, 작업 배정, 감사 로그 | Backlog |
| **M6** Cloud / Hybrid | 동기화, 인증, 다중 사용자 | OQ-2, OQ-7 결정 후 정의 | Backlog |

## 순서의 근거 (Proposed)
- M1을 시뮬레이터로 시작하는 이유: 실제 Agent 연동 방식(RES-002)이 불확실한 상태에서도 파이프라인과 Event 모델을 검증할 수 있고, 결정적 시나리오가 테스트 픽스처가 된다.
- 3D Office(M4)를 뒤에 두는 이유: Projection 계약이 안정되기 전에 3D를 만들면 재작업 비용이 크다.
- 제어(M5)를 뒤에 두는 이유: 관찰 데이터 없이 제어를 설계하면 보안·신뢰성 위험이 크다 ([RSK-008](../operations/risks.md)).

## Open Questions
- M4(3D)와 M3의 순서 — 데모/사용자 가치 측면에서 3D를 앞당길지 사용자 판단 필요.
