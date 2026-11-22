# Security & Permission Model

## 1. 보안 목표

Agent HQ는 에이전트가 코드, 파일, API, MCP Tool 및 외부 서비스에
접근하는 환경을 다룬다. 따라서 관찰 기능과 실행 기능의 권한을 분리하고,
모든 실행 및 제어를 최소 권한 원칙으로 관리한다.

## 2. 보안 원칙

1.  Least Privilege
2.  Deny by Default
3.  Observe Permission != Execute Permission
4.  Human Approval for High-Risk Actions
5.  Secret Isolation
6.  Tenant / Workspace Isolation
7.  Auditable Control
8.  Explicit Local Resource Scope

## 3. 권한 계층

### User / Workspace

-   Workspace Owner
-   Admin
-   Operator
-   Developer
-   Viewer

초기 역할 세부 권한은 TBD. 최소한 Viewer는 실행 제어를 할 수 없어야
한다.

### Agent

Agent별로 다음 정책을 설정한다. - 허용 Runtime - 허용 실행 위치 - 파일
경로 범위 - Shell / Command Allowlist - Tool Allowlist - Network Egress
Policy - Token / Cost Budget - Timeout - Approval Requirement

### Tool Risk Level

-   **Read:** 조회 중심.
-   **Write:** 파일 또는 외부 데이터 변경.
-   **Execute:** 명령 실행 또는 코드 실행.
-   **External Side Effect:** 외부 시스템에 메시지 전송, 배포, 결제 등
    영향.

위험 수준에 따라 승인 정책을 적용한다.

## 4. Local Bridge Security

-   Bridge는 outbound TLS 연결을 우선한다.
-   Pairing 과정에서 일회성 코드 또는 동등한 안전한 인증을 사용한다.
-   장치별 고유 자격 증명을 발급하고 폐기할 수 있어야 한다.
-   제어 명령은 인증된 Workspace/Device/Agent 범위에서 검증한다.
-   Local filesystem은 명시적으로 허용된 경로만 접근한다.
-   Shell 명령은 기본 거부하며 Allowlist 또는 명시적 승인 정책을
    사용한다.
-   Bridge 업데이트는 서명 검증을 고려한다.
-   로그에 Secret을 기록하지 않는다.

## 5. Cloud Managed Runtime

-   사용자별 실행 환경을 격리한다.
-   실행 컨테이너에 필요한 Secret만 주입한다.
-   기본적으로 내부 서비스 네트워크 접근을 제한한다.
-   외부 네트워크 Egress 정책을 적용한다.
-   CPU, Memory, Runtime, Cost Limit을 적용한다.
-   실행 종료 후 임시 파일과 자격 증명을 정리한다.
-   다른 Workspace의 데이터에 접근하지 못하도록 격리한다.

## 6. MCP Security

-   MCP Server의 출처와 연결 방식을 확인한다.
-   OAuth Token 및 API Key를 Secret Store에 저장한다.
-   Tool별 Allowlist를 지원한다.
-   위험 Tool은 실행 전 Approval을 요구할 수 있다.
-   Tool Input/Output은 민감 정보 마스킹을 거친다.
-   Tool 호출의 실제 성공 여부와 Runtime 보고를 구분한다.
-   신뢰할 수 없는 Tool Description을 시스템 지시로 취급하지 않는다.

## 7. Approval

Approval Request는 다음을 포함한다. - 요청자 Agent/Runtime - 수행할
Action - 대상 리소스 - 전달될 데이터의 요약 - 위험 등급 - 요청 시각 및
만료 - 승인/거부 결과 - 실행 결과와 연결 ID

승인 이후 Action의 내용이 변경되면 기존 승인을 재사용하지 않는다.

## 8. Audit Log

다음 행위는 Audit Log에 기록한다. - 로그인 및 인증 변경 - Workspace
Member 및 Role 변경 - Agent Policy 변경 - Secret 등록/폐기 - Runtime
연결 및 해제 - Pipeline Run 시작/취소 - Approval 승인/거부 - Tool
Allowlist 변경 - Data Policy 변경 - 데이터 Export 및 삭제

Audit Log는 일반 사용자 Event와 별도 보존 정책을 가질 수 있다.

## 9. Threat Model 후보

-   악성 Agent가 권한을 확대하려는 시도
-   Prompt Injection을 통한 Tool 오용
-   악성 MCP Server
-   Secret이 Event/Log에 노출
-   Local Bridge 인증 탈취
-   Workspace 간 데이터 접근
-   Webhook Replay 및 Spoofing
-   과도한 실행 비용 및 Denial of Wallet
-   Artifact에 포함된 악성 파일
-   Cloud/Local Sync를 통한 데이터 유출

## 10. 필수 보안 테스트

-   Cross-workspace authorization test
-   Unauthorized control command test
-   Secret redaction test
-   Path traversal test
-   Command allowlist test
-   Webhook signature / replay test
-   Approval bypass test
-   Token expiration / revocation test
-   Local Bridge pairing test
-   Runtime isolation test
-   Data deletion propagation test

## 11. Open Decisions

-   인증 공급자 및 OAuth 방식
-   암호화 Key Management
-   Local Secret Store 구현
-   Cloud Runtime sandbox 기술
-   보안 감사 및 침투 테스트 범위
-   팀 Role 및 정책 상속 모델
