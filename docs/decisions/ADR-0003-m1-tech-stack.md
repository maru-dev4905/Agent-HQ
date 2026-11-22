# ADR-0003: M1 기술 스택

- Status: **Proposed** — 사용자 결정 필요 (HQ-002)
- Date: 2026-11-22
- Deciders: 사용자 / 제안: Claude (Architect)
- Supersedes: 없음

## Context
- 저장소는 비어 있다 (코드·package.json 없음, 2026-11-22 확인).
- 설치 확인된 도구: Node v24.14.0, npm 11.15.0, pnpm 10.33.2, bun 1.4.2, tsc 6.0.3(전역), Docker 29.6.2, Python 3.14.7. psql·redis 미설치.
- 요구: Local-first(NFR-001), 실시간 갱신(FR-012), 향후 3D(M4), Cloud 확장(M6), 개발자+일반 사용자 UI.
- 이전 논의의 기술 제안은 확정이 아니다 (사용자 지시).

## Problem
M1(시뮬레이터 → 수집 → 저장 → Projection → 실시간 Dashboard)을 어떤 언어·런타임·DB·전송 방식·Frontend로 만들 것인가?

## Options Considered

### 언어
| 옵션 | 장점 | 단점 |
|---|---|---|
| **TypeScript 단일 언어 (제안)** | Frontend(3D 포함)와 Backend에서 Event 타입 공유. MCP/Claude 관련 공식 SDK가 TS로도 제공됨(Python도 동등하게 제공 — 결정적 근거 아님, RES-001에서 확인) | 고성능 수집이 필요해지면 한계 가능 |
| Backend Go/Rust + Frontend TS | 성능, 단일 바이너리 배포 | 타입 공유 비용, 2개 언어 유지 |
| Python Backend | 데이터 분석 용이 | Frontend와 분리, 타입 공유 어려움 |

### 런타임 / 패키지 매니저
| 옵션 | 비고 |
|---|---|
| **Node 24 + pnpm workspace (제안)** | 가장 보편적, 호환성 위험 낮음 |
| Bun | 빠름, 내장 SQLite/테스트. 생태계 호환성 확인 필요 |

### DB
| 옵션 | 장점 | 단점 |
|---|---|---|
| **SQLite (Local) — 제안** | 설치 불필요, Local-first에 적합, 파일 하나 | 다중 사용자/Cloud에는 부적합 |
| PostgreSQL | Cloud 확장 용이 | 로컬 사용자에게 설치·Docker 요구 |
| SQLite(Local) + PostgreSQL(Cloud) 이원화 | 각 환경 최적 | SQL 방언 차이 → 저장소 계층 추상화 필요 ([RSK-003](../operations/risks.md)) |

### Realtime 전송
| 옵션 | 비고 |
|---|---|
| **SSE (제안)** | 서버→클라이언트 단방향으로 M1 충분, 단순, 재연결 내장 |
| WebSocket | 양방향 — M5 제어 단계에서 필요할 수 있음 |

### Frontend
| 옵션 | 비고 |
|---|---|
| **React + Vite SPA (제안)** | 로컬 앱 배포 단순, 3D(react-three-fiber 계열) 확장 경로 존재 |
| Next.js | Cloud/SSR에 유리하지만 Local 단일 프로세스 배포가 복잡해질 수 있음 |

### 테스트 / 품질 도구 (제안, 도입 시 [quality-gates](../engineering/quality-gates.md) 갱신)
- Unit/Integration: Vitest · E2E: Playwright · Lint/Format: ESLint + Prettier (또는 Biome) · Schema: Zod 또는 JSON Schema

## Decision (제안)
TypeScript + Node 24 + pnpm workspace 모노레포, SQLite(저장소 계층 추상화 유지), SSE, React + Vite, Vitest/Playwright.
**버전 고정과 정확한 패키지 목록은 HQ-003 스캐폴드 시 확인한 실제 최신 안정 버전으로 결정**하며 이 ADR에 사후 기록한다.

## Reasons
- 단일 언어로 Event 스키마 타입을 Source·Server·UI가 공유 → 문서-코드 불일치와 계약 위반 위험 감소.
- 로컬 사용자가 추가 설치 없이 실행 가능 (SQLite).
- M1은 단방향 Push로 충분 (SSE). M5에서 재검토.
- 가정(미검증): SQLite가 NFR-003 부하를 처리한다 → RES-005 / HQ-111에서 부하 측정.

## Consequences (채택 시)
- Cloud 단계에서 DB 이원화 또는 마이그레이션 작업 발생 가능.
- Node를 채택하면 Bun 전용 API를 사용하지 않는다.

## Revisit Conditions
- RES-005 부하 테스트에서 SQLite가 NFR-003을 만족하지 못할 때
- OQ-2에서 Cloud가 1급 시나리오로 결정될 때
- M4 3D 기술 조사(RES-004) 결과 Frontend 프레임워크 제약이 발견될 때

## Related Documents
- [architecture.md §4](../foundation/architecture.md#4-기술-스택-현황), [RES-005](../research/README.md), [HQ-002, HQ-003](../tasks/milestones/M0-harness-bootstrap.md)
