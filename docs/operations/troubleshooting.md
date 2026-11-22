# Troubleshooting

> 목적: 재발 가능한 문제의 증상·원인·해결법. Issue가 해결되면 재사용 가치가 있는 내용을 여기로 옮긴다.
> 관리 책임: 문제를 해결한 Agent. 확인한 해결법만 기록한다.

## 형식
```markdown
### <증상 한 줄>
- 환경: <OS, 도구 버전>
- 원인:
- 해결:
- 확인 방법:
- 관련: <ISS-XXX>
```

---

### `git worktree add` 실패: `fatal: not a valid object name: 'HEAD'`
- 환경: git 2.39.3, macOS (Darwin 23.6.0)
- 원인: 커밋이 없는 저장소. worktree는 기준 커밋이 필요하다.
- 해결: 첫 커밋을 만든 뒤 다시 시도한다 (커밋은 사용자 승인 필요). 그 전에는 Orca worker를 `--worktree current`로만 사용한다.
- 확인 방법: `git log --oneline -1`이 출력되는지 확인.
- 관련: [ISS-001](issues.md)

### Orca 명령이 "Orca is not running"류 오류를 낼 때
- 환경: Orca 1.4.256
- 원인: Orca 앱/runtime 미실행.
- 해결: `orca skills get orchestration` 가이드 기준으로 `orca open --json` 후 재시도. `runtime_access_denied`는 sandbox 차단이므로 `orca open`을 다시 하지 말고 권한을 올려 재실행한다.
- 확인 방법: `orca status`에서 `runtimeState: ready`.
- 관련: [orca-cli](../agents/orca-cli.md)
- 비고: 가이드 기재 내용이며 이 프로젝트에서 실제로 겪은 사례는 아직 없다.
