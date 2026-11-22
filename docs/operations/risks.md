# Risks

> 목적: 아직 발생하지 않았지만 문제가 될 수 있는 요소. 발생하면 Issue로 전환하고 링크한다.
> 관리 책임: Architect(기술), Coordinator(프로세스). 마일스톤 시작 시 재평가.
> 상태: Open | Mitigating | Accepted(사용자 승인) | Closed(검증 후) | Realized → ISS-XXX
> 우선순위 = 영향(H/M/L) × 가능성(H/M/L). 범위: Product | Architecture | Data | Security | Process

## 템플릿
```markdown
### RSK-XXX — <Title>
- Status / Priority (영향×가능성) / 범위:
- Description:
- Impact:
- Root Cause:
- Proposed Solution (완화책):
- Verification Method:
- Related Tasks:
- Created / Updated:
```

## 요약

| ID | 제목 | 영향 | 가능성 | 범위 | 상태 |
|---|---|---|---|---|---|
| RSK-001 | Claude Code 이벤트 수집 방식의 불확실성 | H | M | Architecture | Open |
| RSK-002 | 패턴 기반 마스킹의 누락 → Secret 저장 | H | M | Security/Data | Open |
| RSK-003 | Local/Cloud DB 차이로 인한 이중 구현 | M | M | Architecture | Open |
| RSK-004 | append-only 저장과 삭제 요구의 충돌 | M | H | Data | Open |
| RSK-005 | 인증 없는 로컬 API 노출 | H | M | Security | Open |
| RSK-006 | 다중 소스 Event 순서·시계 불일치 | M | H | Architecture | Open |
| RSK-007 | Cloud 저장 비용 증가 | M | L | Product | Open |
| RSK-008 | 제어 기능(M5)의 보안·신뢰성 | H | M | Security | Open |
| RSK-009 | 기존 전역 hook(Orca, iTerm2)과 수집 hook 충돌 | M | M | Architecture | Open |
| RSK-010 | 기존 Agent 도구 대비 차별성 불명확 | H | M | Product | Open |
| RSK-011 | 문서와 코드 불일치 / 미검증 사실의 문서화 | M | H | Process | Mitigating |
| RSK-012 | 병렬 Agent 간 파일·결정 충돌 | M | M | Process | Mitigating |
| RSK-013 | 3D Office의 성능·범위 비대화 | M | M | Product | Open |
| RSK-014 | 개발 환경 재현성 부재 | M | H | Process | Open |

---

### RSK-001 — Claude Code 이벤트 수집 방식의 불확실성
- Status / Priority / 범위: Open / H×M / Architecture
- Description: M2의 핵심인 Claude Code 연동 방식(hooks, OpenTelemetry, 세션 transcript 파일 등)이 제공하는 데이터 범위·안정성을 아직 검증하지 않았다. hook 기능 자체는 존재한다 — 사용자 전역 설정에 SessionStart/SessionEnd, PreToolUse/PostToolUse/PostToolUseFailure, SubagentStart/SubagentStop, UserPromptSubmit, Stop 등 17종의 hook 이벤트가 등록되어 있다(2026-11-22 확인). 각 이벤트가 전달하는 데이터의 의미는 검증하지 않았다.
- Impact: Event 모델(domain-model)이 실제 신호와 맞지 않으면 M1 스키마를 재작업해야 한다.
- Root Cause: 외부 도구의 인터페이스에 의존.
- Proposed Solution: M1 진행과 병행해 RES-002 스파이크 수행. Event 스키마 v0에 `source`별 확장 여지를 두고, M1 종료 전 실제 신호로 스키마를 점검.
- Verification Method: RES-002 결과에서 FR-020에 필요한 신호(세션 시작/종료, 도구 호출, subagent) 매핑표 완성.
- Related Tasks: HQ-101, RES-002
- Created / Updated: 2026-11-22

