# Requirements

> 목적: 기능(FR)·비기능(NFR) 요구사항을 ID로 관리. Task는 이 ID를 참조한다.
> 관리 책임: Architect 제안 → 사용자 승인. 상태: Proposed | Confirmed | Deprecated

모든 항목은 별도 표기가 없으면 **Proposed**다.

## 1. 기능 요구사항 (FR)

### Event 수집 / 저장
| ID | 요구사항 | 마일스톤 |
|---|---|---|
| FR-001 | 시스템은 표준 Event Envelope([domain-model](domain-model.md#3-event-envelope-proposed-v0))을 따르는 Agent Event를 수신한다. | M1 |
| FR-002 | 스키마에 맞지 않는 Event는 거부하고 거부 사유를 반환한다. | M1 |
| FR-003 | 동일 `event_id`의 Event를 중복 수신해도 한 번만 저장한다 (멱등성). | M1 |
| FR-004 | Event는 append-only로 저장하며 수정하지 않는다. | M1 |
| FR-005 | 저장된 Event로부터 Projection을 처음부터 재생성할 수 있다 (Replay). | M1 |
| FR-006 | 결정적(seed 기반) 시뮬레이터로 다중 Agent 시나리오 Event를 생성한다. | M1 |

### 관찰 화면
| ID | 요구사항 | 마일스톤 |
|---|---|---|
| FR-010 | Dashboard는 Agent 목록과 각 Agent의 현재 상태를 보여준다. | M1 |
| FR-011 | Dashboard는 Session/Task 단위 실행 타임라인을 보여준다. | M1 |
| FR-012 | 새 Event가 들어오면 새로고침 없이 화면이 갱신된다 (목표 지연은 NFR-002). | M1 |
| FR-013 | Agent 간 위임 관계(부모-자식)를 시각화한다. | M1(기본)/M3 |
| FR-014 | 도구 호출(MCP 포함)의 입력·출력 요약, 소요 시간, 성공/실패를 보여준다. | M2/M3 |
| FR-015 | 3D Office 화면에서 Agent를 공간 내 캐릭터/오브젝트로 표현하고 상태를 반영한다. | M4 |

### 실제 Agent 연동
| ID | 요구사항 | 마일스톤 |
|---|---|---|
| FR-020 | Claude Code 세션의 실행 이벤트를 수집한다 (방식: RES-002). | M2 |
| FR-021 | MCP 서버/도구 호출 흐름을 수집한다 (방식: RES-003). | M3 |
| FR-022 | 로컬 수집기는 네트워크 단절 시 Event를 버퍼링하고 재전송한다. | M2 |

### 제어 / 오케스트레이션 (후순위)
| ID | 요구사항 | 마일스톤 |
|---|---|---|
| FR-030 | 사용자는 실행 중 Agent를 일시정지/중단할 수 있다. | M5 |
| FR-031 | 사용자는 워크플로를 정의하고 Agent에 작업을 배정할 수 있다. | M5 |
| FR-032 | 모든 제어 명령은 감사 로그(Event)로 남는다. | M5 |

## 2. 비기능 요구사항 (NFR)

| ID | 요구사항 | 비고 |
|---|---|---|
| NFR-001 | Local 모드는 외부 네트워크·계정 없이 동작한다. | Hybrid Deployment 전제 |
| NFR-002 | Event 수신부터 화면 반영까지 p95 1초 이내 (로컬, M1 부하 기준). | 목표치 — 측정 후 조정 |
| NFR-003 | M1 기준 부하: 동시 Agent 50, 초당 Event 200 처리. | 가정치 — RES-005에서 검증 |
| NFR-004 | 프롬프트·코드·파일 내용 등 콘텐츠는 기본 미저장 또는 마스킹. | [data-governance](../engineering/data-governance.md) |
| NFR-005 | Secret 패턴은 저장 전 마스킹된다. | [security](../engineering/security.md) |
| NFR-006 | Event 스키마는 버전을 가지며 하위 호환을 깨는 변경은 새 버전으로 낸다. | |
| NFR-007 | 개발 환경은 문서화된 명령만으로 재현 가능해야 한다. | HQ-003 |
| NFR-008 | 관찰 기능이 관찰 대상 Agent의 동작을 방해하지 않는다 (수집 실패 시 Agent는 계속 실행). | M2 hooks 설계 핵심 |

## 3. Open Questions
- NFR-002/003의 수치는 근거 없는 가정이다. 실제 Claude Code 세션의 Event 발생량을 측정(RES-002)한 뒤 확정한다.
