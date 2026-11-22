# MVP Roadmap & Delivery Plan

## 1. MVP 목표

Claude Code에서 실행되는 외부 에이전트와 Subagent의 관찰 가능한 이벤트를
Agent HQ로 전달하고, 공통 Event Model을 통해 Dashboard 및 3D Office에
실제 상태로 표현한다.

MVP의 우선순위는 **정확한 관찰 → 신뢰할 수 있는 이벤트 → 이해 가능한
시각화**다. 완전한 범용 Orchestration은 MVP의 필수 완료 조건이 아니다.

## 2. 개발 원칙

-   먼저 설계 문서와 Domain Contract를 확정한다.
-   작은 Task로 분해하고 Task별 검증 명령을 정의한다.
-   구현자와 독립 검증자를 분리한다.
-   외부 Runtime이 제공하지 않는 기능은 추정 구현하지 않는다.
-   3D는 이벤트 모델 이후 연결한다.
-   Local Bridge 보안과 데이터 정책을 초기부터 고려한다.

## 3. Phase 0 --- Foundation & Decisions

### 목표

개발에 필요한 설계 및 저장소 기반 확정.

### Tasks

-   Monorepo 초기화
-   TypeScript / lint / format / test 설정
-   Domain package
-   Event contract package
-   DB 초기 스키마
-   Local development Docker Compose
-   Architecture Decision Records 시작

### 완료 조건

-   앱과 패키지의 의존성 방향이 명시됨
-   기본 빌드 및 테스트 통과
-   Event Schema contract test 통과
-   로컬 DB migration 실행 가능

## 4. Phase 1 --- Event Ingestion Core

### 목표

공통 Event를 인증된 연결에서 수신하고 저장한다.

### Tasks

-   Event Ingestion API
-   Schema Validation
-   Idempotency
-   Connection Model
-   Event Persistence
-   State Projection
-   Realtime Subscription
-   Event Cursor / Replay

### 완료 조건

-   유효하지 않은 Event 거부
-   중복 Event 중복 저장 방지
-   수신 시각과 발생 시각 분리
-   Workspace 권한 검증
-   Reconnect 후 Cursor Replay 동작
-   Gap 및 Unknown 표시

## 5. Phase 2 --- Local Bridge & Claude Code Adapter

### 목표

사용자 로컬 Claude Code 작업에서 지원되는 이벤트를 수집한다.

### Tasks

-   Local Bridge Bootstrap
-   Device Pairing
-   Secure Connection
-   Claude Code Hook Integration
-   Event Normalization
-   Subagent Mapping
-   Tool Event Mapping
-   Local Outbox / Retry
-   Disconnect / Reconnect
-   Capability Declaration

### 완료 조건

-   연결 및 해제 확인
-   지원 Hook Event 수신
-   Agent / Session 식별
-   Tool 이벤트 매핑
-   재연결 시 중복 및 누락 처리
-   지원하지 않는 Capability를 정확히 표시
-   Secret이 로그/Event에 노출되지 않음

## 6. Phase 3 --- Operations Dashboard

### 목표

실제 Event를 이해할 수 있는 UI로 표현한다.

### Tasks

-   Workspace / Project Switcher
-   Agent Roster
-   Agent Detail
-   Mission / Task Timeline
-   Tool Activity
-   Connection Health
-   Trace View
-   Unknown / Stale State
-   Usage Summary (데이터 제공 시)

### 완료 조건

-   Event 발생 후 UI 상태 반영
-   Agent 상태와 원본 Event 추적 가능
-   연결 끊김 표현
-   이벤트 누락 구간 표현
-   Dashboard와 API 상태 일치

## 7. Phase 4 --- 3D Office

### 목표

동일한 Event Projection을 3D Office로 표현한다.

### Tasks

-   3D Scene Foundation
-   Building / Room Layout
-   Agent Avatar
-   Agent State Animation
-   Agent Selection
-   Mission Selection
-   Activity Highlight
-   Dashboard Deep Link
-   Reduced Motion / Fallback

### 완료 조건

-   실제 Event에 따라 Agent 상태 변경
-   Unknown과 Idle 구분
-   Dashboard와 동일한 상태 표시
-   3D 비활성화 시 주요 기능 유지
-   이벤트 폭주 시 렌더링이 수집 처리를 방해하지 않음

## 8. Phase 5 --- Initial Control & Pipeline

### 목표

제한된 범위에서 HQ 관리 실행과 제어를 추가한다.

### Tasks

-   Pipeline Definition / Version
-   Pipeline Validator
-   Simple Sequential Executor
-   Agent Node
-   Approval Node
-   Retry / Timeout
-   Managed Local Execution
-   Managed Cloud Execution (격리 설계 확정 후)
-   Run / NodeRun History

### 완료 조건

-   Pipeline Version 고정
-   Run 상태 전이 검증
-   승인 전 위험 작업 차단
-   지원되지 않는 제어는 노출하지 않음
-   재시도 시 새 Attempt 기록
-   Local/Cloud 실행 위치 추적

## 9. Phase 6 --- Additional Adapters

### 우선순위

1.  OpenAI Agents SDK
2.  LangGraph
3.  Custom Adapter SDK / Webhook

### 완료 조건

-   공통 Event Model 변경 없이 Adapter 추가 가능
-   Runtime Capability 표현
-   Adapter contract test 통과
-   Runtime별 제한사항 문서화

## 10. MVP Acceptance Criteria

-   Claude Code 연결 가능
-   Main Session과 Subagent를 구분 가능한 범위에서 표현
-   Tool 호출 이벤트 수집
-   Event Timeline 확인
-   Agent 상태가 실제 Event에 반응
-   3D Office와 Dashboard 상태 일치
-   Disconnect / Reconnect 처리
-   Event 중복 방지
-   Unknown / Gap 표시
-   Secret Redaction
-   Local Data Policy 적용
-   실행 제어 가능 여부를 Capability로 표시

## 11. Task Planning Template

각 Task는 다음 항목을 포함한다.

``` md
## Task ID / Title

### Goal
이 Task가 달성할 목표

### Scope
수정할 모듈과 파일 범위

### Interfaces
- Consumes:
- Produces:

### Constraints
전역 제약 및 Task 전용 제약

### Acceptance Criteria
관찰 가능한 완료 조건

### Verification
실행할 명령과 기대 결과

### Risks
Review Focus 및 미해결 위험

### Dependencies
선행 Task
```

## 12. Subagent-driven Workflow 적용

프로젝트 개발 시 역할을 분리한다. - Coordinator: 사용자 소통, 계획, Task
분배 및 결과 전달. - Worker: Task 하나 구현. - Reviewer: 읽기 전용으로
독립 검증. - Documenter: 승인된 결과를 문서화.

작업자 → 검증자 → 수정 필요 시 재작업 → 통과 후 다음 Task 순서를 따른다.
작은 변경이나 탐색 단계에는 이 절차를 강제하지 않는다.

## 13. MVP에서 측정할 것

-   Event ingestion latency
-   Event duplicate rate
-   Reconnect recovery success
-   Agent status projection correctness
-   Dashboard update latency
-   Local Bridge resource usage
-   3D frame performance
-   Event gap frequency
-   Adapter compatibility failures

초기 수치 목표는 실제 측정 후 설정한다.
