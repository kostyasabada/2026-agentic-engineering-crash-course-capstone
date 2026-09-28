# Task add-realtime-chat-room-4-2 — review

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker.
- Round: 1.
- Date: 2026-09-28.
- Runtime: Node v24.21.0 (`PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`), npm 11.19.0.
- Base commit: `02b645a` (`git log --oneline -1`); uncommitted working tree, nothing staged (`git diff --cached --name-only` → 0).
- Reviewed snapshot: `snapshot.txt` (revision 1). `sha256sum -c` of its six entries: all `OK`. `checks.txt` hash at review time: `3da86021593feb841adbb8fcbda1d02214ab5ab98fa41964fc7861ab10fb09f4`. This matches the final hash the maker stated.
- Reviewed deliverables: `server.ts` (`af6c6e28…`, diff against `02b645a`), `src/server/app.ts` (`ad4cd1e8…`), `src/server/app.test.ts` (`d3e00883…`), `e2e/host-policy.spec.ts` (`7ebcc58a…`), `e2e/shutdown.spec.ts` (`f7af4947…`). Evidence: `implementation.md` (`96138b65…`), `checks.txt`, `snapshot.txt`.
- Read: `AGENTS.md`, `docs/review-process.md`, the full text of task 4.2, `design.md` D2 (P19 and its residual risks), D4, D5, D6 and the Risks section, the chat-room spec requirements "Local host and origin restriction" and "History survives a server restart", `e2e/fixtures/chat-server.ts`, and Next.js 16.3.6 `next/dist/server/next.js` (`setupWebSocketHandler`, `getUpgradeHandler`).

## Findings

| # | Severity | Location | Finding |
|---|---|---|---|
| 1 | Low (non-blocking) | `src/server/app.ts:182-195`, `server.ts:47-51` | `close()` waits for `io.close()`, which waits for the HTTP server to close. Node's `server.close()` closes only idle connections. A connection with an unfinished request is never closed. I left a TCP connection open with a partial request (headers not finished) and sent SIGTERM to the group. Both modes then logged `> Shutdown did not finish within 10000 ms` and exited with code 1 after about 10 s (checker probe below). In that case `closeDatabase` in the `finally` never runs. SQLite with `synchronous = FULL` recovers the WAL on the next open, so committed messages are not lost, and the timeout keeps the stop bounded. Normal clients do not hit this: idle keep-alive connections, Socket.IO, and tracked Next upgrades all close within about 100 ms. It is still a gap in the "graceful" path. Suggested fix: call `httpServer.closeAllConnections()` in `close()` once `io.close()` has started, or after a short grace period. Or accept the current behavior and record it. |
| 2 | Info | `src/server/app.ts:142-144, 174-175, 186` | The dispatchers are not moved strictly "unchanged apart from the Host check". The upgrade dispatcher also tracks the upgrades it passes to Next.js, so that `close()` can destroy them. This addition is needed for `close()` to finish, it is disclosed in `implementation.md`, and a test covers it ("closes upgrades that were passed to Next.js and are still open"; my mutation that removes the destroy loop is killed). No action needed. |
| 3 | Info | `/tmp/chat-e2e-onLxvB`, `/tmp/chat-e2e-W5nF5W` | Two empty temporary directories remain from the maker's interrupted runs (local times 15:25 and 15:37: the timed-out red run and the interrupt probes). No process or port is involved. When Playwright interrupts a test, the `finally` blocks that remove these directories do not run. This is expected and harmless. Mentioned only for completeness. |

No other findings. The details behind this conclusion are below.

### Coverage of task 4.2 (review focus 1)

Every listed case has a meaningful test in `src/server/app.test.ts`. The tests use raw `http.request` calls with `setHost: false` and raw TCP bytes. Polling and websocket are tested separately.

