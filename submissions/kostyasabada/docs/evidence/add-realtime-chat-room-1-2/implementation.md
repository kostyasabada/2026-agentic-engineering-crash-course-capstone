# Implementation: add-realtime-chat-room-1-2

## Task

Task 1.2 in `openspec/changes/add-realtime-chat-room/tasks.md`. Acceptance criteria:

1. npm scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test:unit`, `test:e2e`, `test:e2e:dev` exactly as in design D5.
2. `tsconfig.json` (strict), `eslint.config.mjs` (including `react/no-danger`), `vitest.config.ts`, `playwright.config.ts` (design D5–D6).
3. Minimal App Router shell: `src/app/layout.tsx`, `src/app/page.tsx` with the page title.
4. `src/server/config.ts` with red-first unit tests for env parsing (defaults, invalid `PORT` rejected).
5. `server.ts` serving Next.js and attaching Socket.IO (`destroyUpgrade: false`).
6. E2E server fixture `e2e/fixtures/chat-server.ts` supporting `E2E_SERVER_MODE=prod|dev`, and one E2E smoke test that the page loads through the custom server.
7. Verify: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:e2e`, `npm run test:e2e:dev` each run real checks and exit 0; the red run of the config tests is recorded.

Coordinator notes also applied: structure `server.ts` so a later Host check (tasks 4.1/4.2) can run before Socket.IO (review finding N22) without implementing it; handle unbracketed IPv6 `HOST` (N23); no `check`/`check:loop` (task 1.3), agent loop, or hook.

## Maker

Claude Code general-purpose subagent (maker), spawned by the coordinator with a scoped handoff and no full conversation history. Not staged or committed; the task checkbox is not ticked.

## Changes

- `package.json`: the eight scripts added verbatim from design D5 (the existing `openspec` script kept). No dependency changes.
- `tsconfig.json`: `strict` and `noUncheckedIndexedAccess` (P2), plus every option `next build` would otherwise add or enforce (`lib`, `allowJs`, `skipLibCheck`, `noEmit`, `incremental`, `module: esnext`, `moduleResolution: bundler`, `esModuleInterop`, `resolveJsonModule`, `isolatedModules`, `jsx: react-jsx`, the `next` plugin), and `include` with `next-env.d.ts`, `.next/types/**/*.ts`, and `.next/dev/types/**/*.ts`. `next build` and the dev server left the file unchanged. `types: ["node"]` is explicit so that Node globals (`process`, `__dirname`) do not depend on implicit `@types` inclusion or on `next-env.d.ts` (not a verified TypeScript 6 requirement: a trial without it also type-checked while `next-env.d.ts` was present). `incremental: false` avoids an untracked `tsconfig.tsbuildinfo`.
- `eslint.config.mjs`: flat config from the bundled Next.js docs (`eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`, P12), `react/no-danger: error` (D4), the docs' default ignores plus `test-results/`, `playwright-report/`, `data/`, `.agent-loop/`. `react-hooks/rules-of-hooks` is off for `e2e/**` only, because Playwright's fixture callback is named `use` and the rule reported it as a React hook (recorded lint failure in `checks.txt`).
- `vitest.config.ts`: environment `node`, `include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']` (P13), no `passWithNoTests`.
- `playwright.config.ts`: the P15 settings verbatim, no `webServer` (D6).
- `src/app/layout.tsx`, `src/app/page.tsx`: Server Components; `metadata.title` and the `<h1>` are "Chat room". The spec does not define a page title, so this text is the maker's choice. No `globals.css` yet (D4: directories and files are added by the task that needs them).
- `src/server/config.ts` + `config.test.ts`: `parseConfig(env)` returns `{ port, host, dbPath }` with defaults 3000 / `127.0.0.1` / `data/chat.sqlite` (D2). Empty values count as unset. `PORT` must be decimal digits only and between 1 and 65535. `HOST` accepts a host name or IPv4 address (letters, digits, `.` and `-`) or an IPv6 literal with or without brackets. IPv6 is stored without brackets, as `listen()` expects (`::1`, `[::1]` → `::1`; wildcard `::` accepted). Values with a port, path, credentials, or whitespace, and invalid IPv6 values, throw `ConfigError`. `hostForUrl()` brackets IPv6 for URLs (N23), and a test checks `new URL` with the result. 23 tests.
- `server.ts`: `next({ dev, hostname, port })`, `app.prepare()`, one `http.Server`, and Socket.IO created with `{ destroyUpgrade: false, serveClient: false }` and attached with `io.attach(httpServer)`. Invalid configuration exits 1 with the `ConfigError` message. See "Routing and N22" below.
- `e2e/fixtures/chat-server.ts`: Playwright fixture `chatServer`. It spawns `node <tsx/cli> server.ts` on a free port with `HOST=127.0.0.1` and a fresh temporary `CHAT_DB_PATH`. `E2E_SERVER_MODE` is `prod` (default, `NODE_ENV=production`) or `dev` (`NODE_ENV=development`); any other value throws. The fixture waits up to 60 s for `GET /` to return 200 and exposes `baseURL`, `port`, `dbPath`, `start()` (same port and DB), and `stop()` (SIGTERM, then SIGKILL after 5 s). Playwright's `baseURL` option is overridden with the fixture's URL. Early exit or a timeout fails with the server's output. The temporary directory is removed after the test.
- `e2e/smoke.spec.ts`: `GET /` returns 200, the title is "Chat room", and the `h1` is visible. `GET /socket.io/?EIO=4&transport=polling` on the same origin returns 200 with an engine.io open packet (`0{"sid":...`), which shows that Socket.IO is served by the same custom server.

