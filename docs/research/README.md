# Research

> 목적: 추가 조사·검증이 필요한 주제(RES)와 결과 기록. 결과가 결정으로 이어지면 ADR을 만든다.
> 관리 책임: Architect. 큰 조사 결과는 `research/RES-XXX-<topic>.md`로 분리하고 여기에는 요약만 둔다.
> 상태: Open | In Progress | Concluded(결과 기록) | Dropped
> 규칙: 조사에 쓴 실제 Agent 세션 데이터·로그는 저장소에 커밋하지 않는다 ([data-governance §5](../engineering/data-governance.md#5-개발-과정의-데이터)).

## 템플릿
```markdown
### RES-XXX — <Title>
- Status / Priority:
- Description: <질문>
- Impact: <답에 따라 무엇이 바뀌는가>
- Root Cause: <왜 모르는가>
- Proposed Solution: <조사 방법>
- Verification Method: <무엇이 나오면 결론인가>
- Related Tasks:
- Created / Updated:
- Result: <결론 요약 + 근거 링크>
```

## 요약

| ID | 주제 | 필요 시점 | 우선순위 | 상태 |
|---|---|---|---|---|
| RES-001 | M1 기술 스택 검증 (ADR-0003 근거) | M0 | High | Open |
| RES-002 | Claude Code 이벤트 수집 방식 | M1 중 (M2 전) | High | Open |
| RES-003 | MCP 도구 흐름 관찰 방식 | M2 | Medium | Open |
| RES-004 | 3D Office 기술과 목표 수준 | M3 | Medium | Open |
| RES-005 | 저장소·실시간 처리 부하 | M1 | Medium | Open |
| RES-006 | 기존 Agent 관찰·오케스트레이션 도구 조사 | M0~M1 | High | Open |

---

### RES-001 — M1 기술 스택 검증
- Status / Priority: Open / High
- Description: ADR-0003 제안(TS + Node 24 + pnpm, SQLite, SSE, React + Vite)이 요구사항에 맞는가? SQLite 드라이버(Node 내장 SQLite 모듈 vs 외부 패키지)의 안정성은?
- Impact: 스캐폴드(HQ-003) 전체.
- Root Cause: 아직 스택을 검증하지 않음.
- Proposed Solution: 공식 문서로 후보 버전·안정성 확인, 필요 시 scratch에서 최소 프로토타입.
- Verification Method: ADR-0003에 버전과 근거 기록, 사용자 승인.
- Related Tasks: HQ-002
- Created / Updated: 2026-11-22

### RES-002 — Claude Code 이벤트 수집 방식
- Status / Priority: Open / High
- Description: Claude Code에서 세션 시작/종료, 도구 호출, subagent 시작/종료, 오류를 어떤 방법으로 얻을 수 있는가? 후보: (a) hooks (b) OpenTelemetry 내보내기 (c) 세션 transcript 파일 (d) Agent SDK. 각 방식의 데이터 범위, 지연, 설치 방법, 비침투성.
- Impact: M2 설계, Event 스키마 v0의 적합성 (RSK-001), 전역 hook 충돌 (RSK-009).
- Root Cause: 외부 도구 인터페이스. 사용자 전역 설정에 등록된 hook 이벤트 이름만 확인함 (2026-11-22, Orca·iTerm2가 설치): Elicitation, ElicitationResult, Notification, PermissionRequest, PostCompact, PostToolBatch, PostToolUse, PostToolUseFailure, PreToolUse, SessionEnd, SessionStart, Stop, StopFailure, SubagentStart, SubagentStop, TeammateIdle, UserPromptSubmit. 각 이벤트의 payload와 의미는 검증하지 않았다.
- Proposed Solution: 설치된 버전(2.1.330)의 공식 문서 확인 → scratch 프로젝트에서 로깅 hook 스파이크 (전역 설정 수정 금지) → 신호 매핑표 작성.
- Verification Method: FR-020 필요 신호 ↔ 수집 방식 매핑표, 세션당 Event 발생량 측정값.
- Related Tasks: HQ-110 (M1 내 스파이크), M2
- Created / Updated: 2026-11-22

### RES-003 — MCP 도구 흐름 관찰 방식
- Status / Priority: Open / Medium
- Description: MCP 호출을 Agent 측 신호(hook의 tool 이름 등)로 볼 것인가, MCP 프록시로 중계할 것인가?
- Impact: M3 아키텍처, 보안(프록시는 모든 데이터를 봄).
- Proposed Solution: RES-002 결과로 MCP tool 호출이 식별 가능한지 먼저 확인 → 부족하면 프록시 방식 조사.
- Verification Method: MCP 서버·도구·소요 시간을 얻는 방법이 확정됨.
- Related Tasks: M3
- Created / Updated: 2026-11-22

### RES-004 — 3D Office 기술과 목표 수준
- Status / Priority: Open / Medium
- Description: 3D 엔진/라이브러리 후보, 에셋 전략, 성능 목표, 접근성 대체 뷰. OQ-6(장식 vs 조작 인터페이스) 결정 입력.
- Impact: M4 범위·일정, Frontend 스택 (ADR-0003 Revisit 조건).
- Proposed Solution: 후보 비교 + 프로토타입 (M3 중).
- Verification Method: M4 범위 ADR.
- Related Tasks: M4
- Created / Updated: 2026-11-22

### RES-005 — 저장소·실시간 처리 부하
- Status / Priority: Open / Medium
- Description: NFR-002/003 가정치를 단일 프로세스 + SQLite + SSE로 만족하는가?
- Impact: ADR-0002, ADR-0003 Revisit 조건.
- Proposed Solution: HQ-104/HQ-106 완료 후 시뮬레이터로 부하 생성·측정.
- Verification Method: p95 지연·처리량 측정값 기록.
- Related Tasks: HQ-111
- Created / Updated: 2026-11-22

### RES-006 — 기존 Agent 관찰·오케스트레이션 도구 조사
- Status / Priority: Open / High
- Description: 이 환경의 Orca를 포함해 Agent 관찰·오케스트레이션 도구의 기능을 조사한다. Agent HQ와 겹치는 부분, 데이터 소스로 연동할 수 있는지(예: Orca의 Run/Task/worker 상태를 CLI JSON 출력으로 읽기).
- Impact: 포지셔닝(OQ-5, RSK-010), M2 이후 Source 목록.
- Proposed Solution: 공식 문서·CLI `--help`/`--json` 출력 조사. 외부 서비스 가입은 하지 않는다.
- Verification Method: 비교표와 포지셔닝 제안을 사용자에게 제출.
- Related Tasks: (사용자 요청 시 Task화)
- Created / Updated: 2026-11-22