- Foreign Host without Origin: polling at lines 224-230 (403, `clientsCount === 0`), websocket at 232-238 (403, empty body, Next stub not called).
- `GET /` with a foreign Host: 176-183.
- Refused Origin (foreign, foreign with the own port, `null`, `http://[bad`, `%%%`, https of an own host): polling at 240-255 and websocket at 257-268. Each case ends with `expectStillServing()`. A `socket.io-client` with a foreign Origin is refused at 306-318.
- Accepted cases: 270-304. The 127.0.0.1 client receives `history` on both transports.
- `HOST=0.0.0.0`: 320-336.
- Stub upgrade reached: 340-355.
- `close()`: 420-477. The `-wal` file disappearing is a stronger proof that the connection closed than a reopen alone, and the maker's reasoning on this is correct.
- Graceful shutdown of the real entry: `e2e/shutdown.spec.ts` for SIGTERM and SIGINT, in both modes. It checks exit code 0, `transport close`, both log lines, the group gone, the port closed, no `-wal` file, and that the message persists (the spec's restart persistence, at the storage level).

Ordering against Next's self-registered listener (lines 357-382). Next 16.3.6 registers its listener lazily in `getRequestHandler()` through `setupWebSocketHandler(… req.socket.server)`. That is always after `createApp` has installed the dispatcher, so the stub, which registers itself from the first request, reproduces the real order. The test asserts 403, that the injected stub is not called, and `socket.destroyed === true` inside the later listener. My mutation that makes `refuseUpgrade` destroy the socket in `setImmediate` fails exactly these two cases, so the test does prove that the refusal is synchronous. `e2e/host-policy.spec.ts` repeats the check against real Next.js on `/socket.io/` and `/_next/hmr`, and my dev probe confirmed 403 on `/_next/hmr` after the first page request, with no error logged.

### Correctness against D2 and D4 (review focus 2)

- Dispatcher order is Host check, then the `/socket.io/` prefix to engine.io, then Next.js (`app.ts:146-180`). engine.io's own listeners are removed after `attach` (`app.ts:139-140`).
- The Host check runs on every request and upgrade, including polling requests with an existing `sid`, which engine.io does not re-check (test at 214-220).
- `allowRequest` rejects a present Origin that is not an own origin. It also re-checks the Host, so the rule "a missing Origin is accepted only with an own Host" holds where it is applied.
- `requireHostHeader: false` is correct. Without it, Node answers an HTTP/1.1 request without Host with 400 before any listener runs. My mutation to `true` turns the "missing Host" case into a failure.
- Refused requests get 403 with `Connection: close`. Refused upgrades get `403 Forbidden` and the socket is destroyed.
- Upgrades nobody owns get 404, except `/_next/` in dev (`app.ts:89-103`). The project has no `next.config.*`, so no `basePath` or `assetPrefix` is set, and the assumption holds today and is commented in the code (`app.ts:53`).
- `close()`:
  - It is idempotent (`??=` on one promise).
  - The order is: destroy the tracked Next upgrades, then `await io.close()`, then close the database in a `finally`.
  - It works when the server never listened (test at 471-477).
- `server.ts` is thin. It parses the config, prepares Next, calls `createApp`, listens with the listen-error handling from task 1.2, and shuts down. It is the only server file that imports `next` (`grep` of `app.ts` finds no `next` import).
- The boundary lint passes (`npm run lint` exit 0 inside `npm run check`).
- Shutdown policy: 10 s timeout with exit 1, a second signal exits 1 at once, and the timer is unref'd. This is reasonable and bounded (see finding 1).
- Signal handlers are registered only after `prepare()`. A signal during startup therefore falls back to the default exit 143. This is harmless because the database is opened later, inside `createApp`.

## Maker's open issues (implementation.md, "Design choices and open points")

1. **404 for unowned upgrades.** Sound. It fixes the socket that task 1.2 left hanging, and neither the spec nor the design needs any other upgrade. A user decision is optional. If the coordinator wants this policy recorded, a one-line D2 note ("non-Socket.IO upgrades other than dev `/_next/` are answered with 404") would be enough. It is not required for acceptance.
2. **Keeping Next's self-registered listener.** Correct. Removing it would break dev HMR, and the synchronous refusal makes it harmless (proven by the test and my mutation). No decision needed.
3. **Host re-checked in `allowRequest`.** Good defense in depth. No decision needed.
4. **Origin refusal codes (403 polling / 400 websocket).** Fixed by engine.io, and the spec only requires refusal. No decision needed.
5. **Shutdown policy.** Reasonable as a maker choice. Finding 1 is the one refinement I recommend: close the remaining connections with `closeAllConnections()`. The coordinator can send it back to the maker or accept it as a limitation. It does not need a user decision unless the timeout or exit-code policy itself changes.
6. **No lint rule for `app.ts` ↛ `next`.** A real gap between the D4 text and its boundary table. Today only `grep` checks it. Adding a row (for example `src/server/**` ↛ the package `next` and its subpaths) changes the design, so it needs a user decision. I recommend asking the user and doing it as a small separate task. It does not block 4.2.
7. **Free-port race** and 8. **D2 residual risks**: accepted as stated. No decision needed.

## E2E fixture and interrupts (review focus 4)

- The fixture is unchanged. Its `stop()` sends SIGTERM to the group, waits up to 5 s, then sends SIGKILL.
- With the new entry the group exits in about 40-100 ms (maker probes). The shutdown E2E and my probes agree, except in the stalled-connection case of finding 1. There the fixture's 5 s bound would end in SIGKILL, which is still bounded.
- The maker's interrupt probes, rerun after the two invalid entries (kept and marked in `checks.txt`), show no server left after SIGINT (Playwright exit 130) or SIGTERM (exit 143).
- The SIGKILL residual risk is real and correctly described. A SIGKILLed worker runs neither `finally` nor the `exit` hooks, so the detached groups survive. Only external cleanup can handle this. Not blocking. It could later be documented in `docs/testing.md`.

## Evidence honesty (review focus 5)

- Red runs are genuine:
  - `app.test.ts` fails with `Cannot find module './app'`, exit 1.
  - The E2E run against the unchanged base `server.ts` shows 200 instead of 403, `socket hang up` instead of 404, and 4 failed.
  - Red run 2 of the shutdown spec times out waiting for the history in both tests.
  - The base entry exits 143 on SIGTERM, and `git diff --quiet` confirms `server.ts` was unchanged at that point.
- The dev-server group left by the timed-out first red attempt was recorded: `pgrep` shows 121553/121564, and the next entry inspects the group and sends it SIGTERM.
- The green runs made outside the helper are disclosed in a `NOTE` entry and repeated through the helper.
- The `[DOCUMENTED EDIT]` entry replaces 82 end-of-line CRs with `[CR]` and shows the counts before and after (82 → 0 → 82 markers). The helper body in `implementation.md` states the earlier `mark()` version.
- The invalid process and interrupt probes are kept and marked. The failed final hash check (wrong directory) is kept, and its rerun passes.
- The statements in `implementation.md` match what I observed: 40 app tests, 431 unit tests, 6 E2E per mode, `npm run check` exit 0, and the manual curl results.

## Independent checks (checker, 2026-09-28)

All runs were made from `submissions/kostyasabada/` through a checker helper that records command, output (trailing spaces as `[SPACE]`, end-of-line CRs as `[CR]`), and exit code in a scratch log outside the submission.

| Check | Result |
|---|---|
| `sha256sum -c` of the snapshot entries | 6× `OK` |
| `sha256sum checks.txt` | `3da86021…09f4` (matches the maker's stated final hash) |
| `npx vitest run src/server/app.test.ts` ×3 | 40/40 passed each time |
| `npm run test:unit` | 8 files, 431 passed |
| `npm run lint`, `npm run typecheck` | exit 0 (also exit 0 as stages of `npm run check`) |
| `npm run test:e2e` (build + prod) | 6 passed, exit 0 |
| `npm run test:e2e:dev` | 6 passed, exit 0 |
| `npm run check` | exit 0, about 28 s (lint, typecheck, 431 unit, build, 6 E2E) |
| `openspec validate add-realtime-chat-room --strict` / `validate --all --strict` | valid / 1 passed, 0 failed |
| `git diff --check` | no output, exit 0 |
| `git diff --no-index --check /dev/null <file>` for the 4 untracked deliverables and 3 evidence files | exit 1 with no output for each (1 only means "differs"). A calibration file with a trailing space gave exit 3 and a report. |
| `git status --short` | `M server.ts`, `?? docs/evidence/add-realtime-chat-room-4-2/`, `?? e2e/host-policy.spec.ts`, `?? e2e/shutdown.spec.ts`, `?? src/server/app.test.ts`, `?? src/server/app.ts` |
| `git log --oneline -1` | `02b645a feat: add chat controller and host/origin policy (task 4.1)` |

### Checker mutations (exact-string edits; each file restored from a copy and SHA-256 verified identical)

| Mutation | File | Test | Result |
|---|---|---|---|
| `refuseUpgrade` destroys the socket in `setImmediate` instead of synchronously | `src/server/app.ts` | app tests | killed: 2 failed (both "before any Next.js listener acts" cases) |
| remove `for (const socket of nextUpgrades) socket.destroy()` from `close()` | `src/server/app.ts` | app tests | killed: 1 failed ("closes upgrades that were passed to Next.js…"; `close()` hung until the test timeout) |
| `allowRequest` also accepts `Origin: null` | `src/server/app.ts` | app tests | killed: 2 failed (polling and websocket `Origin: null`) |
| `requireHostHeader: true` | `src/server/app.ts` | app tests | killed: 1 failed ("refuses GET / with a missing Host with 403") |
| entry: `Promise.all([nextApp.close()])` (skip `app.close()`) | `server.ts` | `playwright test e2e/shutdown.spec.ts` (prod, existing build) | killed: 2 failed (SIGTERM and SIGINT; `Expected: false`, `Received: true`) |

The timed-out mutation left one temporary directory of its own under `/tmp` (`chat-app-test-*`). I removed it afterwards.

### Manual check (checker)

Port 3000 was free before the run. `npm run build` exited 0. `npm start` ran through `setsid` in its own process group (pgid 150280).

| Request | Result |
|---|---|
| `curl -sI http://127.0.0.1:3000/` | `HTTP/1.1 200 OK` |
| `curl -sI -H 'Host: evil.example:3000' http://127.0.0.1:3000/` | `HTTP/1.1 403 Forbidden` |
| websocket upgrade `GET /socket.io/?EIO=4&transport=websocket` with `Host: evil.example:3000` | `HTTP/1.1 403 Forbidden`, `Connection: close`, `Content-Length: 0` |
| the same upgrade with an own Host and `Origin: http://evil.example` | `HTTP/1.1 400 Bad Request`, body `Origin not allowed` |
| control: own Host, no Origin | `HTTP/1.1 101 Switching Protocols` (curl exit 28: the socket stays open until `--max-time`) |
| upgrade `/_next/hmr` with an own Host (prod) | `HTTP/1.1 404 Not Found` |
| `kill -TERM -150280` | The log shows `> Received SIGTERM, shutting down` and `> Server closed`. `npm start` itself exited 143, because npm reports the group signal, as the maker explained. No process of the group was left, and port 3000 was free afterwards. |

### Checker probe (supplementary; basis of finding 1)

The probe `probe.mjs <dev|prod>` spawns `tsx server.ts` in its own group, requests `GET /` (200), then sends a foreign-Host upgrade to `/_next/hmr`. It then opens a TCP connection that sends only a partial request and sends SIGTERM to the group.

| Mode | foreign-Host `/_next/hmr` | Exit after SIGTERM | Log | Group |
|---|---|---|---|---|
| dev | `HTTP/1.1 403 Forbidden` | code 1 after about 10 s | `> Shutdown did not finish within 10000 ms` | gone |
| prod | `HTTP/1.1 403 Forbidden` | code 1 after about 10 s | `> Shutdown did not finish within 10000 ms` | gone |

Final state: no `tsx`/`next-server`/`playwright`/`vitest`/`server.ts` process was running (my own shells excluded), port 3000 was free, and no checker temporary directory was left.

## Limitations

- SIGKILL of a Playwright worker was not exercised. I rely on the maker's analysis, which I agree with.
- Only the maker's interrupt probes were reviewed. I did not rerun them.
- I did not open a real browser dev session to watch HMR. The dev E2E (`/_next/hmr` → 101) and my probe cover the upgrade routing.
- The free-port race (open issue 7) was not probed.
- Stalled connections were tested only as one partial request. Slow response bodies were not tested.

## Verdict

**accepted** (round 1). Every acceptance criterion of task 4.2 is met, the required checks pass on the reviewed snapshot, and the evidence is accurate. Finding 1 is a low-severity robustness gap: it is bounded by the 10 s timeout and loses no data. I recommend a small follow-up, `closeAllConnections()`, or recording it as a known limitation. It does not block acceptance. Open issue 6 (lint rule for `next` in `app.ts`) needs a user decision on a design change and should be proposed separately.

## Round 2

- Checker: Claude Code general-purpose subagent (checker), the same checker as round 1, separate from coordinator and maker.
- Date: 2026-09-28. Runtime: Node v24.21.0, npm 11.19.0. Base commit: `02b645a`; nothing staged.
- Reviewed snapshot: `snapshot.txt` revision 2. `sha256sum -c` of its six entries: all `OK`.
  - `server.ts` `af6c6e28…` (unchanged since revision 1)
  - `src/server/app.ts` `9845371c…`
  - `src/server/app.test.ts` `0f086ddb…`
  - `e2e/host-policy.spec.ts` `7ebcc58a…` (unchanged)
  - `e2e/shutdown.spec.ts` `88c5db22…`
  - `implementation.md` `e4dfa072…`
- `checks.txt` hash at review time: `3ff9523531b3d45d1261514897618ad023e8d779aa5139f2e0c2fc8248fa4031`, which matches the maker's stated final hash. The round-1 part of `review.md` was unchanged when this round started (`10fec879…`).
- Read:
  - the Round 2 sections of `implementation.md`;
  - the `checks.txt` entries after the `ROUND 2` separator;
  - `snapshot.txt` revision 2;
  - the changed parts of `app.ts` (`CLOSE_GRACE_MS`, `close()`), `app.test.ts` (`timedClose` and the three new tests), and `e2e/shutdown.spec.ts` (the new stalled-connection test).

### Resolution of round-1 findings

| # | Round 1 | Resolution |
|---|---|---|
| 1 | Low: a stalled HTTP connection held the shutdown until the 10 s timeout (exit 1, database not closed) | **Resolved.** See below. |
| 2 | Info: upgrade tracking added to the moved dispatchers | No action needed; unchanged. |
| 3 | Info: empty `/tmp/chat-e2e-*` directories from the maker's runs | **Resolved.** The maker removed them with `rmdir` and attributed each one to a recorded run. Correction to my round-1 text: three such directories existed, not two. `wsvSEk` (15:37 local) was in my own `ls` output, but I left it out of the finding. I found no `chat-*` temporary directory after my round-2 runs. |

How finding 1 was fixed and tested:

- **The fix.** `close()` (`src/server/app.ts:192-206`) starts a timer before the first `await`. After `CLOSE_GRACE_MS = 1_000` (`app.ts:57-63`, with a comment giving the reason) the timer calls `httpServer.closeAllConnections()`. The timer is cleared in the `finally` that closes the database.
- **Why it works.** `io.close()` resolves once the HTTP server has closed. Upgraded sockets are no longer tracked by the server: Socket.IO closes its own, and `close()` destroys the tracked Next.js upgrades. So the only connections left for the timer are plain HTTP connections with unfinished requests. This is correct.
- **The 1 s grace period** is a reasonable, disclosed maker choice. Page responses in flight are allowed to finish, the shutdown stays far below the 10 s timeout (a user decision) and below the fixture's 5 s SIGTERM bound, and the grace test guards it.
- **Timing margins are deterministic enough:**
  - The two "promptly" tests allow under 2 s against a 1 s grace, bounded at 3 s.
  - The grace test answers after 200 ms against 1 s.
  - The E2E allows under 5 s and observes about 1 s.
  - `timedClose` calls `closeAllConnections()` only after taking the result, so the red run's `afterEach` could not hide a failure.
- **Red runs are genuine.** They ran on the unchanged revision-1 `app.ts`: Node had 2 failures (`expected 'still open' not to be 'still open'`, grace test passing), and the E2E exited 1 in prod and dev with `> Shutdown did not finish within 10000 ms`.
- **The maker's mutations were killed.** The recorded `mutate.py` syntax-error attempt left the file untouched, was noted, and was rerun. The revision-1 mutations were also rerun.

### User decisions

`implementation.md` "Round 2 → User decisions" matches the coordinator's relay of the user's answer of 2026-09-28, "так, приймаю, виправляй" ("yes, I accept, fix it"):

- open point 1 (404 for upgrades nobody owns, with the dev `/_next/` exception) is accepted;
- open point 5 (the shutdown policy: 10 s timeout with exit 1, a second signal exits 1) is accepted;
- the finding-1 fix was made now;
- open point 6 (an ESLint rule stopping `app.ts` from importing `next`) is deferred to a separate task.

It also notes that the handoff numbered the shutdown policy differently. This is accurate.

### New findings

None. No regressions: all round-1 tests, the E2E smoke and startup tests, and the host-policy E2E still pass.

### Independent checks (round 2)

| Check | Result |
|---|---|
| `npx vitest run src/server/app.test.ts` ×3 | 43/43 each time |
| the three new close tests only (`-t`), ×3 | 3 passed each time |
| `npm run test:unit` (inside `npm run check`) | 8 files, 434 passed |
| `npm run lint`, `npm run typecheck` | exit 0, exit 0 |
| `npm run check` (includes `npm run test:e2e`) | exit 0, about 30 s; 7 E2E passed (prod) |
| `npm run test:e2e:dev` | 7 passed, exit 0 |
| `playwright test e2e/shutdown.spec.ts`, twice per mode | prod 3/3 and 3/3, dev 3/3 and 3/3. The stalled-connection test took 2.1 s each time. |
| `openspec validate add-realtime-chat-room --strict` / `validate --all --strict` | valid / 1 passed, 0 failed |
| `git diff --check` | no output, exit 0 |
| `git diff --no-index --check /dev/null <file>` for the 4 untracked deliverables and 3 evidence files | exit 1 with no output for each; the round-1 calibration applies |
| `git status --short` | unchanged from round 1 (`M server.ts` plus the five untracked paths) |
| `git log --oneline -1` | `02b645a feat: add chat controller and host/origin policy (task 4.1)` |

Reproduction of the round-1 probe against the real entry (`probe.mjs` plus a check that the `-wal` file is gone). The probe sends `GET /` (200), then a foreign-Host `/_next/hmr` upgrade (403), then opens a connection that sends only a partial request, then sends SIGTERM to the process group.

| Mode | Exit | Log | Group | `-wal` |
|---|---|---|---|---|
| dev | code 0 after about 1 s (round 1: code 1 after about 10 s) | `> Server closed` | gone | gone (database closed) |
| prod | code 0 after about 1 s | `> Server closed` | gone | gone |

Checker mutations on `src/server/app.ts`, each restored from a copy with the SHA-256 verified identical (`9845371c…`):

| Mutation | Test | Result |
|---|---|---|
| the timer calls `closeIdleConnections()` instead of `closeAllConnections()` | app tests | killed: 2 failed (unfinished headers; handler never answers) |
| the same | E2E stalled-connection test (prod) | killed: 1 failed |
| `CLOSE_GRACE_MS = 5_000` | app tests | killed: 2 failed (the 2 s bound) |

Final state: no `tsx`/`next-server`/`playwright`/`vitest`/`server.ts` process was running (my own shells excluded), port 3000 was free, and no `chat-*` temporary directory was left.

### Limitations (round 2)

- I did not repeat the manual `npm start` curl check. Round 2 changed only `close()` and its tests; the request and upgrade paths are unchanged (`server.ts` and `host-policy.spec.ts` hashes are identical to revision 1), and my probe exercised the real entry in both modes.
- I did not test slow response bodies that last longer than the grace period. By design they are cut off after 1 s during shutdown.
- The round-1 limitations still apply: no SIGKILL of the worker, no real browser HMR session, and no probe of the free-port race.

### Verdict (round 2)

**accepted** for snapshot revision 2. Finding 1 is resolved with meaningful red-first tests and mutation-proof tests. The user decisions are recorded accurately. All required checks pass, and there are no new findings.
