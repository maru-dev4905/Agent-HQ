# ADR-0003: MVP 기술 스택과 실행 형태

- Status: Accepted (2026-11-22, 사용자 승인 — 질의응답 2회로 항목별 결정). 단, Decision의 "MVP에서 도입하지 않는 것"(Redis/BullMQ 보류)은 사용자 질의 대상이 아니었으므로 **Proposed로 남아 있으며 사용자 확인 대기**다.
- Date: 2026-11-22
- Deciders: 사용자 / 제안·조사: Claude (Architect)
- Supersedes: 없음 (같은 날 작성한 초안 "React+Vite / SQLite / 단일 프로세스" 제안을 사용자 결정에 따라 수정한 뒤 승인. 초안은 커밋 `1234b4b`에 있다)

## Context
- 저장소에는 아직 코드가 없다.
- 기획 명세서 v0.1.0([ADR-0004](ADR-0004-adopt-spec-baseline.md))의 권장 스택은 Next.js, NestJS, PostgreSQL, Prisma, Redis+BullMQ, WebSocket/SSE, Docker, pnpm이다. 명세서 스스로 "제안이며 착수 전 버전·라이선스 확인"이라고 적었다.
- 확인 결과는 [RES-001 Result](../research/README.md#res-001--m1-기술-스택-검증)에 있다 (2026-11-22, npm registry·nodejs.org·endoflife.date). 판단에 중요한 사실:
  - TypeScript 최신은 7.0.2지만 `typescript-eslint`는 `<6.1.0`만 지원한다.
  - Prisma의 npm `latest` 태그는 RC(8.0.0-rc.34)를 가리킨다. 안정판은 7.10.1이다.
  - Node 26이 Active LTS이고, 로컬에 설치된 Node는 24.14.0이다.

## Problem
MVP(Phase 0~4)를 어떤 실행 형태와 기술로 만들 것인가?

## Options Considered
| 결정 항목 | 검토한 옵션 |
|---|---|
| MVP 실행 형태 | 로컬 셀프호스트(Docker Compose) / Cloud 우선 / 단일 프로세스 + SQLite |
| Backend | NestJS + Fastify / Fastify 단독 / Hono |
| Frontend | Next.js / React + Vite SPA |
| DB 접근 | Prisma 7.10.x 고정 / Drizzle ORM / Kysely |
| Node | 26 LTS / 24 LTS |
| Realtime | SSE + REST / WebSocket |

장단점은 2026-11-22 질의에서 제시한 내용과 [RES-007](../research/RES-007-chatgpt-spec-review.md)에 정리되어 있다.

## Decision

| 영역 | 결정 | 고정 범위 |
|---|---|---|
| MVP 실행 형태 | **로컬 셀프호스트**: Docker Compose로 API와 PostgreSQL을 로컬에서 실행하고 Web은 브라우저로 접속한다. Local Bridge는 localhost의 API에 연결한다. 같은 구조를 이후 Cloud에 배포한다 | — |
| 언어 | TypeScript | **6.0.x** (7.x는 lint 도구 호환 시 재검토) |
| 런타임 | Node.js | **26 LTS** (사용자가 설치. 설치 전까지 Gate 실행 불가) |
| Monorepo | pnpm workspace | 10.x |
| Backend | **NestJS + Fastify 어댑터** (Modular Monolith, D-008) | 12.x |
| Frontend | **Next.js** (UI 전용. 도메인 API는 NestJS가 담당) | 16.x, React 19.x |
| DB | PostgreSQL (Docker 이미지) | 메이저 버전은 HQ-003에서 결정 |
| DB 접근 | **Prisma**. 버전은 명시적으로 고정한다 (`latest` 태그 사용 금지) | **7.10.x** |
| Realtime | **SSE + REST**. `Last-Event-ID`로 Cursor Replay, 명령은 REST | — |
| Schema 검증 | Zod (명세서 권장, Envelope 계약 공유) | 4.x |

**MVP에서 도입하지 않는 것 (제안 — 필요해지면 새 ADR)**: Redis/BullMQ. 내구성 있는 발행은 DB Outbox로 한다. 명세서 architecture §6 "Redis 큐만으로 내구성을 보장한다고 가정하지 않는다"와도 정합한다.

**HQ-003에서 의존성 승인과 함께 확정할 구현 도구 (ADR 불필요)**: lint/format(ESLint 또는 Biome), 테스트(Vitest, Playwright 후보), 상태 관리(Zustand, TanStack Query 후보), 3D(R3F)·그래프 편집(React Flow)은 해당 Phase에서 확정한다.

## Reasons
- 로컬 셀프호스트로 시작하면 Cloud 계정·비용·인증 결정 없이 MVP를 검증할 수 있다. 동시에 Cloud와 같은 PostgreSQL을 쓰므로 Local/Cloud DB 이원화([RSK-003](../operations/risks.md))를 피한다.
- NestJS 모듈 구조가 Modular Monolith 경계를 강제하므로, 여러 Agent가 함께 개발할 때 일관성을 유지하기 쉽다.
- Next.js는 이후 Cloud 배포·인증·라우팅에 유리하다.
- Prisma는 사용자가 선택했다. 명세서 권장안이고 생태계가 성숙하다.
- SSE는 단방향 Push와 Cursor Replay(`Last-Event-ID`)를 표준으로 지원한다. 승인·제어 명령은 REST로 충분하다.

## Consequences
- **로컬 사용자에게 Docker가 필요하다.** General Users 대상 배포에는 장벽이 된다 → [RSK-015](../operations/risks.md). 개발 중 Docker 실행은 CLAUDE.md §6에 따라 승인이 필요하다.
- **Prisma 8 전환 비용이 예상된다** → [TD-003](../operations/technical-debt.md). Event Store의 `ON CONFLICT DO NOTHING` 같은 제어가 필요한 부분은 Prisma가 지원하는 raw/typed SQL을 저장소 계층 안에만 두어 영향 범위를 제한한다.
- TS 7(Go 기반 컴파일러)의 빌드 속도 이점은 lint 도구가 지원할 때까지 쓰지 않는다.
- Node 26 설치 전에는 로컬 Gate를 실행할 수 없다 (HQ-003 의존성).
- Next.js와 NestJS 두 서버를 개발 중에 함께 실행해야 한다. 기동 스크립트와 Compose 구성이 필요하다.

## Revisit Conditions
- `typescript-eslint`가 TS 7을 지원할 때 → TS 업그레이드 검토
- Prisma 8.0이 정식 출시될 때 → 업그레이드 Task 생성
- RES-005 측정에서 단일 프로세스·단일 DB가 목표 부하를 처리하지 못할 때
- General Users 대상 배포 형태(Desktop App 등, 명세서 Open Decision)를 결정할 때
- 양방향 세션이 필요한 기능(실시간 제어 등)을 착수할 때 → WebSocket 검토

## Related Documents
- [RES-001](../research/README.md#res-001--m1-기술-스택-검증), [RES-007](../research/RES-007-chatgpt-spec-review.md), [architecture.md](../foundation/architecture.md), [HQ-003](../tasks/milestones/M0-harness-bootstrap.md)
