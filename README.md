# Agent HQ

다양한 AI 에이전트의 실행과 협업을 하나의 공간에서 구성·관찰·통제하는 Agent Operations Platform.
외부 Runtime(첫 번째: Claude Code)을 연결하거나 HQ가 직접 실행하고, 같은 Event 데이터를 전문 Dashboard와 3D Office로 보여준다.

## 현재 상태

**Pre-code (M0 / Phase 0).** 문서 체계와 Agent 협업 규칙(Harness)을 만들었고, 기획 명세서를 기준 문서로 채택했고([ADR-0004](docs/decisions/ADR-0004-adopt-spec-baseline.md)), 기술 스택을 정했다([ADR-0003](docs/decisions/ADR-0003-m1-tech-stack.md)). 제품 코드는 아직 없다.

- 현재 상태와 다음 작업: [docs/operations/current-status.md](docs/operations/current-status.md)
- 로드맵: [docs/foundation/roadmap.md](docs/foundation/roadmap.md)
- 첫 개발 마일스톤: [M1 — Event Ingestion Core](docs/tasks/milestones/M1-event-ingestion-core.md)

## 문서

| 대상 | 시작점 |
|---|---|
| 사람 (프로젝트 이해) | [docs/README.md](docs/README.md) → [product](docs/foundation/product.md) → [architecture](docs/foundation/architecture.md) |
| AI Agent (Claude Code 등) | [CLAUDE.md](CLAUDE.md) |

## 개발 환경

빌드·실행 방법은 HQ-003(Monorepo 골격) 완료 후 이 섹션에 추가한다. 필요 도구: Node 26 LTS, pnpm 10, Docker.
