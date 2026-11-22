# ADR-0004: 기획 명세서 v0.1.0을 제품 기준 문서로 채택한다

- Status: Accepted (2026-11-22, 사용자 결정 — "기준 문서로 채택")
- Date: 2026-11-22
- Deciders: 사용자 / 검토: Claude (Architect)
- Supersedes: 없음. 이 ADR은 `foundation/` 문서의 초안 해석(Hybrid의 의미, Event Envelope v0 등)을 대체한다. 초안은 커밋 `1234b4b`에 있다.

## Context
사용자는 ChatGPT와 함께 작성한 기획 명세서 v0.1.0(기준일 2026-11-20)을 제공했다. 이 명세서는 Harness 문서보다 제품·도메인 범위가 넓고 구체적이다. 검토 결과는 [RES-007](../research/RES-007-chatgpt-spec-review.md)에 있으며, 원본은 [source/chatgpt-spec-v0.1/](../research/source/chatgpt-spec-v0.1/README.md)에 그대로 보존했다.

## Problem
명세서를 기준 문서로 삼을 것인가, 참고 자료로만 둘 것인가? 명세서에 적힌 "확정된 결정"을 Confirmed로 볼 것인가?

## Options Considered
1. 기준 문서로 채택: D-001~D-009를 Confirmed로 기록하고 제품·도메인·이벤트·보안·UX를 명세서 기준으로 통합한다.
2. 제품 방향(D-001~D-007)만 채택한다.
3. 참고 자료로만 둔다.

## Decision
Option 1.

**Confirmed 결정 (명세서 decisions.md §1)**
| ID | 결정 |
|---|---|
| D-001 | Hybrid Agent Platform: 외부 Runtime 연결(Attached) + HQ 자체 Orchestration(Managed) |
| D-002 | Dual UI: 3D Office + 전문 Dashboard, 동일 도메인/Event 데이터 사용 |
| D-003 | 개발자 + 비개발자. Easy/Developer Mode는 같은 Core 위의 UX 계층 |
| D-004 | Hybrid Deployment: Cloud + Local |
| D-005 | Selective Data Storage: 데이터 유형별 저장 위치·동기화 정책 선택 |
| D-006 | Local + Cloud 실행 모두 지원 |
| D-007 | 첫 실전 Adapter: Claude Code |
| D-008 | Modular Monolith First |
| D-009 | Event-driven Visualization: 애니메이션은 실제 상태를 꾸며내지 않는다 |

**적용 규칙**
- 명세서의 제품 원칙, 도메인 모델, Event Schema, Adapter·Pipeline 명세, 데이터 거버넌스, 보안 모델, UI/UX를 `docs/foundation/`·`docs/engineering/`의 기준 내용으로 통합한다.
- 명세서의 **기술 스택 권장안은 Confirmed가 아니다.** 기술 선택은 [ADR-0003](ADR-0003-m1-tech-stack.md)을 따른다.
- 명세서의 Open Decision은 Open Question으로 유지한다.
- RES-007 §3에서 발견한 명세서 자체의 문제(S1~S9)는 통합 문서의 "통합 노트"에 해결안(Proposed)으로 기록한다.
- 명세서와 Harness 문서(개발 프로세스, 품질, Agent 협업)가 충돌하면 Harness 문서가 우선한다. 명세서는 해당 영역을 다루지 않는다.

## Reasons
- 사용자가 기획 과정에서 이미 내린 결정을 존중한다 ("기존 자료 우선" 원칙).
- 명세서가 Truthful Visualization, Unknown/Gap, Capability 기반 제어 같은 핵심 원칙을 더 정확하게 정의한다.

## Consequences
- 초안 foundation 문서의 제품·도메인 내용(Event Envelope v0, Event type 이름, Hybrid 해석)은 Deprecated된다.
- 로드맵을 명세서 Phase 0~6 구조로 재편한다. 시뮬레이터는 Phase 1의 테스트용 Source로 유지한다.
- OQ-1(Hybrid 의미)과 OQ-3(첫 Runtime)이 해소된다.

## Revisit Conditions
- 명세서 v0.2 이상이 제공될 때 → 차이를 검토하고 새 ADR 작성
- 구현 중 명세서 요구가 Runtime 실제 기능과 맞지 않을 때 (예: Claude Code hook이 제공하지 않는 정보)

## Related Documents
- [RES-007](../research/RES-007-chatgpt-spec-review.md), [product.md](../foundation/product.md), [roadmap.md](../foundation/roadmap.md)
