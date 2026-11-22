# Domain Model

## 1. 설계 원칙

도메인 모델은 실행 Runtime의 내부 구조를 그대로 복제하지 않는다. 여러
Runtime의 차이를 수용할 수 있는 공통 개념을 제공하되, 원본 Runtime
식별자와 원본 데이터를 필요에 따라 보존한다.

## 2. 핵심 엔티티

### Workspace

사용자 또는 팀의 최상위 작업 공간. - id - name - ownerId - plan (TBD) -
settings - createdAt

### WorkspaceMember

Workspace에 접근하는 사용자 및 역할. - workspaceId - userId - role -
status

### Project

관련 Mission, Agent, Pipeline 및 Artifact를 묶는 단위. - id -
workspaceId - name - description - settings

### AgentDefinition

재사용 가능한 에이전트 설정. - id - workspaceId - name - role -
instructionsRef - modelPreference - toolPolicy - permissionPolicy -
executionPolicy - inputSchema - outputSchema - version

### AgentInstance

실제 Runtime에 연결되거나 실행된 에이전트 인스턴스. - id -
agentDefinitionId (optional) - projectId - connectionId - runtime -
externalAgentId - parentAgentInstanceId - observedStatus - lastSeenAt -
capabilitiesSnapshot

Agent Definition과 Instance를 구분한다. 하나의 정의에서 여러 실행
인스턴스가 만들어질 수 있다.

### AgentConnection

Runtime 또는 Bridge와의 연결. - id - workspaceId - adapterId -
runtimeType - executionLocation - bridgeId (optional) - status -
capabilities - lastHeartbeatAt

### Mission

사용자가 달성하려는 상위 목표. - id - projectId - title - objective -
createdBy - status - executionMode - dataPolicySnapshot - createdAt

### Task

Mission 내 개별 작업. - id - missionId - parentTaskId (optional) -
assignedAgentDefinitionId / assignedAgentInstanceId - title -
description - status - inputRef - outputRef - dependencyPolicy

### PipelineDefinition

재사용 가능한 Pipeline 설계. - id - projectId - name - description -
latestVersionId

### PipelineVersion

불변 Pipeline 설계 버전. - id - pipelineDefinitionId - version - graph -
validationResult - createdAt

### PipelineRun

특정 Pipeline Version의 실행. - id - pipelineVersionId - missionId -
status - executionLocation - policySnapshot - startedAt - completedAt

### NodeRun

Pipeline 내 노드의 한 번의 실행. - id - pipelineRunId - nodeId -
attempt - status - inputRef - outputRef - startedAt - completedAt

### Event

관찰 또는 실행 과정에서 발생한 사실. - id - workspaceId - projectId -
missionId - pipelineRunId - taskId - agentInstanceId - eventType -
source - occurredAt - receivedAt - payload - correlationId -
idempotencyKey

### ToolServer / ToolDefinition

외부 Tool 제공자와 그 Tool 목록. - ToolServer: 연결, 전송 방식, 인증
참조, 상태 - ToolDefinition: 이름, 설명, input schema, 위험 분류

### Approval

사람 또는 정책 엔진의 승인 결정. - id - workspaceId - requester -
subjectType - subjectId - action - contextRef - status - decidedBy -
decidedAt - expiresAt

### Artifact

실행 결과로 생성된 파일 또는 외부 결과물 참조. - id - workspaceId -
projectId - missionId - taskId - type - storageLocation - uri /
objectKey - checksum - metadata - sensitivity

### UsageRecord

토큰, 비용, 실행 시간 등의 사용량. - id - runId - agentInstanceId -
provider - metricType - quantity - unit - sourceType (reported /
estimated) - occurredAt

## 3. 관계

``` mermaid
erDiagram
  WORKSPACE ||--o{ PROJECT : contains
  WORKSPACE ||--o{ AGENT_DEFINITION : defines
  WORKSPACE ||--o{ AGENT_CONNECTION : connects
  PROJECT ||--o{ MISSION : contains
  PROJECT ||--o{ PIPELINE_DEFINITION : owns
  AGENT_DEFINITION ||--o{ AGENT_INSTANCE : instantiates
  AGENT_CONNECTION ||--o{ AGENT_INSTANCE : hosts
  MISSION ||--o{ TASK : contains
  PIPELINE_DEFINITION ||--o{ PIPELINE_VERSION : versions
  PIPELINE_VERSION ||--o{ PIPELINE_RUN : executes
  PIPELINE_RUN ||--o{ NODE_RUN : contains
  TASK ||--o{ EVENT : produces
  AGENT_INSTANCE ||--o{ EVENT : produces
  MISSION ||--o{ ARTIFACT : generates
  WORKSPACE ||--o{ APPROVAL : governs
```

## 4. 상태 모델

### Agent observed status

-   `connected`
-   `working`
-   `waiting`
-   `idle`
-   `failed`
-   `disconnected`
-   `unknown`

상태는 Adapter가 보고한 원본 상태와 HQ가 정규화한 상태를 함께 보존한다.
오래된 heartbeat 또는 누락된 이벤트가 있을 때 임의로 `idle` 처리하지
않는다.

### Task status

-   `draft`
-   `queued`
-   `running`
-   `waiting_approval`
-   `waiting_external`
-   `succeeded`
-   `failed`
-   `cancelled`
-   `skipped`
-   `unknown`

### Mission status

-   `draft`
-   `queued`
-   `running`
-   `waiting`
-   `succeeded`
-   `failed`
-   `cancelled`
-   `partially_completed`

### Connection status

-   `pending`
-   `connected`
-   `degraded`
-   `disconnected`
-   `error`

## 5. 외부 ID 매핑

외부 Runtime의 ID를 HQ 내부 ID로 대체하지 않는다. 다음 매핑을
보존한다. - provider/runtime - externalSessionId - externalAgentId -
externalTaskId - externalToolCallId

외부 ID는 Workspace 및 Connection 범위에서 유일성을 보장한다.

## 6. 데이터 정합성 원칙

-   Pipeline Version은 생성 후 불변이다.
-   Run은 시작 시점의 Pipeline Version과 정책 Snapshot을 참조한다.
-   Agent Definition 변경이 이미 실행 중인 Agent Instance 설정을 소급
    변경하지 않는다.
-   Event는 append-only를 기본으로 한다.
-   상태 테이블은 Event로부터 재구성 가능한 Projection으로 취급한다.
-   Artifact의 실제 바이너리와 DB 메타데이터를 구분한다.
-   삭제 정책은 데이터 유형과 저장 위치에 따라 적용한다.

## 7. 미결정 사항

-   Mission이 Pipeline 없이 직접 Task를 실행하는 모델의 상세 범위
-   Agent Definition의 버전 및 상속 정책
-   Team Role의 세부 권한
-   Artifact versioning
-   UsageRecord 정산 단위와 Provider별 비용 정규화
