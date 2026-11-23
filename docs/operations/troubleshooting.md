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

### `node -v`가 Node 26 설치 후에도 24로 나온다
- 환경: nvm, macOS zsh (2026-11-22)
- 원인: nvm의 `default` alias가 24로 남아 있다. 새 셸과 Agent 셸은 default를 쓴다.
- 해결: 저장소 루트에서 `nvm use`(`.nvmrc` = 26). Agent 셸처럼 nvm 함수가 없으면 `PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH"`. 기본값을 바꾸려면 사용자가 `nvm alias default 26`.
- 확인 방법: `node -v` → v26.x. `package.json`의 `engines`가 26 외 버전에서 설치를 거부한다 (`.npmrc` engine-strict).

### `next build` 후 `pnpm format:check`가 `apps/web/tsconfig.json`에서 실패
- 환경: Next.js 16.4.6
- 원인: Next가 build 중 tsconfig에 필요한 값(`allowJs`, `.next/dev/types` include)을 자기 형식으로 써 넣는다.
- 해결: Next가 요구하는 값을 미리 넣고 Prettier로 정리해 둔다. 이후 build는 파일을 다시 쓰지 않는다.
- 확인 방법: `pnpm build && pnpm format:check` exit 0.

### Redis가 꺼졌을 때 API 로그에 `[ioredis] Unhandled error event`가 반복된다
- 환경: ioredis 6.0.0
- 원인: Redis 클라이언트에 `error` 리스너가 없다.
- 해결: `apps/api/src/infrastructure.module.ts`의 `createRedisClient`처럼 리스너를 달고, 같은 오류는 한 번만 경고한다.
- 확인 방법: Redis를 멈춘 상태에서 `Unhandled` 로그가 0건이다.

### `prisma migrate reset`이 "invoked by Claude Code"로 거부되고, `migrate dev`가 non-interactive로 멈춘다
- 환경: Prisma 7.10.1, Claude Code에서 실행 (2026-11-22)
- 원인: Prisma가 AI Agent 실행을 감지하면 파괴적 명령(reset)을 막는다. `migrate dev`는 확인 프롬프트가 필요한 변경(예: unique 제약 추가)에서 비대화형이면 멈춘다.
- 해결: 이미 적용된 migration 폴더는 지우거나 고치지 않는다. 스키마를 바꾸면 `prisma migrate diff --from-schema <이전 스키마> --to-schema prisma/schema.prisma --script -o prisma/migrations/<timestamp>_<name>/migration.sql`로 새 migration을 만들고 `prisma migrate deploy`로 적용한다. dev DB 초기화가 필요하면 사용자에게 요청한다.
- 확인 방법: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` 결과가 빈 migration이다.

### 긴 명령이 멈춘 것처럼 보이고 Docker 명령도 응답하지 않는다
- 환경: macOS, Docker Desktop (2026-11-23)
- 원인: 실행 중에 머신이 잠자기에 들어갔다. 프로세스는 깨어난 뒤 이어서 실행된다.
- 해결: `docker info`가 응답하는지 확인한 뒤 명령을 다시 실행한다. macOS에는 `timeout` 명령이 없다.