### Routing and N22 (how a later Host check fits)

`io.attach()` adds engine.io's own `request` and `upgrade` listeners, and these would run before anything else. `server.ts` creates the `http.Server` without listeners, attaches Socket.IO, and then removes the `request` and `upgrade` listeners (engine.io's `listening`/`close` listeners stay). It installs two dispatchers. Each is marked as the single insertion point for the per-request or per-upgrade policy of task 4.2. The dispatchers send `/socket.io/` paths to `io.engine.handleRequest` / `io.engine.handleUpgrade` and everything else to Next.js. `serveClient: false` means Socket.IO adds no static-file listener, so no other listener is removed. The Host/Origin policy is not implemented.

After the takeover, `destroyUpgrade: false` has no runtime effect, because engine.io's upgrade listener has been removed. It is kept as D2 and the task require: if the takeover were removed, Socket.IO would still not end upgrades it does not own.

### Version-specific facts relied on (Next.js 16.3.6, read in `node_modules/next`)

- Custom server API and options (`dev`, `hostname`, `port`, `getRequestHandler`, `prepare`): `node_modules/next/dist/docs/01-app/02-guides/custom-server.md`.
- ESLint flat config with `eslint-config-next/core-web-vitals` and `/typescript`: `.../05-config/03-eslint.md`.
- `next dev` output goes to `.next/dev`, `next build` output to `.next`, so dev and build can run concurrently: `.../06-cli/next.md` and `.../upgrading/version-16.md`. Observed: after both E2E modes, `.next/` and `.next/dev/` both exist, and prod → dev → prod runs all passed (`checks.txt`). Task 1.3 checks this formally.
- `next-env.d.ts` imports `.next/types/*` after a build and `.next/dev/types/*` after a dev run (observed). `npm run typecheck` passed in both states.
- In `node_modules/next/dist/server/next.js`, `NextCustomServer.getRequestHandler()` registers Next's own `upgrade` listener on `req.socket.server` on the first request (`setupWebSocketHandler`). That listener handles dev HMR (`/_next/hmr`) and ignores unmatched upgrades ("custom WS server may be listening on the same path"). `app.getUpgradeHandler()` calls `NextNodeServer.handleUpgrade()`, which is empty in 16.3.6. `server.ts` still forwards non-Socket.IO upgrades to `app.getUpgradeHandler()` as D2 describes, but that call does nothing in this version. HMR works through Next's self-registered listener (manual check: the HMR WebSocket opened in dev).
- Next's dev cross-site check for HMR allows `localhost` and the `hostname` passed to `next()`. `server.ts` passes the configured `HOST`, so the fixture's `127.0.0.1` origin is allowed.

## Design deviations

- None in the scripts or configs.
- Clarification, not a change: the fixture runs `tsx server.ts` through `node <tsx/cli>` (`require.resolve('tsx/cli')`) rather than `node_modules/.bin/tsx`. This is the same tsx CLI. A manual check showed that SIGTERM to the tsx CLI also ends its `server.ts` child.

## Snapshot

`snapshot.txt` in this directory: SHA-256 of all created or changed deliverables, including this file and `checks.txt`, against base commit `36275d4`.

## Checks (details and outputs in `checks.txt`)

Runtime `node --version` → v24.21.0 (npm 11.19.0), via `PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH`. Date 2026-09-26.

