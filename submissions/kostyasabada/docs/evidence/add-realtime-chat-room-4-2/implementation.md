# Task add-realtime-chat-room-4-2 — implementation

- Task: 4.2 in `openspec/changes/add-realtime-chat-room/tasks.md` (composition root `src/server/app.ts`, Host/Origin policy wiring, thin `server.ts`, graceful shutdown).
- Maker: Claude Code general-purpose subagent (maker), fresh scoped handoff from the coordinator.
- Base commit: `02b645a`; uncommitted working tree, nothing staged. The task checkbox is not ticked (checker acceptance pending). No UI (5.x) work; the agent loop was not run.
- Snapshot: `snapshot.txt` (SHA-256 of the deliverables, paths from the repository root; this report and `checks.txt` are listed separately there). Current: revision 2 (see "Round 2" at the end); the sections before it describe revision 1.
- Runtime: Node v24.21.0 via `PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`, npm 11.19.0 (first entry of `checks.txt`).
- All command output: `checks.txt` (append-only, written by the helper `rec42.sh`; helper bodies at the end of this file).

## Changes

| File | Change |
|---|---|
| `src/server/app.ts` | New. `createApp({ config, next })`, `nextUpgradeHandler`, `refuseUpgrade`; the dispatchers moved from `server.ts`. |
| `src/server/app.test.ts` | New. 40 Vitest cases: `createApp` on an ephemeral loopback port, temporary DB, stub Next.js handlers, raw HTTP requests. |
| `server.ts` | Reduced to the thin entry of D4, plus graceful shutdown on `SIGINT`/`SIGTERM`. |
| `e2e/shutdown.spec.ts` | New. The real entry shuts down on `SIGTERM` and on `SIGINT` (2 tests, both modes). |
| `e2e/host-policy.spec.ts` | New. The Host check and upgrade closing through the real entry with real Next.js handlers (2 tests, both modes). |

No other file changed (`e2e/fixtures/chat-server.ts`, `eslint.config.mjs`, specs, design, and tasks are untouched). No new dependencies.

## API and ownership

```ts
// src/server/app.ts
export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>
export type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => Promise<void>
export type NextHandlers = { handleRequest: RequestHandler; handleUpgrade: UpgradeHandler }
export type CreateAppOptions = { config: ServerConfig; next: NextHandlers }
export type App = { httpServer: HttpServer; io: SocketIOServer; close(): Promise<void> }
export function createApp(options: CreateAppOptions): App
export function nextUpgradeHandler(options: { dev: boolean; handleUpgrade: UpgradeHandler }): UpgradeHandler
export function refuseUpgrade(socket: Duplex, status: 403 | 404): void
```

