# ADR-0001: ADR로 의사결정을 기록한다

- Status: **Proposed** — 사용자가 Harness 구축 요청(2026-11-22, §5)에서 ADR 체계를 지시했으나, "Claude는 ADR을 Accepted로 만들지 않는다" 규칙에 따라 사용자 확인 후 Accepted로 변경한다.
- Date: 2026-11-22
- Deciders: 사용자 / 작성: Claude (Technical Lead 역할)
- Supersedes: 없음

## Context
Agent HQ는 여러 AI Agent(Claude Code, Orca worker 등)가 장기간 나누어 개발한다. Agent는 세션 간 기억이 없으므로, 결정의 이유가 문서에 없으면 이후 Agent가 같은 논의를 반복하거나 과거 결정을 모르고 뒤집을 수 있다.

## Problem
제품·기술 결정의 내용과 이유, 변경 이력을 어떻게 보존할 것인가?

## Options Considered
### Option A — ADR (Markdown, 저장소 내)
- 장점: 코드와 함께 버전 관리, Agent가 직접 읽고 쓸 수 있음, 변경 이력 보존
- 단점: 작성 규율이 필요
### Option B — 외부 도구(Notion/Confluence/Jira)
- 장점: 사람에게 친숙한 UI
- 단점: Agent 접근에 인증·연결 필요, 코드와 분리됨, 외부 서비스 연결은 승인 필요
### Option C — 기록하지 않음 (커밋 메시지·대화에 의존)
- 단점: 맥락 유실, 재논의 반복

## Decision
Option A. `docs/decisions/`에 ADR을 Markdown으로 기록한다. 규칙은 [README](README.md)를 따른다.

## Reasons
- 사용자가 ADR 체계를 명시적으로 요구했다.
- Agent가 별도 인증 없이 읽을 수 있다.
- Accepted ADR 불변 + Supersede 방식이 결정 이력을 보존한다.

## Consequences
- 중요한 결정마다 ADR 작성 비용이 든다.
- Claude는 Proposed만 작성할 수 있으므로 사용자 승인 대기가 작업 병목이 될 수 있다 → Decision Gate를 Task의 Dependencies로 명시해 관리한다.

## Revisit Conditions
- ADR 수가 많아져 검색이 어려워질 때 (예: 50개 이상) 분류 체계 추가 검토
- 팀 규모가 커져 외부 문서 도구가 필요해질 때

## Related Documents
- [decisions/README.md](README.md)
- [CLAUDE.md §5](../../CLAUDE.md)
