# Decisions (ADR)

> 목적: 중요한 제품·기술 의사결정의 기록과 이력 보존.
> 관리 책임: Architect가 작성(Proposed), 사용자가 승인(Accepted).

## 규칙

1. 파일명: `ADR-XXXX-short-description.md` (4자리 일련번호, kebab-case).
2. 상태: `Proposed` → `Accepted` | (거절 시 Deprecated) → 이후 `Deprecated` 또는 `Superseded by ADR-YYYY`.
3. **Accepted ADR은 본문을 수정하지 않는다.** 허용되는 변경: 상태 줄, 오탈자, 링크. 결정이 바뀌면 새 ADR을 만들고 양쪽에 상호 링크를 건다.
4. **Claude는 ADR을 Accepted로 만들지 않는다.** Proposed로 작성하고 사용자에게 승인을 요청한다. 승인 시 Status 줄에 승인 날짜를 기록한다.
5. ADR이 필요한 결정: 언어·런타임·DB·프레임워크 선택, Event 스키마 변경, 컴포넌트 경계 변경, 보안·데이터 정책, 외부 서비스 도입, 제품 방향 변경.
6. ADR이 필요 없는 결정: 단일 Task 안에서 되돌리기 쉬운 구현 선택 (Task 기록에 남긴다).

## 색인

| ID | 제목 | 상태 | 날짜 |
|---|---|---|---|
| [ADR-0001](ADR-0001-record-architecture-decisions.md) | ADR로 의사결정을 기록한다 | Accepted | 2026-11-22 |
| [ADR-0002](ADR-0002-event-sourced-core.md) | Event Log를 단일 진실 원천으로 하는 코어 | Accepted | 2026-11-22 |
| [ADR-0003](ADR-0003-m1-tech-stack.md) | MVP 기술 스택과 실행 형태 | Accepted | 2026-11-22 |
| [ADR-0004](ADR-0004-adopt-spec-baseline.md) | 기획 명세서 v0.1.0을 제품 기준 문서로 채택 (D-001~D-009 Confirmed) | Accepted | 2026-11-22 |
| [ADR-0005](ADR-0005-adopt-redis-bullmq.md) | MVP에 Redis + BullMQ 도입 (ADR-0003의 보류 항목 대체) | Accepted | 2026-11-22 |
| [ADR-0006](ADR-0006-external-ids-and-lenient-payloads.md) | Event 계약: 외부 ID는 `source`로, 미정의 payload 필드는 버리고 보고 | Accepted | 2026-11-22 |
| [ADR-0007](ADR-0007-local-bridge.md) | Local Bridge 구조: command hook → 소유자 전용 spool → 상주 Bridge → HQ | Proposed | 2026-11-27 |

> 요청된 구조의 `ADR-0001-example.md`는 예시 대신 실제 첫 결정(ADR 프로세스 채택)으로 작성했다. 템플릿은 아래에 있다.

## 템플릿

```markdown
# ADR-XXXX: <Title>

- Status: Proposed | Accepted (YYYY-MM-DD, 승인자) | Deprecated | Superseded by ADR-YYYY
- Date: YYYY-MM-DD
- Deciders: <사용자 / 제안 Agent>
- Supersedes: <ADR ID 또는 없음>

## Context
<배경, 현재 상황, 관련 제약>

## Problem
<결정해야 하는 질문 한 문장>

## Options Considered
### Option A — <이름>
- 장점 / 단점 / 비용 / 위험

## Decision
<선택 (Proposed 상태이면 "제안")>

## Reasons
<선택 근거. 검증된 사실과 가정을 구분>

## Consequences
<긍정적/부정적 결과, 새로 생기는 작업·부채>

## Revisit Conditions
<어떤 조건이 오면 다시 검토하는가 (측정 가능하게)>

## Related Documents
<링크>
```