### RSK-002 — 패턴 기반 마스킹의 누락
- Status / Priority / 범위: Open / H×M / Security, Data
- Description: Tool 입력·출력에 Secret이 포함될 수 있고 패턴 마스킹은 완전하지 않다.
- Impact: 로컬 DB 또는 Cloud에 Secret 저장 → 유출.
- Root Cause: 비정형 콘텐츠.
- Proposed Solution: D2 콘텐츠 기본 미저장(data-governance), 2단계 마스킹, 마스킹 테스트(TS-05), Cloud 동기화 opt-in.
- Verification Method: TS-05 통과, 알려진 키 형식 샘플 세트 테스트.
- Related Tasks: HQ-103
- Created / Updated: 2026-11-22

### RSK-003 — Local/Cloud DB 차이
- Status / Priority / 범위: Open / M×M / Architecture
- Description: Local에 SQLite, Cloud에 다른 DB를 쓰면 SQL·동시성 모델 차이가 생긴다.
- Impact: 저장소 계층 이중 구현, 환경별 버그.
- Root Cause: Hybrid Deployment.
- Proposed Solution: Event Store/Read Model 접근을 저장소 인터페이스 뒤로 숨기고, DB 특화 기능 사용 최소화. Cloud 결정(OQ-2) 시 ADR.
- Verification Method: 저장소 인터페이스에 대한 계약 테스트가 DB 구현과 무관하게 존재.
- Related Tasks: HQ-104
- Created / Updated: 2026-11-22

### RSK-004 — append-only와 삭제 요구 충돌
- Status / Priority / 범위: Open / M×H / Data
- Description: 사용자가 세션 데이터 삭제를 원하거나 보존 기간이 지나면 Event를 지워야 한다.
- Impact: Event Sourcing 불변 전제와 충돌, Projection 불일치.
- Proposed Solution: 불변 = "수정 금지"로 정의하고, Workspace/Session 단위 물리 삭제 + Projection 재생성을 허용 (ADR-0002 Consequences).
- Verification Method: 세션 삭제 후 Replay 결과에 해당 세션이 없음을 테스트.
- Related Tasks: (M1 이후 Task화)
- Created / Updated: 2026-11-22

### RSK-005 — 인증 없는 로컬 API 노출
- Status / Priority / 범위: Open / H×M / Security
- Description: Local 서버가 외부 인터페이스에 바인딩되거나 브라우저 경유(CSRF, DNS rebinding) 요청을 받을 수 있다.
- Proposed Solution: 기본 `127.0.0.1`, Host/Origin 검증, 로컬 토큰 (security.md T2, T3).
- Verification Method: 통합 테스트에서 잘못된 Host/Origin 요청 거부 확인.
- Related Tasks: HQ-103, HQ-106
- Created / Updated: 2026-11-22

### RSK-006 — Event 순서·시계 불일치
- Status / Priority / 범위: Open / M×H / Architecture
- Description: 로컬·클라우드·여러 프로세스에서 온 Event의 시계가 다르고 네트워크 지연으로 순서가 바뀐다.
- Proposed Solution: session 내 `seq`, Projector는 순서 독립적 또는 seq 기반 재정렬 (TS-04). 전역 순서는 보장하지 않음을 명시.
- Verification Method: TS-04, property 테스트.
- Related Tasks: HQ-101, HQ-105
- Created / Updated: 2026-11-22

### RSK-007 — Cloud 저장 비용
- Status / Priority / 범위: Open / M×L / Product
- Description: 고빈도 Tool Call Event를 콘텐츠까지 저장하면 비용이 빠르게 증가.
- Proposed Solution: Selective Storage(D0/D1 위주), 보존 정책, 집계 Projection만 동기화하는 옵션.
- Verification Method: RES-002에서 측정한 세션당 Event 수로 비용 추정.
- Related Tasks: M6
- Created / Updated: 2026-11-22

### RSK-008 — 제어 기능의 보안·신뢰성
- Status / Priority / 범위: Open / H×M / Security
- Description: Agent 중단·명령 지시 기능은 오남용 시 코드·데이터 손상을 일으킬 수 있다.
- Proposed Solution: M5 전 별도 위협 모델과 ADR, 인증·권한·확인·감사 로그 필수. M1~M4는 읽기 전용.
- Verification Method: M5 착수 전 ADR 승인.
- Related Tasks: M5
- Created / Updated: 2026-11-22

