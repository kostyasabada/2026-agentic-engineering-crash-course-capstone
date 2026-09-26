# Review: add-realtime-chat-room-1-2

## Round 1

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker.
- Date: 2026-09-26.
- Reviewed snapshot: `snapshot.txt` in this directory (revision 1, base commit `36275d4`, 14 SHA-256 entries: 12 deliverables plus `implementation.md` and `checks.txt`). `sha256sum -c` from the repository root: all 14 `OK`, exit 0. This `review.md` is not part of the snapshot.
- Read: `AGENTS.md`, `docs/review-process.md`, task 1.2 in `openspec/changes/add-realtime-chat-room/tasks.md`, `design.md` D1–D6 (P1–P22 accepted), `implementation.md`, `checks.txt`, `snapshot.txt`, `git diff 36275d4` (`package.json`) and every new file: `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/server/config.ts`, `src/server/config.test.ts`, `server.ts`, `e2e/fixtures/chat-server.ts`, `e2e/smoke.spec.ts`. Also read the relevant installed library code: `node_modules/engine.io/build/server.js` (6.6.11: `attach`, `handleRequest`, `handleUpgrade`), `node_modules/socket.io/dist/index.js` (4.8.4: `initEngine`, `attachServe`), `node_modules/next/dist/server/next.js` (`setupWebSocketHandler`, `getUpgradeHandler`), `node_modules/next/dist/server/next-server.js` (`handleUpgrade`), `node_modules/next/dist/server/lib/router-server.js` (`upgradeHandler`, `uncaughtException` handler).

### Criteria