| Step | Command | Result |
|---|---|---|
| Red 1 (config) | `npm run test:unit` before `config.ts` existed | exit 1, `Cannot find module './config'` |
| Red 2 (config) | `npm run test:unit` with a stub `config.ts` that throws | exit 1, 23/23 tests failed |
| Green (config) | `npm run test:unit` after the implementation | exit 0, 23 passed |
| Red (E2E prod) | `npm run test:e2e` before `server.ts`/pages existed | build exit 0 (empty app), test failed: `ERR_MODULE_NOT_FOUND ... server.ts`, exit 1 |
| Red (E2E dev) | `npm run test:e2e:dev`, same state | exit 1, same error |
| Lint attempt | `npm run lint` | exit 1: `react-hooks/rules-of-hooks` on the fixture's `use`, fixed with the `e2e/**` override |
| Rule probe | JSX with `dangerouslySetInnerHTML` piped to `eslint --stdin` | exit 1, `react/no-danger` error (expected failure, shows the rule is active) |
| Manual | `npm run dev` with `PORT=3461`: `GET /`, Socket.IO client with `transports: ['websocket']`, WebSocket to `/_next/hmr` | 200; Socket.IO connected over websocket; HMR WebSocket opened. The first attempt left the server running because of a helper issue; cleanup and the fixed helper are recorded |
| Manual | `npm run start` with `PORT=3462`, same probes | 200; Socket.IO websocket connected; HMR WebSocket did not open (expected in production) |
| Manual | `PORT=abc npm run start` | exit 1, `ConfigError: Invalid PORT "abc"` |
| Manual | `HOST=::1 PORT=3463 npm run start`, `curl http://[::1]:3463/` | "Ready on http://[::1]:3463", 200 |
| Final | `npm run lint` | exit 0 |
| Final | `npm run typecheck` | exit 0 |
| Final | `npm run test:unit` | exit 0 (1 file, 23 tests) |
| Final | `npm run test:e2e` | exit 0 (`next build`, then 1 passed) |
| Final | `npm run test:e2e:dev` | exit 0 (1 passed) |
| Final | `npm run typecheck` (after dev run), `npm run test:e2e` (after dev run) | exit 0, exit 0 |
| Final | leftover server processes | none |

Chromium launched normally in this session; the E2E runs hit no sandbox block.

## Known limitations / open issues

- Vite 8 prints a notice for every Vitest run: `vitest.config.ts` uses ESM syntax in a file loaded as CommonJS (no `"type": "module"` in `package.json`). It is a warning only (exit 0). The task names the file `vitest.config.ts`, so it was not renamed to `.mts`.
- In production, a non-Socket.IO upgrade (for example `/_next/hmr`) is neither handled nor closed, because Next's upgrade handler does nothing there. The socket stays open until the client gives up. This matches plain Next behavior. Task 4.2's upgrade policy may close such sockets.
- For task 4.2: Next's self-registered `upgrade` listener (see above) is added after the dispatcher and also sees every upgrade. An upgrade policy in the dispatcher runs first and can reject by answering 403 and destroying the socket. Next's listener then runs on a destroyed socket. Task 4.2 should confirm this in its tests.
- `next-env.d.ts` (git-ignored, generated) points at `.next/types` or `.next/dev/types`. If it exists but `.next/` was deleted, `npm run typecheck` fails until the next build or dev run. On a fresh checkout the file does not exist and `typecheck` passes.
- Graceful shutdown on `SIGINT`/`SIGTERM` is not implemented (task 4.2). The fixture's SIGTERM ends the process with the default signal behavior.
- `CHAT_DB_PATH` is parsed but not used yet (task 3.1/4.2).
- The Next.js dev lock file `.next/dev/lock` was not examined. Only one dev server runs at a time in the current tests. Restart scenarios (task 5.3) may need to confirm that a restarted dev server is not blocked by it.
- The E2E free-port probe (listen on port 0, close, reuse) has a small race window; accepted for a local single-worker run.

## Round 2 (fixes for `review.md` round 1 findings)

The same maker fixed the coordinator's selection of findings. The round 1 sections above describe revision 1 and are kept unchanged. Where round 2 supersedes them, this section says so.

### Changes

1. **Finding 1: a failed listen exited with code 0.** `server.ts` now registers `httpServer.once('error', ...)` before `listen()`. The handler logs "Could not listen on <host>:<port>" with the error and exits with code 1. Without it, Next's `uncaughtException` handler only logged the error, and the process exited 0. Development mode was worse: the process kept running (watchers) and did not exit at all.
   - Automated test `e2e/startup.spec.ts`: it holds a free port with a plain TCP server, spawns `tsx server.ts` on that port in the current `E2E_SERVER_MODE`, and expects `EADDRINUSE` in the output and exit code 1.
   - Why E2E and not Vitest: the check needs a real `server.ts` start, which needs `app.prepare()`, and production mode needs a `next build`. `test:e2e` provides the build, and both E2E modes then cover the check. The test does not use the browser.
   - It uses Playwright's base `test`, not the extended one. Playwright resolves `baseURL` for every test through its automatic context-option fixtures. The extended `test` overrides `baseURL` with the `chatServer` fixture, so importing it would start a chat server here as well. In dev mode, that server holds Next's `.next/dev/lock`, and the server under test then stops with "Another next dev server is already running" before it tries to listen. This happened in recorded runs and was diagnosed with temporary debug output.
   - The wait for the process to exit is limited to 20 s, below the 30 s test timeout. On a test timeout, Playwright abandons the test body, and an earlier version therefore left a server running (cleaned up and recorded).
