# System Architecture

> 목적: 시스템 구성, 실행 모드, Local Bridge, 데이터·실시간 처리, Monorepo, API 경계, 장애 복구
> 관리 책임: Architect. 구조 변경은 ADR 필요
> 상태: 본문 Confirmed(구조 방향: D-001, D-004, D-008) / §7 기술 스택은 통합 노트 N1로 대체 / §9 API는 후보
> 출처: 기획 명세서 v0.1.0 `architecture.md` ([원본](../research/source/chatgpt-spec-v0.1/architecture.md)) — [ADR-0004](../decisions/ADR-0004-adopt-spec-baseline.md)로 기준 문서로 채택(2026-11-22). 본문은 원문을 그대로 옮겼다. **하단 "통합 노트"가 본문보다 우선한다.**
> 기술 스택에 관한 서술은 제안일 뿐이며, 실제 결정은 [ADR-0003](../decisions/ADR-0003-m1-tech-stack.md)을 따른다.

## 1. 아키텍처 목표

Agent HQ는 외부 Agent Runtime을 관찰하는 기능과 HQ가 실행을 소유하는
기능을 함께 제공한다. 이를 위해 UI, 도메인, 오케스트레이션, 통합, 인프라
책임을 분리한다.

초기 구현은 **Modular Monolith**를 권장한다. 논리적 모듈을 명확히
분리하되, 초기부터 마이크로서비스를 강제하지 않는다. 부하와 배포 요구가
확인되면 Event Worker, Execution Worker, Realtime Gateway 등을 별도
프로세스로 분리한다.

## 2. 시스템 컨텍스트

``` mermaid
flowchart TB
  User[User]
  Web[Agent HQ Web]
  Cloud[Agent HQ Cloud API]
  Local[HQ Local Bridge]
  Ext[External Agent Runtime]
  Managed[HQ Managed Runtime]
  MCP[MCP Servers / Tools]
  DB[(PostgreSQL)]
  Redis[(Redis)]
  Store[(Object Storage)]

  User --> Web
  Web <--> Cloud
  Cloud <--> Local
  Local <--> Ext
  Local <--> MCP
  Cloud --> Managed
  Managed <--> MCP
  Cloud --> DB
  Cloud <--> Redis
  Cloud --> Store
```

### 주요 구성 요소

-   **Web App:** Dashboard, Studio, 3D Office, Operations.
-   **Cloud API:** 인증, Workspace, 도메인 API, 정책, 이벤트 수집 및
    조회.
-   **Local Bridge:** 사용자 장치의 Runtime 및 로컬 리소스와 통신.
-   **External Runtime:** Claude Code 등 사용자가 별도로 실행하는
    런타임.
-   **Managed Runtime:** HQ가 생성·관리하는 실행 환경.
-   **MCP Integration:** MCP Client/Server 및 외부 Tool 연결.
-   **Storage:** 관계형 데이터, 이벤트, Artifact, 임시 상태.

## 3. 논리 계층

### 3.1 Presentation Layer

-   Dashboard UI
-   3D Office
-   Pipeline Builder
-   Mission Control
-   Admin / Settings

Presentation은 도메인 DB에 직접 접근하지 않는다. API 및 Realtime
Subscription을 사용한다.

### 3.2 Application Layer

-   Workspace Service
-   Project Service
-   Agent Service
-   Mission / Task Service
-   Pipeline Service
-   Approval Service
-   Artifact Service
-   Usage Service

### 3.3 Orchestration Layer

-   Pipeline Validator
-   Pipeline Executor
-   Run State Machine
-   Scheduler
-   Retry / Timeout Manager
-   Approval Gate
-   Event Dispatcher

### 3.4 Integration Layer

-   Agent Adapter Registry
-   Claude Code Adapter
-   OpenAI Adapter (후속)
-   LangGraph Adapter (후속)
-   Custom Adapter
-   MCP Client / Tool Registry
-   Local Bridge Protocol
-   Webhook Ingress

### 3.5 Infrastructure Layer

-   PostgreSQL
-   Redis
-   Object Storage
-   Background Worker
-   Observability / Audit