### RSK-009 — 기존 전역 hook과의 충돌
- Status / Priority / 범위: Open / M×M / Architecture
- Description: 사용자 전역 `~/.claude/settings.json`에 Orca·iTerm2가 설치한 hook이 이미 있다(확인). Agent HQ 수집 hook을 추가하면 실행 순서·지연·실패 전파 문제가 생길 수 있고, 사용자 전역 설정을 수정하게 될 위험이 있다.
- Proposed Solution: 수집 hook은 프로젝트/사용자 선택 범위에 설치하고 전역 설정을 자동 수정하지 않는다. 짧은 timeout, 실패 무시. 설치 방식은 RES-002에서 결정.
- Verification Method: 기존 hook과 함께 실행 시 Orca 상태 표시가 정상인지 수동 확인.
- Related Tasks: RES-002, M2
- Created / Updated: 2026-11-22

### RSK-010 — 기존 도구 대비 차별성 불명확
- Status / Priority / 범위: Open / H×M / Product
- Description: 이 개발 환경의 Orca처럼 Agent 실행·관찰 기능을 가진 도구가 이미 있다. Agent HQ의 고유 가치(다중 Agent 통합 관찰, 3D Office, 일반 사용자 대상 등)를 명확히 하지 않으면 중복 기능 개발 위험.
- Proposed Solution: OQ-5 결정, RES-006(기존 도구 조사), 기존 도구를 데이터 소스로 연동하는 방안 검토.
- Verification Method: product.md에 포지셔닝 Confirmed 기록.
- Related Tasks: RES-006
- Created / Updated: 2026-11-22

### RSK-011 — 문서와 코드 불일치 / 미검증 사실의 문서화
- Status / Priority / 범위: Mitigating / M×H / Process
- Description: Agent가 확인하지 않은 명령·API를 문서에 쓰거나, 코드 변경 후 문서를 갱신하지 않을 수 있다.
- Proposed Solution: 상태 라벨(Confirmed/Proposed/Unknown), quality-gates를 명령의 단일 원천으로 지정, G9 문서 Gate, 리뷰 체크리스트. 링크 검사 자동화(TD-002).
- Verification Method: 마일스톤 Retrospective에서 불일치 건수 확인.
- Related Tasks: HQ-004
- Created / Updated: 2026-11-22

### RSK-012 — 병렬 Agent 간 충돌
- Status / Priority / 범위: Mitigating / M×M / Process
- Description: 여러 Worker가 같은 파일·공용 설정을 수정하거나 서로 다른 설계 가정을 할 수 있다.
- Proposed Solution: 파일 소유권 선언, 계약 선행, 쓰기 Worker별 worktree 분리, 공용 파일은 Coordinator 단독 ([agent-workflow §3](../agents/agent-workflow.md#3-execution-control)).
- Verification Method: 통합 시 `git diff --stat`과 선언 범위 대조.
- Related Tasks: 전체
- Created / Updated: 2026-11-22

### RSK-013 — 3D Office 성능·범위 비대화
- Status / Priority / 범위: Open / M×M / Product
- Description: 3D 화면은 에셋·성능·접근성 비용이 크고 범위가 쉽게 커진다.
- Proposed Solution: Projection 계약 고정 후 착수(M4), RES-004에서 목표 수준(OQ-6) 결정, 저사양 대체 뷰.
- Verification Method: RES-004 결과와 M4 범위 승인.
- Related Tasks: RES-004
- Created / Updated: 2026-11-22

### RSK-014 — 개발 환경 재현성 부재
- Status / Priority / 범위: Open / M×H / Process
- Description: 현재 Node·pnpm 버전 고정 파일, lockfile, `.gitignore`, 환경 변수 예시가 없다. Agent·사람마다 다른 환경에서 결과가 달라질 수 있다.
- Proposed Solution: HQ-003에서 버전 고정(`packageManager` 필드, `.nvmrc` 또는 동등 수단), lockfile, `.gitignore`, `.env.example`, README 실행 절차.
- Verification Method: 새 클론에서 README 절차만으로 HQ-003의 통합 Gate 명령 통과.
- Related Tasks: HQ-003
- Created / Updated: 2026-11-22
