# Data Governance & Selective Storage

## 1. 목적

Agent HQ는 Hybrid 배포를 지원하고 사용자가 데이터 유형별 저장 위치를
선택할 수 있어야 한다. Selective Storage는 단순히 Cloud 또는 Local 중
하나를 고르는 옵션이 아니라, 데이터의 민감도·용도·동기화 범위를 관리하는
정책 체계다.

## 2. 저장 위치 유형

-   **Local Only:** 사용자 장치 또는 로컬 저장소에만 저장.
-   **Cloud Only:** Agent HQ Cloud에 저장.
-   **Synced:** 로컬과 Cloud에 정책에 따라 동기화.
-   **Reference Only:** 데이터 원문은 원래 시스템에 두고
    메타데이터/참조만 저장.
-   **Ephemeral:** 일시적으로 처리하고 정책에 따라 짧은 기간 후 삭제.

각 데이터 유형은 Workspace 정책과 사용자 선택을 따른다. 보안상 강제되는
최소 보존/감사 데이터는 별도 정책으로 정의한다.

## 3. 데이터 분류

  데이터                  기본 제안                              조정 가능 여부
  ----------------------- -------------------------------------- ----------------
  Workspace 설정          Cloud 또는 Local                       예
  Agent Definition        선택형                                 예
  Pipeline Definition     선택형                                 예
  Event Metadata          최소 메타데이터 Cloud Sync 선택        예
  Raw Prompt / Message    Local Only 기본                        예
  Tool Input / Output     Reference/Local 기본                   예
  Secret / API Key        Local Secret Store 또는 암호화 Vault   제한적
  Artifact                Local / Cloud / Reference              예
  Usage Metrics           요약 데이터 Cloud Sync 선택            예
  Audit Log               정책에 따른 보존                       제한적
  3D Office Preferences   Cloud Sync 가능                        예

이 표는 초기 권장값이며 제품 기본값은 보안 검토 후 확정한다.

## 4. Data Policy

각 Workspace는 데이터 정책을 정의한다.

``` ts
type DataPolicy = {
  dataClass: string;
  storageMode:
    | "local_only"
    | "cloud_only"
    | "synced"
    | "reference_only"
    | "ephemeral";
  syncDirection?: "local_to_cloud" | "cloud_to_local" | "bidirectional";
  retentionDays?: number;
  redactFields?: string[];
  allowContentCapture: boolean;
};
```

정책 변경은 기존 데이터에 소급 적용되는지, 이후 데이터에만 적용되는지
명시해야 한다.

## 5. 동기화 모델

### 기본 원칙

-   동기화는 데이터 클래스별로 설정한다.
-   원본 위치와 동기화된 복제본을 구분한다.
-   동기화 실패를 사용자에게 표시한다.
-   데이터 삭제는 복제본 및 캐시까지 고려한다.
-   오프라인에서 생성된 데이터는 재연결 시 충돌 정책에 따라 처리한다.

### Conflict Handling

-   Event: append-only 및 Idempotency Key 기반 병합.
-   Settings: version 및 updatedAt 기반 충돌 감지, 자동 덮어쓰기 금지.
-   Pipeline Definition: Version 기반 병합 또는 사용자 선택.
-   Artifact: checksum과 immutable object version 권장.
-   Secret: 일반 동기화 경로에서 제외.

## 6. Local Storage

Local Bridge는 다음을 관리할 수 있다. - 암호화된 Local Metadata DB -
Event Outbox - Local Artifact Index - Secret Reference - Runtime
Connection Metadata

Local DB 기술은 구현 단계에서 선택한다. 로컬 저장 데이터의 암호화 및 OS
Secret Store 연동을 검토한다.

## 7. Cloud Storage

-   PostgreSQL: Workspace 및 구조화된 도메인 데이터
-   Object Storage: Artifact 및 큰 파일
-   Redis: 캐시, 임시 상태, Queue
-   Event Archive: 보존 정책에 따른 이벤트 이력

Redis를 영구 데이터의 유일한 저장소로 사용하지 않는다.

## 8. Data Lifecycle

데이터 수명주기: 1. 생성 2. 분류 및 정책 확인 3. 저장 4. 선택적 동기화
5. 접근 및 사용 6. 보존 기간 만료 7. 삭제 또는 익명화 8. 삭제 결과 확인

사용자가 Workspace를 삭제할 경우 Cloud 데이터, Local Bridge 데이터,
Object Storage, Backup 및 외부 참조의 처리 범위를 안내해야 한다.

## 9. Privacy by Default

-   Prompt/Message 전문 수집은 기본 비활성 또는 최소화.
-   Tool Argument 및 Output은 민감 필드 마스킹.
-   Secret은 Event와 Artifact에 포함하지 않음.
-   Cloud Sync 전 데이터 분류 및 정책 적용.
-   사용자는 데이터별 저장 위치와 동기화 여부를 확인할 수 있음.
-   3D Office에는 민감한 원문 대신 요약/상태만 표시.

## 10. Open Decisions

-   기본 저장 위치
-   Cloud Region 및 데이터 Residency
-   Event / Artifact 기본 보존 기간
-   Local DB 및 암호화 구현
-   삭제 및 Backup 만료 정책
-   팀 Workspace에서 개인별 Local Data 공유 정책
-   데이터 Export 포맷