## 4. 실행 모드

### 4.1 External Attached Mode

외부 Runtime이 실행을 소유한다. - 사용자가 Runtime을 직접 시작한다. -
Adapter 또는 Local Bridge가 관찰 가능한 이벤트를 수집한다. - HQ는 상태,
Trace, Tool 활동을 표시한다. - 제어 기능은 Runtime이 명시적으로 지원하는
경우에만 노출한다. - HQ 연결이 끊겨도 외부 Runtime 실행이 계속될 수
있다.

### 4.2 HQ Managed Mode

HQ가 실행 수명주기를 소유한다. - 사용자가 Mission 또는 Pipeline Run을
시작한다. - Orchestrator가 실행 환경을 선택한다. - Runtime Adapter가
Agent 실행을 요청한다. - 이벤트와 결과를 HQ가 수집한다. - 승인, 재시도,
취소 등은 해당 실행 엔진의 기능과 정책 범위 내에서 수행한다.

### 4.3 실행 위치

-   **Local:** Local Bridge가 사용자 장치에서 Runtime을 실행하거나
    연결한다.
-   **Cloud:** 격리된 Cloud Worker가 Runtime을 실행한다.
-   각 Agent Definition은 허용된 실행 위치 정책을 가질 수 있다.
-   Pipeline Run 시작 시 실제 선택된 실행 위치를 고정해 기록한다.

## 5. Local Bridge

Local Bridge는 사용자 장치에 설치되는 경량 프로세스다.

### 책임

-   HQ Cloud와 인증된 연결 유지
-   허용된 로컬 Runtime Adapter 실행
-   허용된 프로젝트 디렉터리 접근
-   로컬 이벤트를 공통 이벤트로 변환해 전달
-   HQ에서 온 제어 요청의 서명/권한/정책 확인
-   로컬 연결 상태 및 Adapter Capability 보고

### 비책임

-   HQ의 중앙 Workspace 권한을 독자적으로 변경하지 않는다.
-   허용되지 않은 임의 Shell 명령을 실행하지 않는다.
-   전체 파일 시스템을 기본적으로 노출하지 않는다.
-   Cloud에 Secret이나 파일 내용을 무조건 동기화하지 않는다.

### 연결

초기에는 Bridge가 Cloud에 outbound TLS 연결을 시작하는 방식을 권장한다.
NAT 및 방화벽 환경에서 inbound 포트를 열지 않아도 되는 구조를 우선한다.

### 재연결

-   지수 백오프와 jitter를 적용한다.
-   마지막 확인 Event Cursor를 보관한다.
-   재연결 후 가능한 범위에서 누락 이벤트를 재전송한다.
-   원본 Runtime에서 재수집이 불가능한 구간은 Gap으로 기록한다.
-   연결이 끊긴 동안의 상태를 임의로 추정하지 않는다.

## 6. 데이터 및 실시간 처리

### Event Ingestion

1.  Bridge 또는 Adapter가 Event를 전송한다.
2.  인증 및 Workspace/Connection 권한을 확인한다.
3.  Schema Version 및 필수 필드를 검증한다.
4.  Idempotency Key를 기준으로 중복을 처리한다.
5.  원본/정규화 Event 저장 정책에 따라 저장한다.
6.  상태 Projection을 갱신한다.
7.  Realtime Gateway에 변경을 발행한다.

### Realtime

-   WebSocket: 양방향 세션 및 실시간 구독.
-   SSE: 단방향 Event Stream이 충분한 화면에 사용 가능.
-   재연결 시 Cursor 기반 Replay를 지원한다.
-   Realtime 메시지는 영구 저장소의 대체물이 아니다.

### Queue

Redis/BullMQ는 초기 Background Job 및 실행 큐에 사용할 수 있다. 중요한
이벤트의 내구성은 Redis 큐만으로 보장한다고 가정하지 않는다. DB Outbox
또는 동등한 내구성 있는 발행 패턴을 적용한다.

