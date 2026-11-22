# UI / UX Specification

## 1. UX 방향

Agent HQ는 전문 운영 도구와 게임형 업무 공간을 결합한다. 시각적 재미는
실제 운영 정보의 정확성을 보조해야 하며, 핵심 정보를 가리거나 사실과
다른 상태를 연출해서는 안 된다.

### UX 목표

-   한눈에 현재 Mission과 Agent 상태를 파악한다.
-   Agent 간 작업 관계와 Tool 흐름을 확인한다.
-   필요한 순간에 실행에 개입한다.
-   개발자는 세부 Trace와 설정에 접근한다.
-   비개발자는 목적과 결과 중심으로 사용한다.

## 2. Global Navigation

-   Office
-   Studio
-   Operations
-   Projects
-   Settings

Workspace / Project Switcher는 전역에서 접근 가능해야 한다.

## 3. Office --- 3D Workspace

### 화면 영역

-   중앙: 3D Office Scene
-   좌측: Agent Roster
-   우측: Selected Agent / Active Mission Detail
-   상단: Workspace Metrics
-   하단: Activity Timeline / Event Feed

### Agent 표현

Agent는 다음 상태를 시각적으로 구분한다. - Working - Idle - Waiting -
Reviewing - Failed - Disconnected - Unknown

색상만으로 상태를 구분하지 않는다. 아이콘, 텍스트, 애니메이션을 함께
사용한다.

### 상호작용

-   Agent 선택: 상세 패널 열기
-   Mission 선택: Mission 상세 및 Task Graph 표시
-   Tool 호출: 해당 Tool 또는 Server와 연결된 활동 표시
-   Approval: 승인 대기 표시 및 Operations로 이동
-   Event 클릭: Dashboard Trace의 해당 이벤트로 이동

### Truthful Animation

-   캐릭터의 이동/작업 애니메이션은 Event 기반 상태에 연결한다.
-   Event가 없는 동안 임의로 작업 중인 것처럼 표현하지 않는다.
-   오래된 Event는 Stale 상태로 표시한다.
-   Unknown은 Idle과 다른 모습으로 표시한다.
-   시각적 애니메이션이 실행 상태의 증거인 것처럼 오해되지 않게 한다.

## 4. Dashboard / Operations

### Overview

-   Active Missions
-   Active Agents
-   Waiting Approvals
-   Failed Tasks
-   Connection Health
-   Usage Summary

### Agent Detail

-   역할 및 Runtime
-   현재 상태
-   Parent / Child 관계
-   현재 Mission / Task
-   Tool Activity
-   Event Timeline
-   Capability
-   Connection Health

### Mission Detail

-   Objective
-   Pipeline / Task Graph
-   Agent Assignment
-   Progress
-   Event Timeline
-   Artifacts
-   Approvals
-   Run History

### Trace View

-   Agent / Task / Tool Span
-   Parent-child 관계
-   시작/종료 시각
-   Duration
-   Status
-   Raw Event 접근(Developer Mode)
-   누락 구간 표시

### Approval Inbox

-   요청 Action
-   요청 Agent
-   대상 Resource
-   위험 등급
-   전달 데이터 요약
-   Approve / Reject
-   만료 시각

## 5. Studio

### Agent Builder

-   Name / Role
-   Instructions
-   Model Preference
-   Runtime
-   Execution Location
-   Input / Output Schema
-   Tool Permissions
-   Budget / Timeout
-   Approval Policy

### Pipeline Builder

-   Node Canvas
-   Node Inspector
-   Input / Output Mapping
-   Edge / Condition Editor
-   Validation Panel
-   Version History
-   Test Run

### Connection Manager

-   Runtime Adapter
-   Local Bridge
-   MCP Server
-   Webhook
-   Connection Health
-   Capability List

## 6. Easy Mode vs Developer Mode

  영역       Easy Mode            Developer Mode
  ---------- -------------------- ---------------------
  Agent      Template 선택        상세 설정
  Pipeline   추천 흐름            Node/Edge 편집
  Tool       카테고리별 선택      개별 Tool 정책
  Event      요약 Timeline        Raw Event / Trace
  Runtime    간편 연결            Adapter/Bridge 설정
  Approval   이해하기 쉬운 설명   상세 Input/Policy
  Error      해결 가이드          Stack / Raw Error

## 7. Responsive Layout

-   Desktop 우선: 3D Office와 복잡한 Trace에 최적화.
-   Tablet: 3D Scene과 상세 패널을 축약.
-   Mobile: 3D는 선택적 요약, Operations 및 Approval 중심.
-   3D 렌더링이 지원되지 않는 환경에서도 Dashboard의 핵심 기능은
    동작해야 한다.

## 8. Accessibility & Performance

-   Reduced Motion 지원
-   키보드로 주요 기능 접근
-   명확한 Focus Indicator
-   색상 외 상태 식별 수단
-   3D Scene의 대체 리스트/텍스트 뷰
-   저사양 장치에서 3D 품질 조절
-   3D 렌더링과 Event Ingestion 분리
-   긴 이벤트 목록 Virtualization

## 9. Visual Direction

초기 레퍼런스 방향: - 따뜻한 목재와 유리 소재의 건축형 Office - 여러
층과 구획이 보이는 Cutaway 구조 - 작고 개성 있는 Agent 캐릭터 - 전문
Dashboard는 어두운 중립색 UI - 3D Scene은 풍부하되 정보 패널은 절제

최종 컬러, 타이포그래피, 캐릭터 스타일, 3D 아트 파이프라인은 별도 Design
System 단계에서 확정한다.

## 10. Open Decisions

-   3D Scene 카메라 및 이동 방식
-   Office Layout 편집 허용 범위
-   Agent Avatar 커스터마이징
-   Desktop App 필요 여부
-   Mobile에서 3D 지원 범위
-   다크/라이트 테마 기본값
