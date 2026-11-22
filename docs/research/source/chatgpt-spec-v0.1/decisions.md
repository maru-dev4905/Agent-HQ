# Architecture Decisions & Open Questions

## 1. 확정된 결정

### D-001 --- Hybrid Agent Platform

Agent HQ는 외부 Runtime 연결과 자체 Orchestration을 모두 지원한다.

### D-002 --- Dual UI

3D Office와 전문 Dashboard를 함께 제공한다. 두 화면은 동일한
도메인/Event 데이터를 사용한다.

### D-003 --- Both User Types

개발자와 비개발자를 모두 대상으로 한다. Easy Mode와 Developer Mode는
동일한 Core 위의 UX 계층이다.

### D-004 --- Hybrid Deployment

Cloud와 Local 환경을 함께 지원한다.

### D-005 --- Selective Data Storage

데이터 유형별 저장 위치 및 동기화 정책을 선택할 수 있게 한다.

### D-006 --- Both Execution Locations

Local 및 Cloud 실행을 지원한다.

### D-007 --- First Runtime: Claude Code

첫 번째 실전 Adapter는 Claude Code로 시작한다.

### D-008 --- Modular Monolith First

초기에는 모듈 경계를 가진 모놀리스로 시작하고, 필요에 따라 Worker 및
Realtime 프로세스를 분리한다.

### D-009 --- Event-driven Visualization

Dashboard와 3D Office는 공통 Event/Projection을 소비한다. 애니메이션은
실제 상태를 꾸며내지 않는다.

## 2. 권장하지만 아직 확정되지 않은 기술 선택

-   Next.js + TypeScript
-   NestJS
-   React Three Fiber / Three.js
-   React Flow
-   PostgreSQL
-   Prisma
-   Redis + BullMQ
-   WebSocket / SSE
-   S3-compatible Object Storage
-   pnpm Monorepo

## 3. Open Decisions

### Product

-   제품 공개 범위 및 라이선스
-   개인/팀 요금제
-   Marketplace 범위
-   Desktop App 필요성

### Identity & Access

-   인증 Provider
-   OAuth 및 Device Pairing 상세 방식
-   Workspace Role 및 권한 매트릭스

### Deployment

-   Cloud Provider
-   Region 및 Data Residency
-   Managed Runtime 격리 방식
-   Local Bridge 업데이트 방식

### Data

-   기본 저장 위치
-   Event/Artifact 보존 기간
-   Backup 정책
-   데이터 삭제 및 Export 방식
-   Local/Cloud Sync Conflict 정책

### Execution

-   Managed Runtime 지원 언어
-   Local 실행 Sandbox
-   Cloud 실행 Container/VM
-   Pause/Resume/Cancel의 Runtime별 의미
-   동시 실행 및 비용 한도

### UX

-   3D Office 아트 스타일 및 카메라
-   캐릭터 커스터마이징
-   모바일 지원 범위
-   Office Layout 편집

## 4. 검토가 필요한 주요 위험

1.  Adapter별 이벤트 정보량 차이로 동일한 수준의 관찰이 불가능할 수
    있다.
2.  Local Bridge가 보안상 가장 중요한 공격 표면이 될 수 있다.
3.  Cloud와 Local의 동기화 정책이 복잡해질 수 있다.
4.  외부 Runtime의 제어 기능은 HQ가 보장할 수 없다.
5.  3D UI 개발이 Core 관제 기능보다 앞서면 MVP 일정이 늘어날 수 있다.
6.  Event payload에 민감한 데이터가 포함될 수 있다.
7.  재시도 및 중복 실행으로 외부 부작용이 발생할 수 있다.

## 5. 다음 의사결정 회의 권장 순서

1.  인증 및 Workspace 권한 모델
2.  Local Bridge pairing 및 보안
3.  데이터 유형별 기본 저장 정책
4.  Cloud Managed Runtime 격리 방식
5.  Claude Code Adapter가 수집할 정확한 Hook Event 목록
6.  MVP의 3D Office 최소 범위
7.  배포 및 비용 구조