## 7. 권장 기술 스택

  영역             권장안                         비고
  ---------------- ------------------------------ ------------------
  Monorepo         pnpm                           Workspace 구성
  Frontend         Next.js + TypeScript           Web App
  Backend          NestJS                         Modular Monolith
  3D               React Three Fiber + Three.js   Office
  Graph Editor     React Flow                     Pipeline Builder
  Client State     Zustand                        UI state
  Server State     TanStack Query                 API cache
  Validation       Zod                            공유 Schema
  Database         PostgreSQL                     Core data
  ORM              Prisma                         DB access
  Queue            Redis + BullMQ                 Background jobs
  Realtime         WebSocket / SSE                Live updates
  Object Storage   S3-compatible                  Artifact
  Deployment       Docker                         Local/Cloud

스택은 제안이며 구현 착수 전에 버전과 라이선스, 운영 환경을 확인한다.

## 8. Monorepo 제안

``` text
agent-hq/
├── apps/
│   ├── web/                 # Next.js
│   ├── api/                 # NestJS
│   ├── bridge/              # Local Bridge
│   └── worker/              # Background / execution workers
├── packages/
│   ├── domain/              # Domain entities and rules
│   ├── contracts/           # API and event contracts
│   ├── events/              # Event schemas and normalization
│   ├── adapters/            # Runtime adapter interfaces
│   ├── adapter-claude-code/ # First adapter
│   ├── orchestrator/        # Pipeline engine
│   ├── mcp/                 # MCP integration
│   ├── database/            # Prisma schema and repositories
│   ├── ui/                  # Shared UI
│   └── visual-office/       # 3D scene and interactions
├── infrastructure/
│   ├── docker/
│   └── local/
├── docs/
└── package.json
```

초기에는 `worker`를 별도 앱으로 분리하지 않고 API 프로세스와 함께
실행해도 된다. 다만 모듈 경계는 처음부터 분리한다.

## 9. API 경계

초기 REST API 후보: - `POST /workspaces` - `GET /workspaces/:id` -
`POST /connections` - `POST /connections/:id/heartbeat` -
`POST /events:ingest` - `GET /missions` - `POST /missions` -
`GET /missions/:id` - `POST /pipeline-definitions` -
`POST /pipeline-runs` - `GET /pipeline-runs/:id` -
`POST /approvals/:id/resolve` - `GET /events`

실제 API path, 인증 방식, pagination, error envelope는 API 계약 단계에서
확정한다.

## 10. 장애 및 복구 원칙

-   Cloud 연결 장애는 Local Runtime의 실행을 자동 중단시키지 않는다. 단,
    정책상 Cloud 승인이 필수인 작업은 승인 없이 진행하지 않는다.
-   이벤트 전송 실패는 로컬 버퍼에 제한적으로 보관하고 재전송한다.
-   버퍼 용량 및 보존 기간은 설정 가능해야 한다.
-   중복 이벤트는 Idempotency로 처리한다.
-   이벤트 순서가 바뀔 수 있음을 고려한다.
-   Runtime 상태와 HQ Projection이 불일치하면 Reconciliation을 수행한다.
-   Reconciliation으로 확인할 수 없는 상태는 Unknown으로 표시한다.

## 11. Open Decisions

-   Cloud hosting provider 및 Region
-   Local Bridge 설치 방식 및 자동 업데이트
-   Managed Runtime 격리 기술
-   Event volume에 따른 DB partitioning
-   Redis 외 Event Streaming 도입 시점
-   Multi-tenant deployment model
-   Cloud와 Local의 offline conflict resolution 세부 정책

---

## 통합 노트 (Agent HQ, 2026-11-22)

### N1. 기술 스택 (§7 대체)
§7 표는 명세서의 권장안이다. 실제 결정은 [ADR-0003](../decisions/ADR-0003-m1-tech-stack.md)을 따른다. Redis는 MVP에서 로컬 Compose로 실행한다 (ADR-0005). §6 Queue 원칙대로 Redis는 Event 내구성의 근거가 아니다. Object Storage(Artifact)는 MVP 범위가 아니다. 요약: TypeScript 6.0.x, Node 26 LTS, pnpm workspace, NestJS 12 + Fastify, Next.js 16, PostgreSQL, Prisma 7.10.x 고정, Zod, SSE + REST, **Redis + BullMQ**([ADR-0005](../decisions/ADR-0005-adopt-redis-bullmq.md) — Background Job·주기 작업용이며 Event 내구성은 PostgreSQL이 보장). Zustand, TanStack Query, R3F, React Flow는 해당 Phase에서 확정한다.

