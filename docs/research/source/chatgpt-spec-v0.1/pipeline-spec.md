# Pipeline Specification

## 1. 목적

Pipeline은 여러 Agent와 Task를 연결해 Mission을 수행하는 실행 설계다.
Pipeline Definition과 실제 실행인 Pipeline Run을 구분한다.

## 2. 핵심 개념

-   **Pipeline Definition:** 편집 가능한 논리 그래프.
-   **Pipeline Version:** 실행 시점에 고정되는 불변 버전.
-   **Node:** Agent 실행, Tool 호출, 조건 분기, 승인, 데이터 변환 등
    단계.
-   **Edge:** 노드 간 데이터 및 제어 흐름.
-   **Pipeline Run:** Pipeline Version의 한 번의 실행.
-   **Node Run:** 개별 Node의 실행 인스턴스.
-   **Checkpoint:** 중단 후 재개에 필요한 저장 상태.

## 3. Node Type 후보

P0/P1 구현 범위를 구분한다.

  Node Type   설명                 우선순위
  ----------- -------------------- ----------
  Agent       지정 Agent 실행      P1
  Task        작업 생성/분배       P1
  Condition   조건 분기            P1
  Approval    사람 승인 대기       P1
  Tool        허용된 Tool 실행     P1
  Transform   데이터 변환          P2
  Parallel    병렬 분기            P2
  Join        병렬 결과 결합       P2
  Delay       지정 조건까지 대기   P2
  Trigger     외부 이벤트 시작     P2

MVP에서는 Pipeline Builder를 완성하기 전에 Event 기반으로 외부 Agent
실행을 관찰할 수 있어야 한다.

## 4. Pipeline Graph

각 Node는 고유 ID, 타입, 설정, Input/Output Schema를 가진다. Edge는
Source/Target Port와 조건을 가진다.

``` ts
type PipelineNode = {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  inputSchema?: object;
  outputSchema?: object;
  executionPolicy?: object;
};

type PipelineEdge = {
  id: string;
  sourceNodeId: string;
  sourcePort?: string;
  targetNodeId: string;
  targetPort?: string;
  condition?: object;
};
```

## 5. Validation

실행 전에 다음을 검증한다. - 시작 노드가 존재한다. - 도달 불가능한
노드가 있는지 검사한다. - 필수 Input이 연결되었는지 검사한다. -
Output/Target Input Schema가 호환되는지 검사한다. - 순환 참조는 허용된
Loop Node가 아닌 이상 거부한다. - Agent Definition과 Adapter가 존재하고
활성 상태인지 검사한다. - Tool 및 권한 정책이 유효한지 검사한다. - 실행
위치가 정책상 허용되는지 검사한다. - Timeout, Retry, 비용 제한이
유효한지 검사한다.

Validation 결과는 Warning과 Error를 구분한다. Error가 있으면 실행을
막는다.

## 6. Run State Machine

``` mermaid
stateDiagram-v2
  [*] --> queued
  queued --> running
  running --> waiting
  waiting --> running
  running --> succeeded
  running --> failed
  running --> cancelled
  waiting --> failed
  waiting --> cancelled
  failed --> queued: manual retry / policy retry
  succeeded --> [*]
  cancelled --> [*]
```

추가 상태: - `paused`: Runtime이 실제 Pause를 지원하고 일시정지가 확인된
경우만 사용. - `partially_completed`: 일부 독립 노드는 성공했으나 전체
Run은 완결되지 않은 경우. - `unknown`: 상태를 확인할 수 없는 경우.

`waiting`은 Approval, External Runtime, Resource 등 원인을 구분하는
`waitingReason`을 포함한다.

## 7. 실행 정책

### Retry

-   Node별 최대 시도 횟수
-   재시도 대상 오류 코드
-   Backoff
-   재시도 가능 여부
-   재시도 전 Approval 필요 여부

멱등성이 보장되지 않는 Tool/Node는 자동 재시도를 기본 허용하지 않는다.

### Timeout

-   Node Timeout
-   Pipeline Run Timeout
-   Approval Expiration
-   External Runtime Response Timeout

Timeout은 취소 성공과 동일하지 않다. Timeout 이후 Runtime이 실제
중단됐는지 확인할 수 없으면 `unknown` 또는 `termination_pending`으로
표현한다.

### Concurrency

-   Workspace별 동시 Run 제한
-   Pipeline별 동시 Node 제한
-   Agent별 동시 실행 제한
-   Tool별 Rate Limit

### Approval

-   Node 실행 전 승인
-   위험 Tool 실행 전 승인
-   외부 데이터 전송 전 승인
-   비용 한도 초과 시 승인

## 8. Data Passing

Node 간 데이터 전달은 명시적인 Input/Output Contract로 수행한다. - 큰
파일은 Event payload에 넣지 않고 Artifact Reference를 전달한다. -
Secret은 일반 JSON Input에 직접 포함하지 않고 Secret Reference를
전달한다. - Output Schema 검증에 실패하면 Node 실패로 처리한다. - 원본
입력 및 결과 저장은 Data Policy를 따른다.

## 9. Versioning 및 실행 재현성

-   Pipeline Version은 실행 후 수정할 수 없다.
-   Run은 Pipeline Version ID와 Policy Snapshot을 기록한다.
-   Agent Definition 및 Tool Policy의 실행 시점 버전을 기록한다.
-   재실행은 기존 Run을 덮어쓰지 않고 새 Run을 생성한다.
-   결과 재현이 불가능한 외부 의존성은 Run Metadata에 기록한다.

## 10. 외부 Agent와 Pipeline

외부 Runtime에서 자체적으로 조율되는 흐름은 HQ Pipeline이 직접 실행한
것과 구분한다. - `executionOwnership: external | hq` - 외부 흐름은 관찰
가능한 범위만 Trace로 구성한다. - HQ가 직접 관리하지 않는 하위 Task에
대해 제어 가능하다고 표시하지 않는다. - 외부 Runtime의 결과를 Pipeline
Node Output으로 연결하려면 Adapter가 명시적 Mapping을 제공해야 한다.

## 11. MVP 이후 구현 순서

1.  Pipeline Definition 데이터 모델
2.  Validation
3.  직렬 Agent Node 실행
4.  Approval Node
5.  Condition Node
6.  Retry 및 Timeout
7.  Parallel / Join
8.  Checkpoint / Resume
9.  Visual Builder 고도화
