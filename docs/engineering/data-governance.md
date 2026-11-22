# Data Governance

> 목적: "Selective Storage" 제품 방향을 구체적 데이터 분류·저장·보존·마스킹 규칙으로 정의.
> 관리 책임: Architect. 정책 확정은 사용자 승인 + ADR. 상태: **Proposed** (Selective Storage 자체는 Confirmed).

## 1. 데이터 분류 (Proposed)

| 등급 | 내용 | 예 | 기본 저장 | Cloud 동기화 |
|---|---|---|---|---|
| D0 메타데이터 | 식별자, 시각, 상태, 유형, 소요 시간, 성공/실패 | `tool.completed` 의 duration | 저장 | 허용 (사용자 설정) |
| D1 구조 정보 | 도구 이름, MCP 서버 이름, 파일 경로, 명령 이름 | `Edit`, `src/a.ts` | 저장 | 경로는 해시 옵션 |
| D2 콘텐츠 | 프롬프트, Agent 응답, 파일 내용, 명령 인자 전체, 도구 출력 | | **기본 미저장** (길이·keyed 해시만 — 아래 주의) | 기본 금지 |
| D3 민감 정보 | Secret, 토큰, 개인정보 | | **저장 금지** — 마스킹 | 금지 |

사용자는 Workspace 단위로 D2 저장을 켤 수 있다 (opt-in). D3는 어떤 설정으로도 저장하지 않는다.

**해시 주의**: 짧은 Secret·프롬프트의 단순 해시는 무차별 대입으로 원문을 복원할 수 있다. D2 동일성 비교용 해시는 Workspace별 비밀 키를 쓰는 keyed 해시(HMAC 계열)로 하고, D3가 포함될 수 있는 값은 마스킹 후에만 해시한다 ([RSK-002](../operations/risks.md)).

## 2. 마스킹 (Redaction)
- 위치: **Source/Collector 단계에서 1차, Ingestion에서 2차**(방어 심층화). 저장 후 마스킹은 하지 않는다.
- 방법: 알려진 Secret 패턴(키 접두사, 고엔트로피 문자열, `Authorization` 헤더 등) 치환 + `redaction` 필드에 적용 내역(원문 없이) 기록.
- 한계: 패턴 기반 마스킹은 완전하지 않다 ([RSK-002](../operations/risks.md)). 그래서 D2 기본 미저장이 1차 방어다.

## 3. 보존과 삭제
- Event는 append-only이지만 **보존 기간 경과 또는 사용자 요청 시 Workspace/Session 단위 물리 삭제**를 지원해야 한다 (append-only와 충돌 → [RSK-004](../operations/risks.md)).
- 기본 보존 기간: Unknown (OQ — 로컬은 무제한+수동 삭제, Cloud는 정책 필요).
- 삭제 후 Projection은 재생성한다.

## 4. Local vs Cloud
- Local 데이터는 사용자 머신을 벗어나지 않는 것이 기본값이다 (NFR-001).
- Cloud 동기화는 명시적 opt-in, 등급별 필터 적용 후 전송.
- Cloud 저장 비용은 D0/D1 위주로 산정 ([RSK-007](../operations/risks.md)).

## 5. 개발 과정의 데이터
- 실제 Agent 세션 데이터를 테스트·문서·이슈에 붙일 때 D2/D3를 제거한다.
- RES-002 조사 등 실제 세션을 수집하는 실험 규칙:
  1. 저장소 밖 scratch 위치에만 저장하고 커밋하지 않는다.
  2. 분석 전에 D3(Secret 패턴)를 마스킹한다.
  3. 원문을 이슈·문서·채팅·외부 서비스에 붙여 넣지 않는다. 요약·통계만 기록한다.
  4. 실험이 끝나면 수집 파일을 삭제하고 Execution Log에 삭제 사실을 기록한다.
- **Dogfooding 주의**: 사용자 전역 설정의 Orca·iTerm2 hook이 이미 이 프로젝트의 Claude Code 세션 신호를 수집하고 있다(2026-11-22 확인). 이 프로젝트 자체의 개발 세션을 Agent HQ로 관찰하는 것은 **사용자 동의 후에만** 한다.

## 6. Open Questions
- D1 파일 경로도 민감한가? (회사명·고객명이 경로에 포함될 수 있음)
- D2 opt-in 시 암호화 저장이 필요한가?