### N2. MVP 배포 형태
```text
[사용자 머신]
  Claude Code ──hook──▶ Local Bridge ──HTTP(localhost)──▶ API (NestJS) ──▶ PostgreSQL
  Simulator ────────────────────────HTTP(localhost)──▶      │
  Browser ◀──── Web (Next.js) ◀──── REST + SSE ─────────────┘
  (PostgreSQL·Redis는 Docker Compose. API는 BullMQ로 Redis 사용. Web은 개발 서버 또는 Compose)
```
- Cloud API(§2의 Cloud 노드)는 MVP에서 **로컬에서 실행하는 같은 API**로 대체한다. Bridge→API 연결을 TLS로 할지는 로컬에서는 선택 사항이며, Cloud 배포 시 필수다.
- §2·§5의 "Cloud API"와 "HQ Cloud"는 MVP에서 **로컬에서 실행하는 API**를 뜻한다.
- 외부 노출 방지: 컨테이너 안의 API는 `0.0.0.0`에 바인딩하되 Compose에서 `127.0.0.1:PORT:PORT`로만 publish한다. 호스트에서 직접 실행하는 프로세스(Web 개발 서버, Bridge)는 `127.0.0.1`에 바인딩한다. API는 Host/Origin을 검증한다 ([RSK-005](../operations/risks.md)).