- **Who owns what.** `createApp` creates and owns the `http.Server`, Socket.IO, and the database connection, so its `close()` closes all three. It does not listen. `server.ts` calls `listen` and keeps the task 1.2 listen-error handling (`once('error')` → exit 1). This follows D4: the entry "listens" and `createApp` "returns `{ httpServer, io, close() }`". Tests listen on `127.0.0.1` themselves.
- **Wiring order in `createApp`.** `createHostPolicy(config)` → `openDatabase(config.dbPath)` → `SqliteMessageRepository` → `createChatService` → `http.createServer({ requireHostHeader: false })` → `new Server({ destroyUpgrade: false, serveClient: false, allowRequest })` → `io.attach` → `registerChatController(io, service)` → removal of engine.io's `request`/`upgrade` listeners → the two dispatchers.
- **`close()`.** Idempotent: the first call creates one promise, and every call returns that promise (tested with `toBe`). It destroys upgrades passed to Next.js that are still open. Then it awaits `io.close()`, which disconnects every Socket.IO client, closes engine.io, and closes the HTTP server; it also resolves when the server never listened. The database is closed in a `finally`. The order is clients first, database last, so no send can reach a closed database.
- **Entry (`server.ts`).** It parses the config, runs `next({ dev, hostname, port })` and `prepare()`, and calls `createApp` with `nextApp.getRequestHandler()` and `nextUpgradeHandler({ dev, handleUpgrade: nextApp.getUpgradeHandler() })`. Then it listens. On the first `SIGINT`/`SIGTERM` it logs `> Received <signal>, shutting down`, awaits `app.close()` and `nextApp.close()`, logs `> Server closed`, and exits 0. A failure exits 1. A second signal exits 1 at once. A 10 s timer (unref'd) exits 1 if the shutdown hangs. `server.ts` is still the only server file that imports `next`.

## Dispatcher order (request and upgrade)

The task 1.2 dispatchers moved unchanged. The Host check was added at their marked insertion points, and the injected handler is now called `next.handleRequest`/`next.handleUpgrade`.

- **`request`:** (1) the Host check: a missing, unparsable, or foreign `Host` gets `403`, `Content-Type: text/plain`, `Connection: close`, and the body `Forbidden\n`. (2) `/socket.io/` goes to `io.engine.handleRequest`. (3) Everything else goes to `next.handleRequest`, with the existing 500 fallback.
- **`upgrade`:** (1) the Host check: `refuseUpgrade(socket, 403)` writes `HTTP/1.1 403 Forbidden` with `Connection: close` and `Content-Length: 0`, then destroys the socket synchronously. (2) `/socket.io/` goes to `io.engine.handleUpgrade`. (3) Everything else is tracked for `close()` and goes to `next.handleUpgrade`.
- **Handshake Origin check:** `allowRequest` accepts only if `isAllowedHost(Host)` and (`Origin` is absent or `isAllowedOrigin(Origin)`). The Host is checked again here on purpose, so the rule "a missing Origin is accepted only with an own Host" holds where it is applied. The dispatcher still refuses a foreign Host first, with 403.
- **Next.js's own `upgrade` listener (N22).** Next 16.3.6 registers its own `upgrade` listener on the HTTP server on the first request (`setupWebSocketHandler` in `next/dist/server/next.js`). That listener runs after the dispatcher. The dispatcher's refusal is synchronous, so that listener only gets an already destroyed socket. The test "refuses a non-Socket.IO upgrade with … with 403 before any Next.js listener acts" imitates the self-registration from inside the stub request handler. It asserts a 403 response, that the injected upgrade stub is not called, and that the self-registered listener saw `socket.destroyed === true`. `e2e/host-policy.spec.ts` checks the same through the real Next.js: a foreign-Host upgrade gets 403 on `/socket.io/` and on `/_next/hmr`.
- **Upgrades nobody owns (task 1.2 review finding 2).** `nextApp.getUpgradeHandler()` is a no-op in Next 16.3.6. Dev HMR is served only by Next's self-registered listener, which leaves unmatched upgrades open. `nextUpgradeHandler` (used by `server.ts`) therefore works like this. In development, `/_next/` upgrades (HMR) go to Next.js, and Next's own listener serves them. Every other non-Socket.IO upgrade, in both modes, gets `HTTP/1.1 404 Not Found` and is destroyed. Tested in Node (both modes) and in E2E: `/custom-ws` gets 404 in both modes; `/_next/hmr` gets 101 in dev and 404 in prod.
- **`requireHostHeader: false`.** Without it, Node answers an HTTP/1.1 request without `Host` with 400 before any listener runs. With it, the policy answers every missing Host with 403 (tested with `http.request` without Host, and with raw HTTP/1.0 bytes for a request and an upgrade).

## Observed status codes (from the tests and the manual check)

| Case | Polling / HTTP | WebSocket upgrade |
|---|---|---|
| Foreign, missing, or unparsable `Host` (dispatcher) | `403`, body `Forbidden\n`, `Connection: close` | `403 Forbidden`, empty body, socket destroyed |
| Own Host, refused `Origin` (`allowRequest`) | `403`, `application/json` `{"code":4,"message":"Origin not allowed"}` (engine.io `abortRequest`) | `400 Bad Request`, body `Origin not allowed` (engine.io `abortUpgrade` always uses 400) |
| socket.io-client with `Origin: http://evil.example` | — | `connect_error` with message `websocket error` |
| Own Host, no Origin or own Origin | `200` `0{"sid":…}` | `101` |
| Non-Socket.IO upgrade that Next.js does not own (entry) | — | `404 Not Found`, socket destroyed |

## Criteria → tests

`src/server/app.test.ts` (40 cases; the names are listed in the verbose run in `checks.txt`):

| Task criterion | Test(s) |
|---|---|
| No `Origin` and `Host: evil.example:<PORT>` refused on polling | "refuses a polling handshake without Origin and with Host: evil.example:<PORT> (403, no session)" (`io.engine.clientsCount === 0`) |
| … and on websocket | "refuses a websocket handshake without Origin and with Host: evil.example:<PORT> (403, no session)" |
| `GET /` with that Host → 403 | "refuses GET / with Host: evil.example:<PORT> with 403 without calling Next.js" |
| Own Host with `Origin: http://evil.example` (separate case) refused, no crash | "refuses a polling handshake with an own Host and a foreign origin (403) and keeps running"; websocket variant (400); "refuses a socket.io-client with a foreign Origin"; each "keeps running" case ends with `expectStillServing()` (a new handshake and `GET /` succeed) |
| `Origin: null` refused, no crash | the polling (403) and websocket (400) "Origin: null" cases |
| Unparsable `Origin` refused, no crash | the "unparsable origin" (`http://[bad`) polling and websocket cases, and "a non-URL origin" (`%%%`) |
| No `Origin` with `Host: 127.0.0.1:<PORT>` accepted | "accepts a polling and a websocket handshake without Origin and with Host: 127.0.0.1:<PORT>"; "delivers the history to a socket.io-client without Origin on 127.0.0.1 (both transports)" |
| `Host: LOCALHOST:<PORT>` accepted | "accepts Host: LOCALHOST:<PORT> (normalized) on both transports and for GET /" |
| `Origin: http://localhost:<PORT>` accepted | "accepts Origin: http://localhost:<PORT> on both transports" (and the 127.0.0.1 variant) |
| `HOST=0.0.0.0`: `Host: 0.0.0.0:<PORT>` refused | "with HOST=0.0.0.0 (wildcard) › refuses Host: 0.0.0.0:<PORT> on GET / and both transports"; "… still accepts localhost, 127.0.0.1, and [::1]" |
| Non-Socket.IO upgrade reaches the Next.js upgrade stub | "passes a non-Socket.IO upgrade with an own Host to the Next.js upgrade handler"; "does not pass a Socket.IO upgrade to the Next.js upgrade handler" |
| `close()` closes Socket.IO and the DB (file reopenable) | "disconnects Socket.IO clients, stops listening, and closes the database": the client gets `disconnect` with `transport close`, and `httpServer.listening` is false. The `-wal` file is gone, which in WAL mode shows the last connection closed; reopening the file alone would not prove this, since SQLite allows several connections. The reopened file contains the stored message. |
| Review notes: missing/unparsable Host → 403; `close()` idempotent; rejected upgrade before Next's listener; unowned upgrades closed; sid polling | "refuses GET / with %s with 403" (missing, empty, unparsable, userinfo, path, other port); "refuses a raw HTTP/1.0 request without Host with 403"; "refuses a raw HTTP/1.0 upgrade without Host with 403"; "is idempotent: …"; "refuses a non-Socket.IO upgrade with … before any Next.js listener acts" (foreign and missing Host); "nextUpgradeHandler …" (2 cases); "closes upgrades that were passed to Next.js and are still open"; "works when the server never listened and closes the database"; "refuses a polling request of an existing session with a foreign Host" (the `sid` case that `allowRequest` does not re-check) |

End-to-end (`e2e/`, run by `npm run test:e2e` in prod and `npm run test:e2e:dev` in dev):

| Task criterion | Test |
|---|---|
| Graceful shutdown of the real entry (spawned `server.ts` exits after `SIGTERM`) | `shutdown.spec.ts` "the server shuts down gracefully on SIGTERM and keeps the stored messages". It spawns the entry with `spawnServerProcess` (own process group), waits for `> Ready on`, stores a message through socket.io-client, and sends SIGTERM to the group. It expects exit code 0, the client's `transport close`, both log lines, no process of the group left, the port refusing connections, no `-wal` file, and the message present after reopening the DB (restart persistence at the storage level). The same test runs for `SIGINT`. |
| Real composition with real Next.js | `host-policy.spec.ts`: 200 for `localhost:<PORT>`; 403 for a foreign Host on `/`, on polling, and on upgrades to `/socket.io/` and `/_next/hmr` after Next registered its listener; 101 for an own-Host websocket; 404 for `/custom-ws`; `/_next/hmr` 101 in dev and 404 in prod. |
| Existing smoke and startup tests still pass | `smoke.spec.ts`, `startup.spec.ts`: passed in every E2E run in both modes. |

## Red runs (before implementation)

- `app.test.ts`: `Cannot find module './app'`, 0 tests, exit 1 (`checks.txt`, entry "RED RUN app.test.ts").
- E2E in dev mode against the base entry (first run): `host-policy.spec.ts` failed (`GET /` with a foreign Host got 200 instead of 403; `/custom-ws` got `socket hang up` instead of 404). The first version of `shutdown.spec.ts` waited without a bound for a `history` event. The base entry registers no chat controller, so the test reached Playwright's test timeout, and Playwright abandoned the body. Its server group (tsx CLI + dev server) was left running, and the second shutdown test then failed with "Another next dev server is already running". The maker killed the leftover group with SIGTERM (recorded). The spec was then changed: every wait is bounded (`within`), and the spec has an `exit` hook like the fixture. Red run 2: both shutdown tests failed with `timed out waiting for the history`, and nothing was left over.
- Base entry signal behavior (`signal-probe.mjs dev SIGTERM group`, base `server.ts` unchanged): exit code `143`, no shutdown log.

## Mutation checks (all killed, file restored, SHA-256 verified)

Each mutation was applied by `mutate.py` (exact string, must match once), followed by the app tests, then a restore from a copy and a hash comparison (`mutation-run.sh`). They ran once on the first revision and again on the final revision (`ad4cd1e8…`).

| Mutation | Result on the final revision |
|---|---|
| `skip-host-check-upgrade` (remove the upgrade Host check) | 5 failed (websocket foreign Host now 400 from `allowRequest` instead of 403; `0.0.0.0`; both "before any Next.js listener" cases; HTTP/1.0 upgrade) |
| `skip-host-check-request` (remove the request Host check) | 11 failed |
| `accept-any-origin` (`allowRequest` always accepts) | 10 failed |
| `no-db-close` (skip `closeDatabase`) | 2 failed (the WAL file remains) |
| `no-404-for-unowned-upgrades` (`nextUpgradeHandler` passes everything to Next.js) | 2 failed |
| Entry: remove `process.on('SIGTERM', shutdown)` (`mutation-entry.sh`, prod E2E `-g SIGTERM`) | 1 failed: exit code 143 instead of 0 |

## Manual check (`manual-curl.sh`, run twice, the second time on the final revision)

Port 3000 was free before. `npm run build` exited 0. `npm start` ran in its own session and process group (`setsid`).

- `curl -sI http://127.0.0.1:3000/` → `HTTP/1.1 200 OK`.
- `curl -sI -H 'Host: evil.example:3000' http://127.0.0.1:3000/` → `HTTP/1.1 403 Forbidden`.
- Supplementary: `Host: LOCALHOST:3000` → 200. Polling handshake → 200 `0{"sid":…}`. With `Origin: http://evil.example` → 403 `{"code":4,"message":"Origin not allowed"}`. With `Host: evil.example:3000` → 403 `Forbidden`.
- Stop: `kill -TERM -<pgid>`. The log shows `> Received SIGTERM, shutting down` and `> Server closed`. No process of the group was left, and port 3000 was free afterwards. The `npm start` process itself exited 143: npm reports the SIGTERM it received as a group member. The server process exited 0, as the signal probes show (the tsx CLI exit code is 0 in `signal-probe.mjs` for prod and dev, and for signals sent to the group or only to the tsx CLI).

## E2E fixture (task 1.4 open issue)

`e2e/fixtures/chat-server.ts` is unchanged. Its `stop()` sends SIGTERM to the group and waits up to 5 s, then sends SIGKILL. Now that the entry shuts down gracefully, the group exits in about 40–100 ms (signal probes), well within 5 s. All E2E runs ended with no leftover processes.

Interrupted runs: `interrupt-probe.sh` started a full dev-mode Playwright run in its own group and waited for a spawned server. It then sent SIGINT to the group (exit 130) and, in a second run, SIGTERM (exit 143). In both cases no server process was left after 3 s. The first two probe entries were invalid: the wait loop matched the invoking shell. They are kept in `checks.txt` and marked as such.

The remaining risk is unchanged: if the Playwright worker is killed with SIGKILL, neither `finally` nor the `exit` hooks run, and the detached server groups survive. Only an external cleanup could handle this, so the fixture was not redesigned.

## Other checks (final revision)

- `app.test.ts` 3×: 40/40 each. `npm run test:unit`: 8 files, 431 tests. `npm run lint`: exit 0 (boundary rules included: `app.ts` imports only `node:*`, `socket.io`, and server layers; `grep` shows no `next` import in `src/server/app.ts`). `npm run typecheck`: exit 0.
- `npm run test:e2e:dev`: 6 passed. `npm run test:e2e`: 6 passed. `npm run check`: exit 0 (27 s).
- The whitespace checks (`git diff --check`, and `git diff --no-index --check /dev/null <file>` per untracked file, after a calibration run) are the last entries in `checks.txt`. At the end, no `tsx`/`next-server`/`playwright`/`vitest`/`server.ts` process was running and port 3000 was free.

## Evidence notes

- After writing `app.ts` and the new entry, the maker ran these once in its own shell without the helper: the app tests (40 passed), eslint (exit 0), tsc (no output), and dev E2E (6 passed). These runs are not in `checks.txt` (a note entry says so). All of them were repeated through the helper. After that, `e2e/host-policy.spec.ts` got one more assertion (`/_next/hmr` per mode), and `app.ts` got a formatting-only change (three lines over 120 characters wrapped). Every final check ran after that change.
- `[DOCUMENTED EDIT]` in `checks.txt`: the curl header lines ended in CR (HTTP CRLF). One recorded command replaced each end-of-line CR already in the file with `[CR]` (82 before, 0 after). From then on the helper marks CRs at recording time. No other recorded output was changed.
- Two early process-check entries matched only the maker's own shell processes: the pattern text appeared in their command lines. The later `procs.sh` excludes shells.

## Design choices and open points for the checker or user

1. **Closing unowned upgrades with 404 (maker choice, from the task 1.2 review recommendation).** In production every non-Socket.IO upgrade gets 404. In development only `/_next/` is passed to Next.js. The prefix assumes no `basePath`/`assetPrefix`, and none is configured. If one is added later, the prefix must follow. A future Next.js version that serves app-route WebSockets would also need this changed.
2. **Next.js's self-registered `upgrade` listener stays.** Dev HMR depends on it, because `getUpgradeHandler()` is a no-op in 16.3.6. It also sees Socket.IO upgrades after engine.io, as in task 1.2; it leaves unmatched paths alone. The dispatcher runs first and refuses synchronously. Suppressing that listener would need Next.js internals, so the maker did not do it.
3. **Host checked again in `allowRequest`** (defense in depth). As a result, the upgrade Host mutation is caught on `/socket.io/` as 400 instead of 403, and fully by the non-Socket.IO upgrade tests.
4. **Status codes for a refused Origin** come from engine.io and are not configurable through `allowRequest`: polling 403 (JSON), websocket 400. The spec only requires refusal.
5. **Shutdown policy (maker choice):** 10 s timeout → exit 1; second signal → exit 1 at once; `nextApp.close()` is awaited together with `app.close()`.
6. **No lint rule makes `app.ts` ↛ `next` binding.** D4 states it, but the boundary table has no such row. It is checked here by `grep` only. Adding a row would be a design change (not done).
7. **Free-port race in tests:** the allowlist needs the port before listening. The Node tests and E2E therefore probe a free port first, like the fixture's `freePort`. Another process could take it in between; this was not observed.
8. **Residual risks of D2 unchanged:** local non-browser processes with an own Host are accepted; a LAN `HOST` is trusted; plain HTTP only.

## Round 2 (after `review.md` round 1)

The checker accepted round 1 with one low finding (F1) and two informational notes (F2, F3). The coordinator relayed the user's answer of 2026-09-28 to its recommendations: "так, приймаю, виправляй" ("yes, I accept, fix it").

### User decisions (2026-09-28, quoted above, relayed by the coordinator)

- **Open point 1 accepted:** upgrades that nobody owns are answered with 404 and destroyed; in development `/_next/` upgrades go to Next.js. This is no longer only a maker choice.
- **Open point 5 accepted (the shutdown policy):** a 10 s timeout exits 1, and a second signal exits 1 at once. The round-2 handoff called this "issue 3" because it counted the points in the maker report, not in this file.
- **Open point 2** (keep Next's self-registered upgrade listener) needs no decision.
- **Open point 6 deferred** (no ESLint rule stops `app.ts` importing `next`): it goes to a separate later task, with no change now.

### F1 fix: a stalled HTTP connection blocked the shutdown

Problem (checker probe): `server.close()` closes only idle connections. A connection with an unfinished request kept the HTTP server open. The shutdown then hit the entry's 10 s timeout, exited 1, and never ran `closeDatabase`.

The fix is in `src/server/app.ts`, in `close()`:
- Before the first `await`, a timer is started with `CLOSE_GRACE_MS = 1_000`. When it fires, it calls `httpServer.closeAllConnections()`.
- The timer is cleared in the `finally` that closes the database.
- `io.close()` resolves when the HTTP server emits `close`, which happens after the last connection has ended. Requests that finish within 1 s still complete; anything still busy then is cut off, and the server and the database close promptly.
- `closeIdleConnections()` is not needed as a separate call, because `server.close()` already calls it (Node 19+).
- The grace period is a maker choice: a short window so that in-flight page responses are not cut off at once.

New tests:
- `src/server/app.test.ts` gets three tests (43 cases now):
  - "closes a connection with an unfinished request (headers not complete) promptly and closes the database": raw TCP with partial headers. `close()` must finish in under 2 s, bounded at 3 s; the socket is closed, the server stops listening, and no `-wal` file is left.
  - "closes a connection whose request Next.js never answers promptly": the stub handler never responds. Same bounds; the client request errors; no `-wal` file is left.
  - "lets a request that finishes within the grace period complete": the stub answers after 200 ms, while `close()` is already running. The client still gets 200 `late page`. This guards the grace period and passes with and without the fix.
  - The helper `timedClose` calls `closeAllConnections()` itself only after taking the result, and only on "still open". This is cleanup, so that the red run's `afterEach` does not hang.
- `e2e/shutdown.spec.ts` gets "the server shuts down promptly on SIGTERM while a connection has an unfinished request" (both modes). The real entry is started; one raw TCP connection sends partial headers; then SIGTERM goes to the group. Expected: exit code 0 in under 5 s, `> Server closed` in the log, no process of the group left, no `-wal` file. Observed: about 1 s of shutdown (test total 2.1 s including startup).

Red runs, recorded before the fix (`app.ts` hash `ad4cd1e8…`, unchanged since revision 1):
- Node: 2 failed, `expected 'still open' not to be 'still open'`; the grace test passed.
- E2E in prod and in dev: `> Shutdown did not finish within 10000 ms`, exit code 1 instead of 0 in each.

Mutations (hash-verified restore):
| Mutation | Result |
|---|---|
| `no-close-all-connections` (the timer does nothing), Node | 2 failed |
| `no-close-all-connections`, E2E (prod) | failed with exit code 1 after the 10 s timeout |
| `no-grace-period` (`CLOSE_GRACE_MS = 0`), Node | 1 failed (the grace test) |

The first attempt at these three entries failed before mutating anything: `mutate.py` had a syntax error from an unquoted heredoc, and the file was restored from its copy (recorded). The five revision-1 mutations were rerun on revision 2 and were all killed: 5, 11, 10, 4 and 2 failures. `no-db-close` now also fails the two new close tests.

### F2 (info) and F3 (info)

- **F2:** no action needed, as the review states.
- **F3:** three empty `/tmp/chat-e2e-*` directories were found. The review named two; the third, `wsvSEk`, is also the maker's. The recorded entry matches their creation times to the maker's runs:
  - `onLxvB` (12:25:36Z): the abandoned SIGTERM test of the first red E2E run.
  - `wsvSEk` (12:37:36Z): the valid SIGINT interrupt probe.
  - `W5nF5W` (12:37:41Z): the valid SIGTERM interrupt probe.
  They were removed with `rmdir`, which only removes empty directories. No `chat-app-test-*`/`chat-probe-*` directories were present. None was left after the round-2 runs, including the timed-out red and mutation runs.

### Round 2 checks (final revision 2)

- `app.test.ts` 3×: 43/43 each. `npm run test:unit`: 8 files, 434 tests.
- `npm run lint` and `npm run typecheck`: exit 0.
- `npm run test:e2e:dev`: 7 passed. `npm run test:e2e`: 7 passed. `npm run check`: exit 0 (30 s).
- No matching processes afterwards; port 3000 free; no leftover temporary directories.
- The whitespace checks are the last entries in `checks.txt`.
- The manual curl check was not repeated in round 2 (not in the round-2 check list). The request path is unchanged; only `close()` changed.

### Round 2 evidence notes

- The line `======== ROUND 2 … ========` in `checks.txt` was appended directly with `printf`, not through the helper. It is a separator only, not a command.
- After adding the round-2 tests, the maker ran `tsc --noEmit` and eslint on the two test files once without the helper (exit 0). A note entry says so, and both are part of the recorded final checks.
- New helper in round 2: `mutation-e2e.sh`. `mutate.py` gained two mutations. Both bodies below are current.

## Helper bodies (scratchpad, not part of the submission)

The `rec42.sh` body below is the final version. Before the `[DOCUMENTED EDIT]` entry, its `mark()` line was `mark() { sed -E ':a; s/ ((\[SPACE\]|\[TAB\])*)$/[SPACE]\1/; s/\t((\[SPACE\]|\[TAB\])*)$/[TAB]\1/; ta'; }`, and its header comment had no `[CR]` sentence.

### rec42.sh

```bash
#!/usr/bin/env bash
# rec42.sh '<command>': runs <command> with bash -c in the submission root and appends
# a timestamped entry ("$ <command>", combined stdout/stderr, measured exit code) to
# checks.txt. Trailing spaces/tabs in recorded lines are shown as [SPACE]/[TAB] markers,
# and a carriage return at the end of a line (curl header output) as [CR].
set -u
ROOT=/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada
OUT="$ROOT/docs/evidence/add-realtime-chat-room-4-2/checks.txt"
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
export OPENSPEC_TELEMETRY=0 NO_COLOR=1 FORCE_COLOR=0
mark() { sed -E 's/\r$/[CR]/' | sed -E ':a; s/ ((\[SPACE\]|\[TAB\]|\[CR\])*)$/[SPACE]\1/; s/\t((\[SPACE\]|\[TAB\]|\[CR\])*)$/[TAB]\1/; ta'; }
tmp=$(mktemp)
cd "$ROOT" || exit 99
bash -c "$1" >"$tmp" 2>&1
rc=$?
{
  printf '\n# %s\n' "$(date -u +%FT%TZ)"
  printf '$ %s\n' "$1" | mark
  mark <"$tmp"
  printf '[exit %s]\n' "$rc"
} >>"$OUT"
cat "$tmp"
echo "[exit $rc]"
rm -f "$tmp"
exit $rc
```

### procs.sh

```bash
#!/usr/bin/env bash
# procs.sh: lists processes whose command line mentions tsx/dist, next-server, playwright,
# vitest, or server.ts, excluding shells (bash -c wrappers of the recording tools, which
# contain these words in their own command text). Prints "no matching processes" if none.
out=$(ps -eo pid=,ppid=,pgid=,args= | grep -E 'tsx/dist|next-server|playwright|vitest|server\.ts' | grep -vE 'bash -c|/bin/bash|rec42\.sh|procs\.sh|grep -E')
if [ -n "$out" ]; then printf '%s\n' "$out" | cut -c1-200; else echo "no matching processes"; fi
```

### signal-probe.mjs

```js
// signal-probe.mjs <dev|prod> <SIGTERM|SIGINT> <group|cli>: spawns `tsx server.ts` from the
// submission root in its own process group on a free port with a temporary DB, waits for
// "> Ready on", sends the signal to the whole group or only to the tsx CLI process, and
// prints the exit code/signal, the elapsed time, whether the group is gone, and the output.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const [mode, signal, target] = process.argv.slice(2)
const root = process.cwd()
const tsx = createRequire(join(root, 'package.json')).resolve('tsx/cli')
const port = await new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) }) })
const dir = mkdtempSync(join(tmpdir(), 'chat-probe-'))
const child = spawn(process.execPath, [tsx, 'server.ts'], {
  cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: mode === 'prod' ? 'production' : 'development', PORT: String(port), HOST: '127.0.0.1', CHAT_DB_PATH: join(dir, 'chat.sqlite') },
})
let out = ''
child.stdout.on('data', (c) => (out += c)); child.stderr.on('data', (c) => (out += c))
const alive = () => { try { process.kill(-child.pid, 0); return true } catch { return false } }
const deadline = Date.now() + 60000
while (!out.includes('> Ready on') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
if (!out.includes('> Ready on')) { console.log('NOT READY\n' + out); process.kill(-child.pid, 'SIGKILL'); process.exit(2) }
const t0 = Date.now()
const exited = new Promise((r) => child.once('exit', (code, sig) => r({ code, sig })))
if (target === 'cli') process.kill(child.pid, signal); else process.kill(-child.pid, signal)
const res = await Promise.race([exited, new Promise((r) => setTimeout(() => r('still running after 15 s'), 15000))])
await new Promise((r) => setTimeout(r, 300))
console.log(`mode=${mode} signal=${signal} target=${target} result=${JSON.stringify(res)} elapsed_ms~${Date.now() - t0 - 300} group_alive=${alive()}`)
console.log('--- output ---\n' + out.split('\n').filter((l) => !l.includes("NO_COLOR") && !l.includes('trace-warnings')).join('\n'))
if (alive()) { process.kill(-child.pid, 'SIGKILL'); console.log('group killed with SIGKILL by the probe') }
rmSync(dir, { recursive: true, force: true })
```

### manual-curl.sh

```bash
#!/usr/bin/env bash
# manual-curl.sh: the task's manual check. Requires port 3000 to be free; builds, starts
# `npm start` in its own session/process group, runs the curl checks, stops the group with
# SIGTERM, and confirms the exit status, that no process of the group is left, and that
# port 3000 is free again.
set -u
SP=$(dirname "$0")
LOG="$SP/npm-start.log"
if ss -ltn | grep -qE '[:.]3000\s'; then echo "port 3000 is in use; aborting"; ss -ltn | grep -E '[:.]3000\s'; exit 5; fi
echo "port 3000 free before start"
echo "== npm run build (tail) =="
npm run build > "$SP/build.log" 2>&1; rc=$?; tail -4 "$SP/build.log"; echo "build exit code: $rc"; [ $rc -eq 0 ] || exit $rc
setsid npm start > "$LOG" 2>&1 &
PG=$!
echo "npm start launched: pid=pgid=$PG"
for _ in $(seq 1 300); do grep -q '> Ready on' "$LOG" && break; sleep 0.2; done
grep '> Ready on' "$LOG" || { echo "not ready"; cat "$LOG"; kill -KILL -$PG; exit 6; }
echo '== ps of the group =='; ps -o pid=,pgid=,args= -g $PG 2>/dev/null | cut -c1-140 || ps -eo pid=,pgid=,args= | awk -v g=$PG '$2==g' | cut -c1-140
echo "== \$ curl -sI http://127.0.0.1:3000/ =="
curl -sI http://127.0.0.1:3000/; echo "[curl exit $?]"
echo "== \$ curl -sI -H 'Host: evil.example:3000' http://127.0.0.1:3000/ =="
curl -sI -H 'Host: evil.example:3000' http://127.0.0.1:3000/; echo "[curl exit $?]"
echo "== supplementary: \$ curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: LOCALHOST:3000' http://127.0.0.1:3000/ =="
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: LOCALHOST:3000' http://127.0.0.1:3000/
echo "== supplementary: \$ curl -si 'http://127.0.0.1:3000/socket.io/?EIO=4&transport=polling' | head -c 300 =="
curl -si 'http://127.0.0.1:3000/socket.io/?EIO=4&transport=polling' | head -c 300; echo
echo "== supplementary: \$ curl -si -H 'Origin: http://evil.example' 'http://127.0.0.1:3000/socket.io/?EIO=4&transport=polling' =="
curl -si -H 'Origin: http://evil.example' 'http://127.0.0.1:3000/socket.io/?EIO=4&transport=polling'; echo
echo "== supplementary: \$ curl -si -H 'Host: evil.example:3000' 'http://127.0.0.1:3000/socket.io/?EIO=4&transport=polling' =="
curl -si -H 'Host: evil.example:3000' 'http://127.0.0.1:3000/socket.io/?EIO=4&transport=polling'; echo
echo "== stop: kill -TERM -$PG =="
kill -TERM -- -$PG
wait $PG; echo "npm start exit code: $?"
sleep 0.5
if ps -eo pgid= | grep -qw "$PG"; then echo "group $PG still has processes:"; ps -eo pid=,pgid=,args= | awk -v g=$PG '$2==g'; else echo "group $PG: no processes left"; fi
if ss -ltn | grep -qE '[:.]3000\s'; then echo "port 3000 still in use"; else echo "port 3000 free after stop"; fi
echo "== npm start log =="; grep -vE 'NO_COLOR|trace-warnings' "$LOG"
```

### mutate.py

```python
#!/usr/bin/env python3
# mutate.py <file> <mutation-id>: applies one exact-string mutation to <file> in place;
# exits 3 if the original text is not found exactly once.
import sys
MUTATIONS = {
  'no-close-all-connections': (
    "      const forceClose = setTimeout(() => httpServer.closeAllConnections(), CLOSE_GRACE_MS)\n",
    "      const forceClose = setTimeout(() => {}, CLOSE_GRACE_MS)\n",
  ),
  'no-grace-period': (
    "const CLOSE_GRACE_MS = 1_000\n",
    "const CLOSE_GRACE_MS = 0\n",
  ),
  'skip-host-check-upgrade': (
    "    if (!hostPolicy.isAllowedHost(req.headers.host)) {\n      refuseUpgrade(socket, 403)\n      return\n    }\n",
    "",
  ),
  'skip-host-check-request': (
    "    if (!hostPolicy.isAllowedHost(req.headers.host)) {\n      refuseRequest(res)\n      return\n    }\n",
    "",
  ),
  'accept-any-origin': (
    "      callback(allowed ? null : ORIGIN_NOT_ALLOWED, allowed)\n",
    "      void allowed\n      callback(null, true)\n",
  ),
  'no-db-close': (
    "        closeDatabase(db)\n",
    "        void closeDatabase\n",
  ),
  'no-404-for-unowned-upgrades': (
    "    refuseUpgrade(socket, 404)\n  }\n}\n",
    "    await handleUpgrade(req, socket, head)\n  }\n}\n",
  ),
}
path, mid = sys.argv[1], sys.argv[2]
old, new = MUTATIONS[mid]
src = open(path).read()
if src.count(old) != 1:
    print(f'pattern for {mid} found {src.count(old)} times'); sys.exit(3)
open(path, 'w').write(src.replace(old, new))
print(f'applied {mid}')
```

### mutation-run.sh

```bash
#!/usr/bin/env bash
# mutation-run.sh <mutation-id>: backs up src/server/app.ts, applies the mutation, runs the
# app tests (expected to fail), restores the file, and verifies the SHA-256 is unchanged.
set -u
SP=$(dirname "$0")
F=src/server/app.ts
before=$(sha256sum "$F" | cut -d' ' -f1)
cp "$F" "$SP/app.ts.bak"
python3 "$SP/mutate.py" "$F" "$1" || { cp "$SP/app.ts.bak" "$F"; exit 3; }
git diff --no-index --stat "$SP/app.ts.bak" "$F" | tail -1
npx vitest run src/server/app.test.ts 2>&1 | grep -E "^ (FAIL|×)|Test Files|Tests  " | sed -E 's/ [0-9]+ms$//' | head -30
rc=${PIPESTATUS[0]}
echo "vitest exit code under mutation: $rc"
cp "$SP/app.ts.bak" "$F"
after=$(sha256sum "$F" | cut -d' ' -f1)
echo "sha256 before: $before"; echo "sha256 after:  $after"
[ "$before" = "$after" ] && echo "RESTORED (hash identical)" || { echo "RESTORE MISMATCH"; exit 4; }
[ "$rc" -ne 0 ] && echo "MUTATION KILLED" || echo "MUTATION SURVIVED"
```

### mutation-entry.sh

```bash
#!/usr/bin/env bash
# mutation-entry.sh: removes the SIGTERM handler registration from server.ts, runs the
# SIGTERM shutdown E2E test (production mode, existing build), restores the file, and
# verifies the SHA-256 is unchanged.
set -u
SP=$(dirname "$0")
F=server.ts
before=$(sha256sum "$F" | cut -d' ' -f1)
cp "$F" "$SP/server.ts.bak"
grep -c "^  process.on('SIGTERM', shutdown)$" "$F"
sed -i "/^  process.on('SIGTERM', shutdown)$/d" "$F"
git diff --stat -- "$F" | tail -1
npx playwright test e2e/shutdown.spec.ts -g SIGTERM --reporter=line 2>&1 | grep -E "Error:|Expected|Received|^\s+[-+] |passed|failed" | head -12
rc=${PIPESTATUS[0]}
echo "playwright exit code under mutation: $rc"
cp "$SP/server.ts.bak" "$F"
after=$(sha256sum "$F" | cut -d' ' -f1)
echo "sha256 before: $before"; echo "sha256 after:  $after"
[ "$before" = "$after" ] && echo "RESTORED (hash identical)" || { echo "RESTORE MISMATCH"; exit 4; }
[ "$rc" -ne 0 ] && echo "MUTATION KILLED" || echo "MUTATION SURVIVED"
```

### interrupt-probe.sh

```bash
#!/usr/bin/env bash
# interrupt-probe.sh <signal>: starts `npx playwright test` (dev mode) in its own process
# group, waits until a spawned server (tsx/dist/cli.mjs server.ts) exists, sends <signal>
# to the Playwright process group (as a terminal would on Ctrl+C for SIGINT), waits for
# Playwright to exit, and lists any remaining server processes after 3 s.
set -u
SIG=$1
SP=$(dirname "$0")
E2E_SERVER_MODE=dev setsid npx playwright test --reporter=line > "$SP/interrupt.log" 2>&1 &
PG=$!
for _ in $(seq 1 300); do pgrep -f 'tsx/dist/cli.mjs server.ts' >/dev/null && break; sleep 0.1; done
echo "server processes before the signal:"; ps -eo pid=,pgid=,args= | grep 'tsx/dist' | grep -v grep | cut -c1-110
kill -"$SIG" -- -$PG
wait $PG; echo "playwright exit code: $?"
sleep 3
left=$(ps -eo pid=,pgid=,args= | grep 'tsx/dist' | grep -v grep)
if [ -n "$left" ]; then echo "LEFT OVER:"; echo "$left" | cut -c1-110; else echo "no server processes left"; fi
echo "--- playwright output (tail) ---"; grep -vE 'NO_COLOR|trace-warnings' "$SP/interrupt.log" | tail -8
```

### mutation-e2e.sh

```bash
#!/usr/bin/env bash
# mutation-e2e.sh <mutation-id>: like mutation-run.sh, but runs the E2E stalled-connection
# test (production mode, existing build) against the mutated src/server/app.ts.
set -u
SP=$(dirname "$0")
F=src/server/app.ts
before=$(sha256sum "$F" | cut -d' ' -f1)
cp "$F" "$SP/app.ts.bak"
python3 "$SP/mutate.py" "$F" "$1" || { cp "$SP/app.ts.bak" "$F"; exit 3; }
npx playwright test e2e/shutdown.spec.ts -g "unfinished request" --reporter=line 2>&1 | grep -E "Shutdown did not|^\s+[-+] |passed|failed" | head -12
rc=${PIPESTATUS[0]}
echo "playwright exit code under mutation: $rc"
cp "$SP/app.ts.bak" "$F"
after=$(sha256sum "$F" | cut -d' ' -f1)
echo "sha256 before: $before"; echo "sha256 after:  $after"
[ "$before" = "$after" ] && echo "RESTORED (hash identical)" || { echo "RESTORE MISMATCH"; exit 4; }
[ "$rc" -ne 0 ] && echo "MUTATION KILLED" || echo "MUTATION SURVIVED"
```
