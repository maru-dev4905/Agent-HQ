# Testing Strategy

> 목적: 테스트 계층, 계층별 책임, 작성 원칙.
> 관리 책임: QA. 상태: 원칙(§1)은 적용. 도구 이름은 HQ-003에서 의존성 승인과 함께 확정한다 (ADR-0003).
> 실제로 실행 가능한 명령은 [quality-gates](quality-gates.md)에만 기록한다.

## 1. 원칙

1. **결정적 테스트.** 시간·ID·랜덤은 주입해 고정한다. 실제 시간에 의존하는 sleep 기반 테스트를 쓰지 않는다.
2. **시뮬레이터 = 픽스처.** M1 시뮬레이터의 seed 시나리오를 통합·E2E 테스트의 입력으로 재사용한다.
3. **계약 테스트 우선.** Event 스키마는 모든 컴포넌트의 계약이다. 스키마 변경은 계약 테스트를 먼저 바꾼다.
4. **테스트를 약화시켜 통과시키지 않는다.** 실패하는 테스트를 삭제·skip할 때는 Issue를 만들고 사용자에게 보고한다.
5. **버그 수정은 재현 테스트부터.** 실패하는 테스트 → 수정 → 통과.

## 2. 계층

| 계층 | 대상 | 예시 | 후보 도구 |
|---|---|---|---|
| Unit | 순수 함수, Projector의 `apply(state, event)` | 상태 전이, 마스킹 함수 | Vitest (후보) |
| Contract | Event 스키마 | 유효/무효 Event 샘플 세트, 버전 호환 | 스키마 라이브러리 + Vitest |
| Integration | Ingestion→Store→Projector (Docker Compose의 테스트용 PostgreSQL) | 멱등성, 거부 사유, Replay | Vitest (후보) |
| E2E | Simulator→API→Web 브라우저 | 시나리오 실행 후 화면에 Agent 상태 표시 | Playwright (후보) |
| Property (선택) | Projector | 임의 Event 순서에서 불변식 유지 | fast-check (도입 시 승인) |
| Performance | Ingestion 처리량 | NFR-003 부하 | 자체 스크립트 |

## 3. 핵심 테스트 시나리오 (M1)

| ID | 시나리오 | 계층 | Task |
|---|---|---|---|
| TS-01 | 같은 `idempotencyKey`의 Event를 2회 전송 → 1건 저장, 두 번째는 "중복" 응답 | Integration | HQ-104, HQ-105 |
| TS-02 | 스키마 위반 Event → 4xx + 필드별 사유 | Integration | HQ-105 |
| TS-03 | 시나리오 전체 수신 후 Projection = 처음부터 Replay한 Projection | Integration | HQ-106 |
| TS-04 | 세션 내 `sequence` 역순 도착 → 최종 상태 동일 | Unit/Integration | HQ-106 |
| TS-05 | Secret 패턴이 든 payload → 저장본에 원문 없음 | Integration | HQ-105 |
| TS-06 | 시뮬레이터 실행 → Dashboard에 Agent N개와 상태가 실시간 반영 | E2E | HQ-111 |
| TS-07 | SSE 끊김 후 `Last-Event-ID`로 재연결 → 누락·중복 없음 | Integration/E2E | HQ-107 |
| TS-08 | 토큰 없음·폐기·만료 요청 거부 | Integration | HQ-103 |
| TS-09 | `sequence` 불연속 → `event.gap.detected`, Connection 끊김 → Agent `unknown` (`idle` 아님) | Integration | HQ-108 |
| TS-10 | 잘못된 Host/Origin 요청 거부 | Integration | HQ-105, HQ-107 |

이후 Phase의 필수 테스트:
- Adapter 테스트 9종: [adapter-spec §10](../foundation/adapter-spec.md) (Phase 2부터)
- 보안 테스트 11종: [security §4.6](security.md#46-필수-보안-테스트) (해당 Phase의 수용 조건에 넣는다)

## 4. 커버리지
- 수치 목표는 두지 않는다(Proposed). 대신 **Projector·스키마·마스킹·Ingestion 검증 로직은 분기 단위로 테스트** 필수.
- 리뷰어는 "테스트 누락"을 [review-protocol](../agents/review-protocol.md) 체크리스트로 확인한다.

## 5. 테스트 데이터
- 실제 Agent 로그(프롬프트·코드 포함)를 테스트 픽스처로 커밋하지 않는다. 필요하면 합성 데이터로 대체하거나 마스킹 후 사용자 승인을 받는다.