### N3. Monorepo (§8 채택, 단계적 생성)
§8 구조를 채택한다. HQ-003에서는 Phase 0~1에 필요한 것만 만든다: `apps/api`, `apps/web`, `packages/domain`, `packages/contracts`, `packages/events`, `packages/database`, 그리고 테스트 Source용 `packages/simulator`(§8에 없음, 추가 제안). `apps/bridge`, `packages/adapters`, `packages/adapter-claude-code`는 Phase 2, `packages/visual-office`는 Phase 4, `packages/orchestrator`·`apps/worker`는 Phase 5에서 만든다.
의존 방향 규칙은 [coding-standards §4](../engineering/coding-standards.md#4-디렉터리-구조와-의존-방향)에 둔다.

### N4. 추가 원칙
- **비침투적 관찰**: Claude Code hook과 Bridge가 실패해도 관찰 대상 Agent의 실행을 막지 않는다. hook은 짧은 timeout을 두고, 실패하면 무시하고 Outbox에 쌓는다 (NFR-008).
- **hook → Bridge 로컬 구간 인증**: 같은 머신의 다른 프로세스가 가짜 Event를 주입하지 못하게 한다. 소유자만 접근 가능한 로컬 소켓이나 로컬 토큰을 쓴다 ([RES-007 S2](../research/RES-007-chatgpt-spec-review.md), [RSK-016](../operations/risks.md)).
- **시뮬레이터**: Adapter와 같은 Ingestion API를 Connection 토큰으로 호출하는 테스트용 Source다 (`source.adapterId = "simulator"`). 운영 데이터와 섞이지 않도록 별도 Workspace나 Connection을 쓴다.

### N5. Open Questions
- Web(Next.js)을 Compose에 넣을지, 개발 서버로만 실행할지 (HQ-003)
- §9 API path와 error envelope는 HQ-105·HQ-107에서 계약으로 확정한다

### N6. API 계약 — Ingestion (HQ-105, 2026-11-24)
§9의 `POST /events:ingest` 후보를 다음으로 확정한다. 스키마의 단일 원천은 `packages/contracts/src/ingestion/`이다.
- **경로**: `POST /events`. 단건도 배치로 보낸다. body는 `{ "events": [ ... ] }`이고 이벤트는 1~500개(`INGEST_LIMITS.maxBatchEvents`)다. 인증은 `Authorization: Bearer <connection token>`이다.
- **배치는 원자적**이다. 전부 저장(또는 중복 인식)되거나 아무것도 저장되지 않는다. Source는 거부된 배치를 고쳐서 다시 보내거나, 응답의 `issues[].path`(`events.<index>.…`)가 가리키는 이벤트를 빼고 보낸다. 같은 배치를 다시 보내도 안전하다(멱등).
- **처리 순서**: Fastify 라우팅과 body 파싱(없는 경로 404, JSON 아님 415, 깨진 JSON 400, 4 MiB 초과 413) → Host/Origin 검사(전역 Guard) → 토큰 인증 → body 형태 → 이벤트 수 상한 → Connection별 rate limit → 이벤트별 크기·Unicode·계약 검증 → `workspaceId`·`connectionId` 대조 → 2차 마스킹 → 한 트랜잭션에서 외부 ID 매핑·append(Outbox 포함)·Projection 적용. 파싱 단계의 오류는 Guard보다 먼저 나지만 고정 메시지만 돌려주고 아무것도 저장하지 않는다.
- **rate limit은 검증보다 먼저 차감한다.** 거부된 배치(400·403·409)도 예산을 쓴다. 폭주하는 Source는 내용과 상관없이 막아야 하기 때문이다 (T8).
- **2차 마스킹 범위**는 payload 안의 문자열이다(data-governance N2). `correlationId`·`idempotencyKey`·`source.*` 같은 ID는 그대로 저장한다(길이 256 이하, 제어 문자 금지). 마스킹한 문자열은 `[REDACTED:<종류>]`로 바뀌므로 원래 길이 상한(500자)을 넘을 수 있다. 저장본을 다시 검증하는 경로가 생기면 이를 고려한다(TD-004). 패턴은 완전하지 않다(RSK-002).
- **마스킹 패턴을 바꾸면** 바꾸기 전에 저장된 이벤트를 Source가 다시 보낼 때 내용 해시가 달라져 409가 날 수 있다. 패턴 변경은 changelog에 기록한다.
- **응답 200**: `{ results: [{ idempotencyKey, status: "stored" | "duplicate", storeSequence, ignoredFields, redactedFields }] }`. 요청 순서대로이고, `storeSequence`는 10진 문자열이다. `ignoredFields`·`redactedFields`에는 필드 이름만 들어간다.
- **오류** (envelope `{ error: { code, message, issues? } }`):

| HTTP | code | 언제 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | body 형태 오류, 이벤트 계약 위반, 이벤트 하나가 64 KiB 초과, 짝 없는 서로게이트 같은 잘못된 Unicode |
| 401 | `AUTHENTICATION_FAILED` | 토큰 없음·무효·폐기·만료 (구분하지 않음) |
| 403 | `FORBIDDEN` | 허용되지 않은 Host·Origin, body의 `workspaceId`·`connectionId`가 토큰과 다름 |
| 409 | `CONFLICT` | 같은 idempotencyKey로 내용이 다른 이벤트가 이미 저장됨, 또는 `id` 중복 |
| 413 | `PAYLOAD_TOO_LARGE` | 이벤트 500개 초과, 요청 body 4 MiB 초과 |
| 429 | `RATE_LIMITED` | Connection별 이벤트 수 한도 초과. `Retry-After`(초) 헤더를 준다 |

- **Host/Origin** (security T3): Host는 loopback 이름(`127.0.0.1`, `localhost`, `::1`)과 `API_ALLOWED_HOSTS`만 허용한다. `Origin` 헤더가 있으면 `API_ALLOWED_ORIGINS`에 정확히 있어야 한다. 기본값은 빈 목록이라 브라우저 요청은 모두 거부된다. 모든 경로에 적용되므로, Web UI가 브라우저에서 API를 직접 부르게 되면(HQ-109) 그 Origin을 설정에 추가해야 한다.
- **Rate limit** (security T8): Connection마다 token bucket을 두고 이벤트 수로 센다. 기본값은 초당 500개, 최대 burst 2000개다(`INGEST_RATE_*`). API 프로세스 메모리에 있으므로 프로세스가 하나일 때만 정확하다 (TD-006).
