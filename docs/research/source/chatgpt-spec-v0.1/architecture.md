# System Architecture

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