| Criterion | Result |
|---|---|
| Eight scripts exactly as D5 | Met. `package.json` diff adds `dev`, `build`, `start`, `lint`, `typecheck`, `test:unit`, `test:e2e`, `test:e2e:dev` byte-identical to D5; `openspec` kept; no `check`/`check:loop` (task 1.3). |
| `tsconfig.json` strict | Met (`strict`, `noUncheckedIndexedAccess` per P2). |
| `eslint.config.mjs` with `react/no-danger` | Met. `core-web-vitals` + `typescript` (P12), `react/no-danger: error`; the maker's `--print-config` and `--stdin` probe show the rule is active. The `rules-of-hooks` override is scoped to `e2e/**` only, with the triggering lint failure recorded. |
| `vitest.config.ts` | Met (`environment: 'node'`, `src/**/*.test.ts` + `scripts/**/*.test.ts`, no `passWithNoTests`). |
| `playwright.config.ts` per D6/P15 | Met, every P15 value checked: `testDir: 'e2e'`, `testMatch: '**/*.spec.ts'`, one `chromium` project (Desktop Chrome), `workers: 1`, `fullyParallel: false`, `retries: 0`, `forbidOnly: !!process.env.CI`, `timeout: 30_000`, `expect.timeout: 5_000`, list + html (`open: 'never'`) reporters, `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, no `webServer`. |
| App Router shell with page title | Met. Both files are Server Components (P3); `metadata.title` "Chat room" and matching `<h1>`. |
| `config.ts` with red-first tests (defaults, invalid PORT) | Met. 23 meaningful tests (defaults, empty = unset, explicit values, range limits, 9 invalid PORT values, IPv6 with/without brackets, 7 invalid HOST values, `hostForUrl`). None is tautological: each asserts concrete parsed values or a `ConfigError` whose message names the variable. Red runs recorded (missing module, then a throwing stub: 23/23 failed) before green. |
| `server.ts` Next + Socket.IO, `destroyUpgrade: false` | Met (see review of the dispatcher below). |
| Fixture with `E2E_SERVER_MODE=prod\|dev` | Met. Invalid values throw. |
| E2E smoke through the custom server | Met. The fixture spawns `tsx server.ts`, not `next start`; the test's `GET /socket.io/?EIO=4&transport=polling` → `0{"sid":` assertion can only pass on the custom server. |
| Five commands run real checks, exit 0 | Met; independently re-run (below). |
| N22 / N23 extra asks | Met. Both dispatchers are single insertion points ahead of engine.io and Next; no policy implemented. Unbracketed and bracketed IPv6 `HOST` accepted and stored unbracketed; `hostForUrl` brackets for URLs; the maker also ran `HOST=::1` manually. |

### Review of `server.ts` routing

- `createServer()` has no listeners, so `removeAllListeners('request'|'upgrade')` after `io.attach()` removes exactly engine.io's two listeners (engine.io `attach` lines 674–713). With `serveClient: false`, Socket.IO adds no `attachServe` request listener. engine.io's `close` and `listening` (`init`) listeners stay. Nothing else relies on the removed listeners.
- `isSocketIoRequest` uses the same prefix test as engine.io's `check()` (`path === req.url.slice(0, path.length)` with `/socket.io/`), so routing is equivalent to engine.io's own.
- `io.engine.handleRequest` and `handleUpgrade` are the public entry points that engine.io's listeners call. They apply middlewares and `verify`, so a later `allowRequest` will still run.
- Next 16.3.6 registers its own `upgrade` listener on the first HTTP request (`setupWebSocketHandler`). It handles dev HMR and leaves unmatched upgrades alone (`router-server.js` "custom WS server may be listening on the same path"). `app.getUpgradeHandler()` resolves to the empty `NextNodeServer.handleUpgrade`. The maker's description in `implementation.md` is accurate.
- Independent probe (production and development): Socket.IO over `websocket` only connects; default transports upgrade to `websocket`; `GET /` returns 200.

### Findings

1. **Non-blocking (correctness, recommended fix): a listen failure exits with code 0.** `server.ts:62` has no `error` listener on `httpServer`. Next's router server installs `process.on('uncaughtException', logError)` (`node_modules/next/dist/server/lib/router-server.js:650`), which only logs. So `EADDRINUSE` (or `EACCES`) is logged as `⨯ uncaughtException`, and then the process exits with **code 0** because nothing is listening. Reproduced: with port 3599 already held, `NODE_ENV=production PORT=3599 node node_modules/tsx/dist/cli.mjs server.ts` printed `Error: listen EADDRINUSE ... 127.0.0.1:3599` and exited 0 after 1 s. This contradicts the intent of `main().catch(... process.exit(1))` (`server.ts:68-71`), and `npm start` or `npm run dev` would report success on a failed start. The E2E fixture is not affected: it treats any early exit as failure (`chat-server.ts:79-85`). Suggested fix: `httpServer.once('error', (e) => { console.error(e); process.exit(1) })` before `listen`. The maker's evidence does not mention this case.
2. **Non-blocking (resource, already documented by the maker): unmatched upgrades stay open indefinitely.** In both modes, a raw upgrade to `/not-socketio` got 0 bytes and was still open after 3 s (my probe closed it). `server.ts:56` forwards it to Next's no-op upgrade handler, and Next's own listener ignores it; nothing ends the socket and the HTTP server has no timeout for upgraded sockets. In development this is expected for non-HMR paths. In production, any client can hold sockets open. The impact is low for a server bound to `127.0.0.1`. `implementation.md` records this limitation. Recommend that task 4.2's upgrade policy destroys every non-Socket.IO upgrade in production (and unmatched ones in development).
3. **Non-blocking (robustness, fixture): SIGKILL fallback does not reach the grandchild.** `chat-server.ts:94-95` signals only the `tsx` CLI. I confirmed that SIGTERM to the CLI relays and ends the `server.ts` child. SIGKILL cannot be relayed, though, so if SIGTERM ever hangs longer than 5 s, the SIGKILL leaves the real server process orphaned on the port. Spawning with `detached: true` and killing the process group (`process.kill(-pid, ...)`) would close this gap. Related minor points (the free-port race is already noted by the maker): `waitUntilReady` (`chat-server.ts:104`) has no per-request timeout, so a hung `fetch` can overrun the 60 s deadline until the fixture timeout (70 s) fires. If a foreign process wins the port race and answers 200, readiness could succeed against the wrong server before the child exits.
4. **Non-blocking (evidence hygiene): trailing whitespace in `checks.txt:545`** (`HMR websocket -> error ` is verbatim output). `git diff --check` is clean now only because the file is untracked. `git diff --no-index --check /dev/null <file>` over all untracked files flags exactly this line, so `git diff --cached --check` will flag it once the file is staged. The whitespace is verbatim output, so either accept it or note it at commit time. Do not edit it silently.
5. **Observation, no action:** `destroyUpgrade: false` (`server.ts:26`) has no runtime effect after the listener takeover. The maker says so explicitly and keeps it per D2 and the task. This is acceptable.

No over-engineering found beyond need. The fixture's `start()`/`stop()` restart API is required by D6 for later tasks.

### Evidence honesty

- Red-first order is plausible and internally consistent. In the timestamps, unit red 1 (10:19:49, `Cannot find module './config'`) and red 2 (10:19:58, stub body shown by `cat` in the same command, 23/23 failed) come before green (10:20:18), and E2E red (10:20:42/10:20:49, `server.ts` missing; the build shows only `Route (pages) /404`) comes before the E2E greens. The failed lint attempt is kept. So is the first manual check that left a server running, with a hand-written cleanup note that is labelled as such.
- Exit codes come from `rec.sh`'s `$?` (the full body is included). Bodies of `manual-server-check.sh` (final version, plus a description of the first version) and `upgrade-check.mjs` are included. Commands are recorded literally.
- My independent reruns match the recorded results: the same 23 tests, and the same one-test E2E pass in both modes.
- Limitation: I cannot independently prove the chronology of file writes between recorded runs. The judgement rests on timestamps and the recorded outputs.

### Independent checks (run by the checker, 2026-09-26, `PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH`, from `submissions/kostyasabada/` unless noted)

| Command | Result |
|---|---|
| `grep -E '^[0-9a-f]{64}  ' .../snapshot.txt \| sha256sum -c` (repo root) | 14 × `OK`, exit 0 |
| `node --version` | v24.21.0 |
| `npm run lint` | exit 0, no output from ESLint |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | exit 0, 1 file, 23 passed (Vite `configLoader` CJS/ESM notice printed, as recorded by the maker) |
| `npm run test:e2e` | exit 0: `next build` (`✓ Compiled successfully`, `Route (app)` `/`, `/_not-found`), then `✓ 1 [chromium] › e2e/smoke.spec.ts:3:5 › the chat page loads through the custom server`, `1 passed (1.7s)`. Chromium launched; no sandbox block. |
| `npm run test:e2e:dev` | exit 0, `1 passed (2.3s)` |
| `pgrep -af "server\.ts\|next-server\|ms-playwright\|tsx"` after the E2E runs | no leftover processes |
| Manual probe script (scratchpad, outside the repo) against `NODE_ENV=production` and `development` servers started via `node node_modules/tsx/dist/cli.mjs server.ts` | Socket.IO `websocket` connect OK; default transports upgrade to `websocket`; `GET /` 200; raw non-Socket.IO upgrade still open after 3 s with 0 bytes (finding 2). My first cleanup attempt signalled the wrong PID (the `setsid` wrapper). The two leftover CLI processes (65721, 65774) were then sent SIGTERM, which also ended their `server.ts` children; afterwards no `server.ts` process remained. |
| Port held by another process, then `NODE_ENV=production PORT=3599 timeout 20 node node_modules/tsx/dist/cli.mjs server.ts` | `Error: listen EADDRINUSE`, `⨯ uncaughtException`, **exit 0** after 1 s (finding 1); no leftover process |
| `git status --short --untracked-files=all` (repo root) | Only `submissions/kostyasabada/` paths: `M package.json` plus the new files listed in the snapshot and the evidence files; no build or test output |
| `git check-ignore -v .next next-env.d.ts test-results playwright-report data` | All ignored by `submissions/kostyasabada/.gitignore` (the paths exist locally) |
| `git diff --check` (repo root) | exit 0, no output (tracked changes only) |
| `git diff --no-index --check /dev/null <f>` for each untracked file | only `checks.txt:545` trailing whitespace (finding 4) |
| `git log --oneline -1` | `36275d4 chore: switch to TypeScript 6 and ESLint 9, install app dependencies (task 1.1)` |

No files in the repository were modified by the checker other than this `review.md`; nothing was staged or committed; no checkbox was ticked. Scratch files are in the session scratchpad only.

### Limitations

- I did not run a mutation test on the repository files (the checker must not modify deliverables). I judged test meaningfulness by reading the tests and the recorded red runs.
- HMR in development was not re-probed by the checker. The maker's recorded manual check showed `HMR websocket -> open`.
- The Next.js dev lock file and dev/prod `distDir` interaction are left to task 1.3, as the task list says.

### Verdict

**accepted** — every task 1.2 acceptance criterion is met, the five required commands run real checks and exit 0 when rerun independently, and the evidence is honest and complete. Findings 1–4 are non-blocking. Finding 1 (exit code 0 on listen failure) is a small real defect and is worth fixing now or tracking for task 4.2, where `server.ts` gains shutdown handling. Findings 2 and 3 are inputs for task 4.2 and later E2E restart tasks.

## Round 2

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker (the same checker as round 1).
- Date: 2026-09-26.
- Reviewed snapshot: `snapshot.txt` revision 2 (base `36275d4`, 15 entries, which add `e2e/startup.spec.ts`). `sha256sum -c` from the repository root: 15 × `OK`, exit 0. `review.md` is not part of the snapshot.
- Read: the "Round 2" sections of `implementation.md` and `checks.txt` (lines 830–1668), the revision 2 `snapshot.txt`, and the full current `server.ts`, `e2e/fixtures/chat-server.ts`, and `e2e/startup.spec.ts`. Unchanged files keep their revision 1 hashes (verified by `sha256sum -c`).

### Resolution of round 1 findings

1. **Finding 1 (listen failure exited 0): resolved.**
   - Fix: `server.ts:65-68` registers `httpServer.once('error', …)` before `listen()`. It logs "Could not listen on <host>:<port>" and calls `process.exit(1)`.
   - Manual reproduction by the checker: with port 3598 held by a plain TCP server, `PORT=3598 timeout 30 npm run start` exited 1 and so did `npm run dev`, both printing `Could not listen on 127.0.0.1:3598: Error: listen EADDRINUSE`.
   - Red→green evidence is genuine and in order:
     - `port-taken.sh` printed `exit code: 0` (10:34:22), then `1` after the fix (10:34:32).
     - An early test version failed with `Received: 0` before the fix.
     - With the listener temporarily removed (`grep -c "once('error'" server.ts` → `0` recorded), the final test failed in production (`Received: 0`) and in development (first a 30 s timeout, then `Received: "still running"` with the bounded wait).
     - The restore was recorded (`grep -c` → `1`), and I confirmed that the final `server.ts` contains the listener (`grep -c` → 1; hash matches the snapshot).
   - The maker also found and disclosed that development mode did not exit at all before the fix.
   - Test: `e2e/startup.spec.ts` checks `EADDRINUSE` in the output and exit code 1 in both modes. It is robust:
     - The exit wait is bounded (20 s, below the 30 s test timeout).
     - `finally` sends SIGKILL to the whole process group, closes the holder, and removes the temporary directory.
     - The `exit` listener is attached synchronously after the spawn, so the exit event cannot be missed.
     - The holder binds the same `127.0.0.1` address the server uses. The port race is only theoretical: the port comes from `freePort()` and is taken by the holder right away.
     - The uncleared 20 s timer does not delay the run (whole `test:e2e:dev` took 4 s).
     - Running the startup test first and then the smoke test in dev mode passed. The dev server that exits through `process.exit(1)` leaves no stale `.next/dev/lock` behind (no lock file afterwards).
2. **Finding 2 (unmatched upgrades left open): deferred to task 4.2 by the coordinator.** It is recorded under the open issues in `implementation.md` with the recommendation. It is not a task 1.2 criterion, so the deferral is acceptable.
3. **Finding 3 (SIGKILL fallback could orphan the grandchild): resolved.**
   - Fix: `spawnServerProcess` uses `detached: true` (`chat-server.ts:56-69`). `stop()` sends SIGTERM to the group, waits until the group is empty, then sends SIGKILL to the group and waits again (`chat-server.ts:122-134`). ESRCH is ignored (`chat-server.ts:30-36`). A `process.on('exit')` hook sends SIGKILL to the group as a last resort (`chat-server.ts:110, 126, 137-139`). Readiness requests use `AbortSignal.timeout(5000)` (`chat-server.ts:145-147`).
   - The maker's `forced-kill-check.mts` shows the gap before the fix: with the CLI frozen, `server.ts` was left running after `stop()`. After the fix there is no leftover in either freeze mode, repeated after the refactor. The body is included.
   - Side effects checked by the checker:
     - Ctrl+C: I started `npx playwright test e2e/smoke.spec.ts` in dev mode in its own session and sent SIGINT to the runner's process group during fixture startup (after 0.9, 1.0, 1.1, and 1.3 s). The runner exited at once. The server group was still present about 1 s later and gone after about 3 s in every trial, because the worker finishes the fixture teardown after the runner exits. A later `npm run test:e2e:dev` passed, and no dev lock was left.
     - A hard kill of the worker (SIGKILL) would leave the group running. The maker discloses this (it was also true before the change). I did not test it.
     - The disclosure in `implementation.md` ("Detached process groups and Ctrl+C") is accurate. It does not mention that the server can outlive the runner by a few seconds; that is harmless.
4. **Finding 4 (trailing whitespace in `checks.txt:545`): resolved.** The line now ends with a visible `⟨trailing space⟩` marker (confirmed with `cat -A`), with a hand-written note at `checks.txt:833-837`. The round 2 `rec.sh` marks trailing whitespace automatically, and its body is included. The change to a round 1 line is disclosed, not silent.

### New findings (round 2)

No blocking findings.

- **Non-blocking (nit): the holder has no error handler.** `e2e/startup.spec.ts:19`: `holder.listen(...)` has no `error` handler. If another process took the port between `freePort()` and `listen`, the worker would get an uncaught `EADDRINUSE` instead of a clear test failure. This is very unlikely in a local single-worker run. No action needed.
- **Observation, no action:** Playwright exited 0 after SIGINT in my interrupt trials. This is Playwright's behavior, not the maker's code, but it matters if a script treats an interrupted run as success.

No regressions found:
- The smoke test, lint, typecheck, and unit tests are unchanged and green.
- The new exports (`spawnServerProcess`, `serverMode`, `freePort`, `ChatServerProcess`) are used by `startup.spec.ts` and the maker's checks.
- The proportionality is fine: the fixture changes are small, and the startup test is the minimal automated regression check for finding 1.

### Evidence honesty (round 2)

- Every attempt is kept, including failed ones:
  - the `.ts` top-level-await failure;
  - the forced-kill run before the fix, which showed the orphan;
  - the three dev-mode failures caused by the dev lock, and two runs with temporary DEBUG output that are labelled as such;
  - the 30 s timeout run that left a server running, with the recorded group-kill cleanup;
  - the versions of the startup test and helpers, described as differences.
- Exit codes come from `rec.sh`. The full round 2 bodies of `rec.sh`, `port-taken.sh`, and `forced-kill-check.mts` are included.
- Limitation (same as round 1): the chronology of file edits between entries cannot be proven independently.

### Independent checks (round 2; `PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH`, from `submissions/kostyasabada/` unless noted)

| Command | Result |
|---|---|
| `grep -E '^[0-9a-f]{64}  ' …/snapshot.txt \| sha256sum -c` (repo root) | 15 × `OK`, exit 0 |
| `grep -c "once('error'" server.ts` | `1` |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | exit 0, 23 passed |
| `npm run test:e2e` | exit 0 (build, then `✓ smoke.spec.ts:3:5`, `✓ startup.spec.ts:16:5`, `2 passed (2.1s)`; 6 s in total) |
| `npm run test:e2e:dev` | exit 0, `2 passed (3.1s)`; 4 s in total |
| `pgrep -af "server\.ts\|next-server\|ms-playwright"` after the runs | no leftover processes |
| `E2E_SERVER_MODE=dev npx playwright test e2e/startup.spec.ts`, then `… e2e/smoke.spec.ts` | both exit 0, `1 passed`; no `.next/dev/lock` left |
| Port 3598 held by a TCP server, `PORT=3598 timeout 30 npm run start` / `npm run dev` | exit 1 / exit 1, `Could not listen on 127.0.0.1:3598: Error: listen EADDRINUSE` |
| SIGINT to the Playwright runner group during dev fixture startup (5 trials at 0.9–1.3 s; 2 more at 1.6 and 2.2 s arrived after the test had passed) | runner exit 0; the server group was gone within about 3 s every time; no leftovers |
| `npm run test:e2e:dev` right after an interrupt trial | exit 0, 2 passed |
| `git status --short --untracked-files=all` (repo root) | only `submissions/kostyasabada/` paths (the snapshot files plus the evidence files including `review.md`); no build or test output |
| `git diff --check` (repo root) | exit 0 |
| `git diff --no-index --check /dev/null <f>` for each of the 16 untracked files | no problems (all exit 1 = differences only) |
| `git log --oneline -1` | `36275d4 chore: switch to TypeScript 6 and ESLint 9, install app dependencies (task 1.1)` |

Final process check after all runs: no `server.ts`, Next, or Playwright processes left. The checker changed only `review.md` (this section); nothing was staged or committed, and no checkbox was ticked.

### Limitations (round 2)

- I did not test a SIGKILL of the Playwright worker (the orphan case the maker disclosed).
- I did not repeat the maker's forced-kill SIGSTOP check; I relied on its recorded output and on reading `stop()`.
- The interrupt trials cover SIGINT sent to the runner's process group from a script. They did not use an interactive TTY.

### Verdict (round 2)

**accepted** — findings 1, 3, and 4 are resolved and verified independently. Finding 2 is deferred to task 4.2 with a recorded recommendation. No blocking findings are new or remain. All required checks exit 0 on the revision 2 snapshot, with no leftover servers.
