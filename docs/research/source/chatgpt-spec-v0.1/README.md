# Agent HQ --- Product & Technical Specification

**문서 버전:** 0.1.0\
**상태:** Product direction confirmed / Engineering specification draft\
**기준일:** 2026-11-20

## 1. 문서 목적

이 저장소는 Agent HQ의 제품 정의, 아키텍처, 도메인 모델, 이벤트 규격,
런타임 연동, 파이프라인 실행, 데이터 거버넌스, 보안, UX, MVP 로드맵을
정의한다. 구현자가 이 문서만으로 설계 검토와 개발 계획 수립을 시작할 수
있도록 작성했다.

아직 결정되지 않은 항목은 `TBD` 또는 `Open Decision`으로 표시한다.
명시적으로 승인되지 않은 제안은 확정 요구사항으로 간주하지 않는다.

## 2. 제품 요약

Agent HQ는 다양한 AI 에이전트 런타임을 연결하거나 자체 실행하고,
에이전트·미션·작업·도구·파이프라인을 하나의 운영 모델로 관찰하고
관리하는 Agent Operations Platform이다.

-   **Hybrid deployment:** Cloud와 Local을 함께 지원한다.
-   **Selective data residency:** 데이터 유형별 저장 위치와 동기화
    범위를 선택할 수 있다.
-   **Both execution environments:** 사용자 PC와 HQ 관리 실행 환경에서
    에이전트를 실행할 수 있다.
-   **Dual experience:** 3D Office와 전문 Dashboard를 동일한 운영 데이터
    위에 제공한다.
-   **Universal integration:** Adapter를 통해 외부 런타임을 연결하고,
    공통 Core를 통해 자체 실행도 지원한다.

## 3. 확정된 제품 방향

  -----------------------------------------------------------------------
  항목                                결정
  ----------------------------------- -----------------------------------
  제품명                              Agent HQ

  제품 유형                           Agent Operations Platform

  실행 방식                           Hybrid: 외부 런타임 연결 + HQ 자체
                                      오케스트레이션

  화면                                3D Office + 전문 Dashboard

  사용자                              개발자 + 일반 사용자

  배포                                Hybrid: Cloud + Local

  데이터 저장                         Selective: 데이터별 저장 위치 선택

  실행 환경                           Local + Cloud 모두 지원

  첫 번째 Adapter                     Claude Code

  아키텍처                            초기 Modular Monolith, 필요 시
                                      프로세스 분리

  핵심 데이터                         Workspace, Project, Agent, Mission,
                                      Task, Pipeline, Event, Artifact
  -----------------------------------------------------------------------

## 4. 문서 구성

  --------------------------------------------------------------------------------
  문서                                         내용
  -------------------------------------------- -----------------------------------
  [product.md](./product.md)                   제품 비전, 사용자, 요구사항, 범위

  [architecture.md](./architecture.md)         시스템 구성, 런타임, 통신, 배포

  [domain-model.md](./domain-model.md)         핵심 도메인과 관계

  [event-schema.md](./event-schema.md)         공통 이벤트 모델 및 수명주기

  [adapter-spec.md](./adapter-spec.md)         Agent Adapter 계약 및 런타임 연동

  [pipeline-spec.md](./pipeline-spec.md)       Pipeline 정의, 검증, 실행, 재시도

  [data-governance.md](./data-governance.md)   저장 위치, 동기화, 보존, 삭제

  [security.md](./security.md)                 인증, 권한, 비밀정보, 위협 모델

  [ui-ux.md](./ui-ux.md)                       정보 구조, 화면, 3D Office 상호작용

  [roadmap.md](./roadmap.md)                   MVP 단계, Task 후보, 완료 기준

  [decisions.md](./decisions.md)               확정 결정과 미결정 사항
  --------------------------------------------------------------------------------

## 5. 용어

-   **Runtime:** 에이전트 코드를 실제로 실행하는 환경.
-   **Adapter:** 특정 Runtime의 기능과 이벤트를 Agent HQ 공통 모델에
    연결하는 구현체.
-   **Bridge:** Local Runtime 및 로컬 리소스와 HQ 간 통신을 담당하는
    로컬 프로세스.
-   **Agent Definition:** 역할, 지침, 모델 선호, 권한, 도구 정책을
    정의한 구성.
-   **Agent Instance:** 실제 Runtime에서 연결되거나 실행 중인 에이전트
    인스턴스.
-   **Mission:** 사용자가 달성하려는 상위 목표.
-   **Task:** Mission을 구성하는 개별 작업.
-   **Pipeline:** Task와 Agent 실행 단계를 연결한 버전 관리 가능한 흐름
    정의.
-   **Run:** Pipeline 또는 Mission의 한 번의 실행 인스턴스.
-   **Event:** 시스템에서 발생한 관찰 가능한 사실.
-   **Trace:** 하나의 실행 흐름을 구성하는 관련 Event와 Span의 인과
    관계.
-   **Artifact:** 실행 중 생성된 파일, 보고서, 코드 변경 참조 등 결과물.
-   **Control:** 실행 환경에 명령을 전달하는 행위. 지원 여부는 Runtime
    Capability에 따른다.

## 6. 문서 적용 원칙

1.  이 문서의 `MUST`는 필수 요구사항, `SHOULD`는 강력 권장, `MAY`는 선택
    사항이다.
2.  Adapter가 지원하지 않는 기능을 지원하는 것처럼 표현하지 않는다.
3.  관찰된 사실, Runtime이 보고한 값, HQ의 추정값을 구분한다.
4.  이벤트가 없다는 이유만으로 에이전트가 Idle이라고 추론하지 않는다.
5.  실행 중인 Run은 시작 시점의 Pipeline Version과 정책 스냅샷을
    참조한다.
6.  민감한 프롬프트, Tool 인자, 파일 내용은 기본적으로 수집 최소화
    원칙을 적용한다.
7.  제품 UI의 애니메이션은 실제 Event 상태를 표현해야 하며 실제 실행
    사실을 꾸며내면 안 된다.
