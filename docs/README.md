# docs — 문서 지도

> 목적: 문서 체계, 각 문서의 책임, 작성·갱신 규칙 정의.
> 관리 책임: Documenter (구조 변경은 사용자 승인)

## 1. 상태 라벨 (모든 문서 공통)

| 라벨 | 의미 |
|---|---|
| **Confirmed** | 사용자가 확정한 사항. 근거(날짜·출처)를 함께 적는다. |
| **Proposed** | Agent가 제안했으나 승인되지 않은 사항. |
| **Unknown** | 확인·조사가 필요한 사항. 가능하면 Research ID를 연결한다. |
| **Deprecated** | 더 이상 사용하지 않는 사항. 삭제하지 않고 대체 항목을 링크한다. |

## 2. 디렉터리와 책임

| 경로 | 책임 | 변경 빈도 |
|---|---|---|
| [foundation/product.md](foundation/product.md) | 제품 정의, 원칙, 사용자, 기능 범위 (명세서 기준) | 낮음 |
| [foundation/requirements.md](foundation/requirements.md) | 기능/비기능 요구사항 (ID 부여) | 중간 |
| [foundation/architecture.md](foundation/architecture.md) | 시스템 구조, 컴포넌트 경계, 배포 형태 | 중간 |
| [foundation/domain-model.md](foundation/domain-model.md) | 엔티티, 관계, 상태 모델 (명세서 기준) | 중간 |
| [foundation/event-schema.md](foundation/event-schema.md) | Event Envelope, Type, 순서·중복·Gap (명세서 기준) | 중간 |
| [foundation/adapter-spec.md](foundation/adapter-spec.md) | Runtime Adapter 계약, Capability, Claude Code Adapter (명세서 기준) | 중간 |
| [foundation/pipeline-spec.md](foundation/pipeline-spec.md) | Pipeline 정의·검증·실행 (명세서 기준, Phase 5) | 낮음 |
| [foundation/ui-ux.md](foundation/ui-ux.md) | 정보 구조, 화면, 3D Office, 접근성 (명세서 기준) | 중간 |
| [foundation/roadmap.md](foundation/roadmap.md) | 마일스톤 순서와 목표 | 낮음 |
| [decisions/](decisions/README.md) | ADR (의사결정 기록) | 결정 시 |
| [engineering/coding-standards.md](engineering/coding-standards.md) | 코드 작성 규칙 | 낮음 |
| [engineering/testing-strategy.md](engineering/testing-strategy.md) | 테스트 계층과 원칙 | 낮음 |
| [engineering/quality-gates.md](engineering/quality-gates.md) | 검증 Gate와 실제 도입 상태 | 도구 도입 시 |
| [engineering/security.md](engineering/security.md) | 보안 규칙, Tool Governance | 중간 |
| [engineering/data-governance.md](engineering/data-governance.md) | 데이터 분류, 저장·보존·마스킹 | 중간 |
| [agents/agent-workflow.md](agents/agent-workflow.md) | Harness: 컨텍스트, 실행 제어, 관측, 피드백 루프 | 중간 |
| [agents/subagent-roles.md](agents/subagent-roles.md) | 역할 정의, 호출 기준 | 낮음 |
| [agents/task-protocol.md](agents/task-protocol.md) | Task 형식, 상태, Worker 지시서 형식 | 낮음 |
| [agents/review-protocol.md](agents/review-protocol.md) | 리뷰 절차, 체크리스트, 보고 형식 | 낮음 |
| [agents/orca-cli.md](agents/orca-cli.md) | 확인된 Orca CLI 명령과 사용 패턴 | Orca 업데이트 시 |
| [operations/current-status.md](operations/current-status.md) | 현재 상태, 세션 인계 | **매 세션** |
| [operations/changelog.md](operations/changelog.md) | 변경 이력 | 매 작업 |
| [operations/issues.md](operations/issues.md) | 실제 발생한 문제 | 발생 시 |
| [operations/risks.md](operations/risks.md) | 잠재 위험 | 발견 시 |
| [operations/technical-debt.md](operations/technical-debt.md) | 기술 부채 | 발견 시 |
| [operations/troubleshooting.md](operations/troubleshooting.md) | 재발 가능한 문제의 해결 방법 | 해결 시 |
| [research/](research/README.md) | 조사 주제(RES)와 결과. `research/source/`는 외부에서 받은 원본 자료(수정 금지) | 조사 시 |
| [tasks/](tasks/README.md) | Backlog, 마일스톤별 Task 상세 | 매 작업 |

> 요청된 기본 구조에 추가한 문서: `agents/orca-cli.md`(확인된 명령만 별도 관리), `operations/issues.md`(Issue와 Risk 분리), 명세서에서 온 `foundation/{event-schema,adapter-spec,pipeline-spec,ui-ux}.md`.
>
> **명세서 기반 문서 규칙**: "(명세서 기준)" 문서는 본문이 기획 명세서 v0.1.0 원문이고, 하단 "통합 노트"가 본문보다 우선한다. 본문을 바꾸려면 ADR을 거친다. 일상적인 보완은 통합 노트에 쓴다.

## 3. 작성 원칙

1. 문서 상단에 **목적**과 **관리 책임**을 적는다.
2. 한 정보는 한 곳에만 쓴다(Single Source of Truth). 다른 곳에서는 링크한다.
3. 명령어·설정·버전은 **실제로 확인한 것만** 적고 확인 날짜를 남긴다.
4. 미결정 사항은 `Open Question` 또는 `TODO`로 남긴다.
5. 문서를 바꾸면 이 표에서 영향받는 문서를 확인한다.
6. 사람이 읽는 문서는 한국어, 식별자·명령어·코드는 원문 그대로 쓴다.

## 4. ID 체계

| 종류 | 형식 | 위치 |
|---|---|---|
| ADR | `ADR-0001` | decisions/ |
| Task | `HQ-001` (M0), `HQ-101` (M1) … 백의 자리 = 마일스톤 | tasks/ |
| Issue | `ISS-001` | operations/issues.md |
| Risk | `RSK-001` | operations/risks.md |
| Technical Debt | `TD-001` | operations/technical-debt.md |
| Research | `RES-001` | research/README.md |
| Requirement | `FR-001`, `NFR-001` | foundation/requirements.md |
