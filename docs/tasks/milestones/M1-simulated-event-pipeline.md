# M1 — Simulated Event Pipeline

> 목표: `Simulated Agent Events → Event Ingestion → Database → Projection → Realtime Dashboard`를 끝까지 연결해 Event 모델과 파이프라인을 실제 Agent 없이 검증한다.
> 종료 조건:
> 1. 시뮬레이터 시나리오(다중 Agent, 위임 포함)가 Ingestion을 거쳐 Dashboard에 실시간 표시 (TS-06)
> 2. Replay 동일성 테스트 통과 (TS-03)
> 3. 멱등성·스키마 거부·마스킹 테스트 통과 (TS-01, 02, 05)
> 4. RES-002 스파이크 결과로 Event 스키마 v0 점검 완료
> 상태: Backlog · 전제: ADR-0002, ADR-0003 Accepted (HQ-002)
> 아래 파일 경로는 coding-standards §4 Proposed 구조 기준이며 HQ-003에서 확정된다.
> 각 Task의 Verification Steps는 [quality-gates §3](../../engineering/quality-gates.md#3-위험도별-필수-gate)의 위험도별 필수 Gate를 따른다. 아래에는 Task 고유 확인만 추가로 적는다.

## 의존성 그래프

```text
HQ-003 ─▶ HQ-101 (계약) ─┬─▶ HQ-102 Simulator ───────────────────────────────┐
                         ├─▶ HQ-104 Store ─┬─▶ HQ-105 Projector ─┐            │
                         │                 └─▶ HQ-103 Ingestion ─┴─▶ HQ-106 API/SSE ─▶ HQ-107 Dashboard ─▶ HQ-108 E2E
                         │                                                    └──────────────────────────▶ HQ-111 부하
HQ-110 스파이크 (독립, 언제든) ──▶ M1 종료 전 HQ-101 스키마 점검
```

- 병렬 가능: HQ-101 커밋 후 HQ-102 / HQ-104 / HQ-110. HQ-104의 저장소 인터페이스(타입)가 커밋되면 HQ-103과 HQ-105를 병렬로 진행할 수 있다.
- 처리 흐름 (Proposed): Ingestion이 검증·마스킹 → Store append → **같은 요청 안에서** Projector 적용 → Realtime 알림. Projector를 호출하는 쪽은 Ingestion이다. Store는 Projector를 모른다.
- 파일 소유권: `packages/server/src/{ingestion,store,projection,api}/`는 Task별 단독 소유. 서버 조립 코드(엔트리포인트)와 공용 설정은 Coordinator가 소유한다.

---

### HQ-101 — Event 스키마 v0 (계약)
- Status: Backlog · Risk: High · Role: Architect → Worker → Reviewer
- Objective: 모든 컴포넌트가 공유하는 Event Envelope와 v0 Event 타입을 코드 스키마로 확정한다.
- Background: domain-model §3·§4, FR-001/002, NFR-006, RSK-001, RSK-006
- Scope: Envelope와 10개 Event type 스키마, 런타임 검증 함수, 유효/무효 샘플 세트, 계약 테스트, payload 크기 상한 상수, domain-model.md에 코드 위치 링크
- Out of Scope: 저장, 전송, Claude Code 전용 필드
- Dependencies: HQ-003, ADR-0002 Accepted
- Files Expected to Change: `packages/event-schema/**`, `docs/foundation/domain-model.md`
- Acceptance Criteria:
  - [ ] 유효 샘플 전부 통과, 무효 샘플 전부 거부(필드별 사유 포함)
  - [ ] `schema_version` 필드 존재, 알 수 없는 type 거부
  - [ ] 스키마에서 TS 타입이 추론됨 (중복 정의 없음)
- Verification Steps: High 기준 Gate. 계약 테스트 결과와 domain-model 대조 결과를 보고

### HQ-102 — 결정적 시뮬레이터
- Status: Backlog · Risk: Medium · Role: Worker → Reviewer
- Objective: seed와 시나리오 정의로 같은 Event 스트림을 재현해 생성하고, Ingestion으로 전송하거나 파일로 출력한다.
- Background: FR-006, testing-strategy §1-2
- Scope: 시나리오 3종(단일 Agent / 위임 트리 / 오류·재시도), seed·Clock 주입, 순서 섞기·중복 전송 옵션(TS-01, TS-04용), CLI 실행
- Out of Scope: 실제 Agent 연동, 부하 생성 모드(HQ-111에서 추가)
- Dependencies: HQ-101
- Files Expected to Change: `packages/simulator/**`
- Acceptance Criteria:
  - [ ] 같은 seed → 바이트 단위로 같은 출력
  - [ ] 생성된 모든 Event가 HQ-101 검증 통과
  - [ ] 전송 대상 URL 설정 가능, 파일 출력 모드 존재
- Verification Steps: Medium 기준 Gate. 같은 seed로 2회 실행한 출력의 diff가 없음

### HQ-104 — Event Store + 통합 테스트 Gate(G4) 도입
- Status: Backlog · Risk: High · Role: Worker → Reviewer
- Objective: append-only Event 저장과 순차 조회를 제공하고, 통합 테스트 Gate를 처음 도입한다.
- Background: ADR-0002, ADR-0003, RSK-003, security T9
- Scope: 저장소 인터페이스(**먼저 단독 커밋**), SQLite 구현, migration, `event_id` 유일 제약, workspace/session별 순차 조회, 저장소 계약 테스트, DB 파일 위치(저장소 밖)·권한(0600), G4 명령 추가와 quality-gates.md 갱신
- Out of Scope: 삭제 기능(RSK-004, 후속 Task), Cloud DB, Projection
- Dependencies: HQ-101
- Files Expected to Change: `packages/server/src/store/**`, migration 파일, G4 실행 설정, `docs/engineering/quality-gates.md`
- Acceptance Criteria:
  - [ ] update/delete API가 노출되지 않음
  - [ ] 중복 `event_id` 저장 시 기존 건 유지 + 중복 신호 반환
  - [ ] 계약 테스트가 구현과 분리되어 있음 (다른 DB 구현에서 재사용 가능)
  - [ ] DB 파일이 저장소 밖에 0600 권한으로 생성됨
  - [ ] quality-gates.md에 G4가 `Local`로 기록됨
- Verification Steps: High 기준 Gate (G4 포함)

### HQ-103 — Ingestion API
- Status: Backlog · Risk: High · Role: Worker → Reviewer (+ Security Review)
- Objective: Event를 받아 검증·멱등 처리·마스킹 후 저장하고 Projector를 호출한다.
- Background: FR-001~003, NFR-005, security T2/T3/T8, RSK-002, RSK-005
- Scope: 단건/배치 수신 엔드포인트, 스키마 거부 응답, `event_id` 멱등성, 2차 마스킹, `received_at` 부여, payload·배치 크기 상한, 소스별 rate limit, `127.0.0.1` 기본 바인딩, Host/Origin 검증, Projector 호출 지점(HQ-105 인터페이스 사용)
- Out of Scope: Source 인증 토큰(M2), Projection 로직
- Dependencies: HQ-101, HQ-104 저장소 인터페이스 커밋. G4 테스트 실행은 HQ-104 완료 후
- Files Expected to Change: `packages/server/src/ingestion/**`, 관련 테스트
- Acceptance Criteria:
  - [ ] TS-01, TS-02, TS-05 통과
  - [ ] 잘못된 Host/Origin 거부
  - [ ] 크기 상한·rate limit 초과 요청이 명확한 오류로 거부됨
  - [ ] 요청 로그에 payload 원문이 없음
- Verification Steps: High 기준 Gate (G7 포함)

### HQ-105 — Projector + Read Models + Replay
- Status: Backlog · Risk: High · Role: Worker → Reviewer
- Objective: Event로 `agent_state`, `session_timeline`, `delegation_graph`, `tool_stats`를 만들고 전체 재생성을 지원한다.
- Background: domain-model §5, FR-005, RSK-006
- Scope: 순수 함수 `apply(state, event)`, Ingestion이 호출할 적용 인터페이스, Replay 명령, session 내 seq 처리
- Out of Scope: 스냅샷, 비동기 큐, Ingestion 쪽 호출 코드
- Dependencies: HQ-104
- Files Expected to Change: `packages/server/src/projection/**`
- Acceptance Criteria:
  - [ ] TS-03 (실시간 적용 결과 == Replay 결과)
  - [ ] TS-04 (seq 역순 도착 시 같은 최종 상태)
- Verification Steps: High 기준 Gate

### HQ-106 — Query API + Realtime(SSE)
- Status: Backlog · Risk: Medium · Role: Worker → Reviewer
- Objective: Read Model 조회 API와 변경 Push 채널을 제공한다.
- Background: FR-012, NFR-002, ADR-0003(SSE), security T2/T3, RSK-005
- Scope: 조회 엔드포인트, SSE 스트림, 재연결 시 누락 복구(마지막 수신 위치 기반 또는 스냅샷 재조회), `127.0.0.1` 기본 바인딩, Host/Origin 검증(HQ-103과 같은 방식), API 계약 문서화
- Out of Scope: 양방향 제어, 인증
- Dependencies: HQ-103, HQ-105
- Files Expected to Change: `packages/server/src/api/**`, `docs/foundation/architecture.md`(API 섹션)
- Acceptance Criteria:
  - [ ] TS-07 통과
  - [ ] 잘못된 Host/Origin의 조회·SSE 요청 거부
  - [ ] API 응답 형식이 문서와 일치
- Verification Steps: Medium 기준 Gate + Host/Origin 거부 통합 테스트(G4)

### HQ-107 — Dashboard v0
- Status: Backlog · Risk: Medium · Role: Worker → Reviewer
- Objective: 개발자가 Agent 목록·상태·세션 타임라인·위임 관계를 실시간으로 본다.
- Background: FR-010~013, security T5
- Scope: Agent 목록/상태, 세션 타임라인, 위임 트리(단순 목록/트리), 연결 상태 표시, 빈 상태·오류 상태, CSP 적용
- Out of Scope: 3D, 제어 버튼, 인증, 일반 사용자용 단순화 뷰(별도 Task)
- Dependencies: HQ-106 API 계약
- Files Expected to Change: `packages/dashboard/**`
- Acceptance Criteria:
  - [ ] 새 Event가 새로고침 없이 반영
  - [ ] Agent 콘텐츠가 HTML로 해석되지 않음 (XSS 테스트 문자열)
  - [ ] inline script가 CSP로 차단됨
  - [ ] SSE가 끊기면 사용자에게 표시하고 자동 재연결
- Verification Steps: Medium 기준 Gate + 수동 확인 스크린샷

### HQ-108 — E2E: 시뮬레이터 → Ingestion → Dashboard
- Status: Backlog · Risk: Medium · Role: QA → Reviewer
- Objective: 전체 파이프라인을 브라우저 테스트로 검증한다 (TS-06).
- Background: M1 종료 조건 1, testing-strategy §3
- Scope: E2E 러너 도입(ADR-0003 범위), 서버·시뮬레이터 기동 스크립트, 위임 트리 시나리오 테스트, quality-gates의 G5 갱신
- Out of Scope: 성능 측정(HQ-111), 시각 회귀 테스트
- Dependencies: HQ-102, HQ-103, HQ-107, E2E 도구 의존성 승인
- Files Expected to Change: E2E 테스트 디렉터리, 기동 스크립트, `docs/engineering/quality-gates.md`
- Acceptance Criteria:
  - [ ] 위임 트리 시나리오를 실행하면 기대한 Agent 수·상태가 화면에 표시
  - [ ] 로컬에서 단일 명령으로 실행
  - [ ] quality-gates.md에 G5가 `Local`로 기록됨
- Verification Steps: Medium 기준 Gate + G5 실행 결과

### HQ-110 — 스파이크: Claude Code 신호 조사 (RES-002)
- Status: Backlog · Risk: Low · Role: Architect · 병행 가능
- Objective: Claude Code에서 얻을 수 있는 실행 신호를 확인하고 Event 스키마 v0 적합성을 점검한다.
- Background: RSK-001, RSK-009, FR-020
- Scope: 설치 버전(2.1.330) 공식 문서 확인, scratch 프로젝트에서 로깅 hook 실험, 신호 매핑표, 세션당 Event량 측정. 수집 데이터 처리는 [data-governance §5](../../engineering/data-governance.md#5-개발-과정의-데이터)를 따른다.
- Out of Scope: 제품 코드, 저장소에 샘플 데이터 커밋, 사용자 전역 설정 수정
- Dependencies: 없음. scratch 프로젝트 hook 설정은 승인 후 진행
- Files Expected to Change: `docs/research/README.md` 또는 `docs/research/RES-002-claude-code-signals.md`
- Acceptance Criteria:
  - [ ] FR-020에 필요한 신호 ↔ 수집 방식 매핑표
  - [ ] 스키마 v0 변경 필요 여부 결론 (필요하면 ADR 제안)
  - [ ] 수집 파일 삭제 기록
- Verification Steps: Low 기준 Gate. 매핑표의 각 항목에 근거(문서 링크 또는 실험 출력 요약)

### HQ-111 — 부하 측정 (RES-005)
- Status: Backlog · Risk: Low · Role: QA
- Objective: NFR-002/003 가정치를 측정하고 ADR 재검토 여부를 판단한다.
- Background: NFR-002, NFR-003, ADR-0002/0003 Revisit Conditions
- Scope: 시뮬레이터 부하 생성 모드, 측정 스크립트, 측정 조건(하드웨어, Event 수, 동시 Agent 수) 기록
- Out of Scope: 성능 최적화(결과에 따라 별도 Task)
- Dependencies: HQ-102, HQ-103, HQ-106
- Files Expected to Change: `packages/simulator/**`(부하 모드), 측정 스크립트, `docs/research/README.md`, 필요 시 `docs/foundation/requirements.md`
- Acceptance Criteria:
  - [ ] p95 지연과 초당 처리량을 측정 조건과 함께 기록
  - [ ] 판정 규칙: NFR-002(p95 1초) 또는 NFR-003(초당 200건)을 만족하지 못하면 ADR-0002/0003 Revisit을 사용자에게 제안
- Verification Steps: Low 기준 Gate. 측정을 2회 반복해 편차 기록
