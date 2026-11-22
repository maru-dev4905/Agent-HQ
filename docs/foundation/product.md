# Product — Agent HQ

> 목적: 제품 비전, 확정된 방향, 대상 사용자, Non-goals, 미결정 사항 정의.
> 관리 책임: 사용자(Product Owner). Agent는 Proposed/Open Question만 추가할 수 있다.

## 1. 비전

AI Agent를 위한 Headquarters. 여러 Agent가 무엇을 하고 있는지, 누가 누구에게 일을 넘겼는지, 어떤 도구와 데이터를 썼는지를 한눈에 **보고**, 문제가 생기면 **개입**하고, 최종적으로는 작업 흐름을 **지휘(오케스트레이션)**할 수 있게 한다.

진화 단계: **Observe → Manage → Orchestrate**

## 2. 확정된 제품 방향 (Confirmed, 2026-11-22, 사용자 지시)

| 항목 | 결정 | 해석 (Proposed — 확인 필요) |
|---|---|---|
| Execution Mode | Hybrid | 관찰 전용 모드 + 제어 모드를 모두 지원. 초기에는 관찰 중심 (OQ-1) |
| Screen Focus | Dashboard + 3D Office | 같은 데이터(Projection)를 두 가지 화면으로 표현 |
| Target Users | Developers + General Users | 개발자: 상세 이벤트·로그. 일반 사용자: 상태·진행률 중심 단순화 뷰 |
| Deployment | Hybrid | Local 단독 실행 + Cloud(동기화/공유) (OQ-2) |
| Data Storage | Selective | 메타데이터는 저장하고 프롬프트·코드 같은 콘텐츠는 선택해서 저장 ([data-governance](../engineering/data-governance.md)) |
| Execution Environment | Local + Cloud | 관찰 대상 Agent가 로컬 머신과 클라우드 양쪽에서 실행됨 |

> 오른쪽 "해석" 열은 Agent의 해석이며 **확정이 아니다.** 사용자 확인 후 Confirmed로 바꾼다.

## 3. 핵심 기능 방향 (Confirmed — 범위 수준)

- Agent 작업 상태 및 실행 과정 시각화
- 여러 Agent 간 작업 위임과 실행 흐름 관찰
- MCP를 통한 도구·데이터 흐름 관찰
- Agent 실행 이벤트 수집 및 분석
- 전문적인 Dashboard 화면
- 게임화된 3D Office 화면
- 향후 Agent 실행 제어 및 워크플로 오케스트레이션

## 4. 대상 사용자 (Proposed 페르소나)

| 페르소나 | 핵심 질문 | 필요한 화면 |
|---|---|---|
| 개발자 (Agent를 직접 돌리는 사람) | "지금 Agent가 뭘 하고 있지? 왜 실패했지? 어떤 파일을 건드렸지?" | Dashboard 상세, 타임라인, 도구 호출 로그 |
| 팀 리드 / 운영자 | "여러 Agent가 어디서 막혔지? 비용·시간은?" | Dashboard 요약, 지표 |
| 일반 사용자 | "내 Agent 팀이 일하고 있나? 끝났나?" | 3D Office, 단순 상태 |

## 5. Non-goals (Proposed — 초기 단계)

- Agent 프레임워크 자체를 만들지 않는다 (기존 Agent를 관찰·제어).
- 초기(M1~M2)에는 Agent 실행 제어를 하지 않는다 — 관찰만.
- LLM 호출 프록시/게이트웨이 역할은 하지 않는다 (재검토 가능).

## 6. 차별화 및 포지셔닝 (Open Question)

로컬에는 이미 Agent 오케스트레이션/관찰 도구가 존재한다(예: 이 개발 환경의 Orca는 worktree·worker·Run 관리 기능을 제공). Agent HQ가 이들과 **경쟁**하는지, **데이터 소스로 연동**하는지, **상위 계층**으로 위치하는지 결정이 필요하다. → OQ-5, [RSK-010](../operations/risks.md)

## 7. Open Questions

| ID | 질문 | 영향 |
|---|---|---|
| OQ-1 | Hybrid Execution Mode는 "관찰+제어 병행"인가, "Agent가 로컬/클라우드 어디서든 실행"인가? | 아키텍처 Control Plane 범위 |
| OQ-2 | Hybrid Deployment에서 Cloud의 역할은? (동기화/팀 공유/원격 Agent 실행) 로컬 단독 사용이 1급 시나리오인가? | 인증, 저장소, 비용 |
| OQ-3 | 첫 번째 실제 관찰 대상은 Claude Code만인가? (Codex, Cursor 등 포함 시점) | M2 범위 |
| OQ-4 | General Users는 Agent를 직접 실행하는 사람인가, 결과만 보는 사람인가? | UX, 권한 모델 |
| OQ-5 | Orca 등 기존 도구와의 관계 (경쟁/연동/상위 계층) | 포지셔닝, 통합 설계 |
| OQ-6 | 3D Office의 목표 수준 (장식적 시각화 vs 조작 가능한 인터페이스) | 기술 스택, 일정 |
| OQ-7 | 다중 사용자/팀 기능은 언제 필요한가? | 인증·권한 도입 시점 |