2. **Finding 3: the fixture's SIGKILL fallback could orphan the real server.**
   - The spawn is now the exported `spawnServerProcess()` in `e2e/fixtures/chat-server.ts`, with `detached: true`, so every server gets its own process group.
   - `stop()` sends SIGTERM to the whole group (`process.kill(-pid)`) and waits until no process in the group is left. After 5 s it sends SIGKILL to the group and waits again.
   - A `process.on('exit')` hook kills the group with SIGKILL if the test process exits without calling `stop()`.
   - Readiness requests now have a 5 s per-request timeout (`AbortSignal.timeout`).
   - `ChatServerProcess`, `freePort` and `serverMode` are exported for `startup.spec.ts` and the forced-kill check.
3. **Finding 4: trailing whitespace in `checks.txt`.** Line 545 (verbatim `HMR websocket -> error ` with one trailing space) now ends with a visible marker `⟨trailing space⟩` after the space, and a note in `checks.txt` explains this. The round 2 `rec.sh` marks trailing whitespace the same way (`⟨trailing whitespace⟩`).
4. **Finding 2** (unmatched upgrades left open) is unchanged, as the coordinator decided. It stays listed under the open issues below for task 4.2.

### Red-first evidence (details in `checks.txt`, round 2 section)

- **Finding 1:**
  - `port-taken.sh 3598` (port held, `npm run start`) printed `EADDRINUSE`, then `⨯ uncaughtException`, and `npm run start exit code: 0` before the fix. After the fix it printed "Could not listen..." and `exit code: 1`. The same check in dev after the fix also gave exit code 1.
  - The first version of the automated test failed with `Expected: 1, Received: 0` before the fix.
  - With the error listener temporarily removed from `server.ts`, the final test failed in production (`Received: 0`) and in development. The development run first hit the 30 s timeout with an unbounded wait, then got `Received: "still running"` with the bounded wait. The listener was then restored, and a `grep -c "once('error'" server.ts` result of 1 is recorded.
- **Finding 3:** `forced-kill-check.mts` drives the real `ChatServerProcess`, freezes one process with SIGSTOP so that SIGTERM cannot end it, calls `stop()`, and lists the server processes that remain.
  - Before the fix, freezing the real `server.ts` process left no orphan, because the tsx CLI itself force-kills a child that does not react to the relayed signal (read in `tsx/dist/cli.mjs`).
  - Before the fix, freezing the tsx CLI gave `stop()` returning after 5013 ms with the `server.ts` process left running, an orphan. The check then killed it and exited 1.
  - After the fix, freezing the CLI gave 5080 ms with no leftover, and freezing the grandchild gave 102 ms with no leftover. Both were repeated after the final fixture refactor, with 5082 ms and 100 ms and no leftovers.

### Round 2 checks (final working tree)

| Command | Result |
|---|---|
| `node --version` | v24.21.0 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | exit 0, 23 passed |
| `npm run test:e2e` | exit 0: `next build`, then 2 passed (smoke, startup) |
| `npm run test:e2e:dev` | exit 0, 2 passed |
| leftover server processes after the runs | none |
| trailing-whitespace check on every changed or untracked file | see `checks.txt` (last entries) |

### Snapshot

`snapshot.txt` is regenerated as revision 2 (base `36275d4`) and now includes `e2e/startup.spec.ts`.

### Open issues after round 2

- **Finding 2 (for task 4.2):** in production, a non-Socket.IO upgrade is neither handled nor closed and stays open indefinitely. Recommendation: task 4.2's upgrade policy destroys every non-Socket.IO upgrade in production, and unmatched ones in development.
- **Detached process groups and Ctrl+C:** because the fixture's servers now run in their own process groups, a Ctrl+C in the terminal no longer reaches them directly. They are stopped by the fixture teardown or, failing that, by the `exit` hook. A hard kill of the Playwright worker (SIGKILL) would still leave them running, as it would have before.
- **Dev lock in task 5.3:** the Next dev lock (`.next/dev/lock`) allows only one dev-mode chat server per project directory at a time. A dev-mode test cannot run two servers at once, and restart scenarios must stop the old server before starting the new one. The group wait in `stop()` makes that ordering reliable.
- **Readiness against a foreign process:** if another process wins the free-port race and answers 200 on `GET /`, readiness can still succeed against it. This was noted in round 1 and is unchanged.
- The other round 1 limitations still apply.
