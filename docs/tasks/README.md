# Tasks

> 목적: 작업 관리 체계. 형식과 규칙은 [task-protocol](../agents/task-protocol.md)이 단일 원천이다.
> 관리 책임: Coordinator.

## 구성
| 파일 | 내용 |
|---|---|
| [backlog.md](backlog.md) | 전체 Task 요약 표 (ID, 제목, 상태, 의존성). **상태의 단일 원천** |
| `milestones/<M>-<name>.md` | 마일스톤 목표, 종료 조건, Task 상세, Execution Log |

마일스톤 파일:
- [M0 — Harness Bootstrap](milestones/M0-harness-bootstrap.md)
- [M1 — Simulated Event Pipeline](milestones/M1-simulated-event-pipeline.md)
- M2 이후: 개요만 [roadmap](../foundation/roadmap.md)에 있고, 이전 마일스톤 종료 시점에 상세화한다.

## 규칙
- 상태를 바꾸면 backlog.md 표와 milestone 파일의 Status 줄을 **함께** 갱신한다.
- Task 상세가 milestone 파일에서 커지면(실행 로그 포함 150줄 이상) `milestones/<M>/HQ-XXX.md`로 분리할 수 있다.
- 완료된 마일스톤 파일은 삭제하지 않는다 (이력).
