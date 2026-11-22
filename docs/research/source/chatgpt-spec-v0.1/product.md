# Product Definition

## 1. 제품 개요

**Agent HQ**는 사용자가 다양한 AI 에이전트를 하나의 조직처럼 구성하고,
실행하고, 관찰하고, 통제할 수 있도록 돕는 Agent Operations Platform이다.

사용자는 외부 에이전트 런타임을 연결하거나 HQ가 관리하는 실행 환경에서
에이전트를 실행할 수 있다. Agent HQ는 서로 다른 런타임의 상태와 활동을
공통 도메인 및 이벤트 모델로 정규화해 Dashboard와 3D Office에 표현한다.

### 제품 한 문장

> 다양한 AI 에이전트의 실행과 협업을 하나의 공간에서 구성·관찰·통제하는
> 범용 운영 플랫폼.

## 2. 해결할 문제

### 2.1 관찰의 단절

에이전트가 실행 중인지, 어떤 작업을 하는지, 어떤 도구를 호출했는지
정보가 터미널·로그·개별 서비스에 흩어져 있다.

### 2.2 협업 흐름의 불투명성

Main Agent, Worker, Reviewer 등 여러 에이전트가 존재해도 역할, 부모-자식
관계, 작업 전달 및 검증 흐름을 한눈에 파악하기 어렵다.

### 2.3 운영 제어의 부족

실패, 승인 대기, 비용 한도 초과, 장시간 정체 상황에서 사용자가 적절한
시점에 개입하기 어렵다.

### 2.4 구성의 반복

프로젝트마다 Agent 역할, Tool 권한, Pipeline 규칙을 반복적으로 설정해야
한다.

### 2.5 런타임 종속성

특정 SDK나 프레임워크에 의존하면 다른 런타임을 도입할 때 관제 및 운영
체계를 다시 구축해야 한다.

## 3. 제품 원칙

1.  **Runtime agnostic:** 공통 Core는 특정 LLM 또는 Agent Framework에
    종속되지 않는다.
2.  **Observe before control:** 우선 정확한 관찰과 기록을 보장하고,
    제어는 Runtime Capability가 확인된 범위에서만 제공한다.
3.  **Human authority:** 사용자가 정한 권한·승인·비용·데이터 정책이
    에이전트의 요청보다 우선한다.
4.  **Local autonomy:** 로컬 실행과 데이터가 Cloud 연결 없이도 가능한
    범위를 명시한다.
5.  **Data choice:** 사용자가 데이터 유형별 저장 위치와 동기화 범위를
    선택한다.
6.  **One source of truth:** Dashboard와 3D Office는 동일한 도메인 및
    이벤트 상태를 사용한다.
7.  **Truthful visualization:** 알 수 없는 상태는 Unknown/Unobserved로
    표현한다.
8.  **Progressive complexity:** Easy Mode와 Developer Mode는 같은 Core를
    사용하되 노출하는 설정의 복잡도를 달리한다.

## 4. 대상 사용자

### 4.1 AI 개발자 및 개발팀

-   Claude Code, OpenAI Agents SDK, LangGraph 또는 자체 Agent를
    사용한다.
-   런타임별 실행 내역을 한 곳에서 확인하고 싶다.
-   Tool 호출, Trace, 오류, 비용, 권한을 추적하고 싶다.
-   파이프라인을 직접 구성하고 테스트하고 싶다.

### 4.2 비개발자 및 일반 사용자

-   코드를 작성하지 않고 목적 중심으로 에이전트를 사용하고 싶다.
-   미리 준비된 Agent Template과 Pipeline을 선택하고 싶다.
-   진행 상황과 결과물을 이해하기 쉬운 방식으로 확인하고 싶다.
-   위험하거나 비용이 발생하는 작업은 직접 승인하고 싶다.

### 4.3 팀 운영자

-   Workspace 내 사용자, Agent, 프로젝트, 정책을 관리한다.
-   누가 어떤 실행을 시작하고 승인했는지 확인한다.
-   팀 단위 비용, 권한, 감사 기록을 관리한다.

## 5. 핵심 제품 영역

### 5.1 Office

에이전트와 작업 현장을 시각적으로 보여주는 3D 공간이다. - Agent 캐릭터와
업무 공간 - 실제 상태에 따른 캐릭터/공간 표현 - Mission과 Task의 진행
상태 - 에이전트 간 관계 및 메시지 흐름 - Agent 상세 화면으로 진입

3D Office는 장식용 게임이 아니다. 모든 상태 표현은 실제 Event 또는
명시적인 추정 상태에 근거해야 한다.

### 5.2 Studio

Agent와 Pipeline을 생성·구성하는 영역이다. - Agent Definition 및
Template - Adapter 및 Runtime 연결 - MCP Server / Tool 관리 - Pipeline
Builder - 권한, 승인, 재시도, 비용 정책 - 테스트 및 버전 관리

### 5.3 Operations

실행을 관찰하고 관리하는 영역이다. - Mission / Task 목록과 상세 - 실시간
Activity Timeline - Agent 상태와 실행 관계 - Trace 및 Tool 호출 기록 -
Approval Inbox - 오류 및 재시도 - 사용량 및 비용

### 5.4 Projects

업무 결과와 실행 맥락을 관리하는 영역이다. - 프로젝트별 Mission 및
Pipeline - 실행 이력 - Artifact - Pipeline Template - 프로젝트 지침 및
정책

## 6. 사용자 모드

### Easy Mode

-   자연어 Mission 입력
-   추천 Agent / Pipeline Template
-   기본 권한 및 안전 정책
-   읽기 쉬운 진행 상태
-   결과물 중심 화면
-   필요한 시점에 명확한 승인 요청

### Developer Mode

-   Adapter / Runtime 세부 설정
-   모델 및 프롬프트 설정
-   Tool Allowlist
-   입력/출력 Schema
-   Pipeline 조건과 분기
-   Trace, Raw Event, 로그
-   Local Bridge 및 API 설정
-   고급 보안 정책

모드는 UI 표현의 차이다. 별도 데이터 모델이나 별도 실행 엔진을 만들지
않는다.

## 7. 기능 요구사항

### P0 --- MVP 필수

-   Workspace 및 Project 생성
-   Agent Definition / Instance 조회
-   Claude Code 연결을 위한 첫 Adapter
-   Local Bridge의 인증된 연결
-   Agent / Task / Tool 이벤트 수집
-   공통 Event 저장 및 조회
-   실시간 Dashboard 업데이트
-   Mission 및 Task 타임라인
-   Agent 상태의 Unknown 처리
-   기본 3D Office에서 실제 이벤트 반영
-   데이터 저장 위치 정책의 최소 모델
-   Adapter Capability 표시
-   연결 끊김 및 재연결 상태 표시

### P1 --- MVP 이후

-   Pipeline Builder 및 Pipeline Version
-   HQ 관리 Local/Cloud 실행
-   Approval Inbox와 정책 기반 승인
-   지원되는 Runtime의 Pause/Resume/Cancel
-   MCP Server 관리 및 Tool 관찰
-   Artifact 관리
-   비용 및 Token Usage 분석
-   OpenAI Agents SDK Adapter
-   팀 Workspace 및 역할 기반 접근 제어

### P2 --- 확장

-   LangGraph Adapter
-   Custom Adapter SDK
-   Pipeline / Agent Template 공유
-   Marketplace
-   고급 분석 및 성능 비교
-   팀 정책과 조직 관리
-   Office 커스터마이징 및 게임 요소 확장

## 8. 비기능 요구사항

-   **정확성:** 관찰된 상태와 추정 상태를 구분한다.
-   **복구성:** 연결 중단 후 이벤트 재수집 또는 상태 재조정 경로를
    제공한다.
-   **보안:** Secret과 민감한 Tool 인자를 기본적으로 마스킹한다.
-   **확장성:** Adapter 추가가 Core 도메인 변경을 최소화하도록 설계한다.
-   **성능:** 이벤트 수집과 3D 렌더링을 분리한다.
-   **접근성:** 핵심 상태를 색상과 애니메이션만으로 전달하지 않는다.
-   **이식성:** Local 및 Cloud 실행 환경을 지원한다.
-   **감사 가능성:** 승인과 제어 명령의 행위자·시각·결과를 기록한다.

## 9. 성공 지표 후보

초기 제품 지표는 다음과 같이 정의할 수 있다. 목표 수치는 실제 사용
데이터를 확보한 뒤 결정한다.

-   Runtime 연결 성공률
-   Event 수집 지연 및 누락률
-   Agent 상태 정합성
-   Mission 완료율
-   Pipeline 실패 및 재시도율
-   Approval 응답 시간
-   사용자당 관리 Agent 수
-   주간 활성 Workspace
-   데이터 동기화 실패율
-   3D Office와 Dashboard의 상태 일치율

## 10. 제품 범위에서 제외할 것

초기 버전은 다음을 목표로 하지 않는다. - 모든 Agent Framework의 완전한
기능 동등성 - 모든 외부 Runtime의 강제 일시정지/취소 - 완전 자동화된
무인 Agent 조직 - Agent Marketplace 및 결제 - 고급 멀티테넌트
엔터프라이즈 기능 - 게임 수준의 복잡한 시뮬레이션 - 모든 MCP 서버의
무제한 프록시/중계

## 11. 미결정 사항

-   개인/팀 계정의 구체적인 요금제
-   Cloud 제공 인프라 및 리전
-   데이터 보존 기본 기간
-   3D Office의 기본 카메라/아트 스타일
-   사용자 초대 및 조직 권한 세분화
-   Marketplace의 공개 범위 및 검수 정책
