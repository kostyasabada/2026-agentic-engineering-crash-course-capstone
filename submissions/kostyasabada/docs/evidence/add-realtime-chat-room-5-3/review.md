# Task add-realtime-chat-room-5-3 — review

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker.
- Round: 1
- Date: 2026-09-29
- Runtime: Node v24.21.0, npm 11.19.0
- Reviewed snapshot: `snapshot.txt` revision 1 (base commit `a9a2f0e`; `git log --oneline -1` = `a9a2f0e feat: add message list, composer, and chat socket hook (task 5.2)`). `sha256sum -c` of all 14 hash lines: all OK (exit 0) at the start and again at the end of the review. `checks.txt` (outside the snapshot) SHA-256 at review time: `1207013a1bb20fcf66c6e41d2ae32ec53d54dfc90b4bab734d12d3ed960d5421`, 869 lines; unchanged by this review.
- Read: `AGENTS.md`, `docs/review-process.md`, task 5.3 in `tasks.md`, `design.md` D2, D6, Q5, Q12, the requirement "Connection status and reconnection" with all its scenarios in `specs/chat-room/spec.md`, `implementation.md`, `snapshot.txt`, `checks.txt`, the 4 PNGs (viewed), and in full: `use-chat-socket.ts`, `composer.tsx`, `connection-status.tsx`, `send-ack.ts`, `send-ack.test.ts`, `e2e/connection.spec.ts`, the diffs of `chat-room.tsx`, `globals.css`, `messaging.spec.ts`, `e2e/fixtures/chat-server.ts`; `socket.io-client` 4.8 `lookup()` and `Manager.socket()`/`_destroy()` for the listener question.
- Nothing was repaired, staged, committed, or ticked.

## Findings

| # | Severity | Location | Finding |
|---|---|---|---|
| R1 | medium (changes requested) | `e2e/connection.spec.ts:195`–`219` (and the other outage tests); code under test `src/app/_chat/use-chat-socket.ts:79` | The tests do not constrain the status while reconnection attempts are failing. Checker mutation A (`reconnect_attempt` → `Connected`) **survived all 5 connection tests** (dev, 5 passed): every outage test asserts `Reconnecting` and the disabled Send only right after the `disconnect` event, before the first backoff attempt (0.5–1.5 s) fires. With that mutation a real user sees `Connected` and an enabled Send while the server is down (spec: "While not connected, sending MUST be disabled"). A temporary probe test (created in `e2e/`, run, and deleted by the checker; not part of the snapshot) that waits, without sleeps, for at least one failed Socket.IO polling request (`page.on('requestfailed')`) after `chatServer.stop()` and then asserts `Reconnecting` and a disabled Send **failed under mutation A** (`Expected "Reconnecting"`, `Received "Connected"`) and **passed 3/3 unmutated** (dev). Requested: add an equivalent assertion (at least to the stop-server test) so that the status and the disabled Send are checked after a failed reconnection attempt. The implementation itself is correct (manual check below: still `Reconnecting` after several attempts). |
| R2 | low (no change required) | `src/app/_chat/use-chat-socket.ts:93`–`94` | F1 is resolved: the manager listeners are registered and removed in the same effect and the comment (lines 53–54) is accurate. Checker mutation C (both `manager.off` lines removed) survived all tests, and no behavioural test can detect it: in socket.io-client 4.8 `Manager._destroy()` does not delete `nsps['/']`, so the StrictMode second mount's `io()` sees `sameNamespace` and creates a **new** Manager; the first (cached) manager is closed and never reused, so leaked listeners on it would never fire. The `off` calls are correct hygiene; recorded only so that nobody claims a test covers them. |
| R3 | low (evidence) | `docs/evidence/add-realtime-chat-room-5-3/status-connected.png` | The screenshot was taken while the send was still in flight: "Hello before the outage" is still in the input, Send is disabled, and the list is empty, although `implementation.md` says the helper "sends a message" first (`getByText(...).last()` evidently matched before the list item existed). Supplementary only; the other three screenshots show the stated states. Optional: retake or describe it accurately. |
| R4 | info (evidence) | `checks.txt` entry `2026-09-29T13:44:36Z` | An intermediate failed check (typecheck exit 2, four TS2532 errors in `connection.spec.ts`; combined entry `[exit 1]`) is recorded honestly in `checks.txt` but not mentioned in `implementation.md`. Optional one-line mention. |
| R5 | info | `e2e/connection.spec.ts:399`–`428` | The `io server disconnect` test asserts `Disconnected`, disabled Send, and kept text, but not that the client stays disconnected (no automatic reconnect). Optional; mutation D (disconnect always `Reconnecting`) is caught. |

No other defects found. Checked and correct:

- Status mapping (D2): `connect` → Connected; `disconnect` → `socket.active ? Reconnecting : Disconnected`; manager `reconnect_attempt` → Reconnecting; `reconnect_failed` → Disconnected; `connect_error` with `!socket.active` → Disconnected; cleanup removes socket listeners before `disconnect()`, so the client's own disconnect does not set state after unmount.
- `reconnectionDelayMax: 2000`; `auth` as a function sending the current `lastSeenId`; catch-up via `applyHistory` (append merged by id, replace discards the list, rule (b)).
- Send disabled whenever `status !== 'Connected'`, Enter blocked by the same `canSend`, input editable, draft kept; no queue; `send()` also refuses when `!socket.connected`.
- F2 resolved: `readSendAck` is a zod `safeParse` and cannot throw; the composer resets the pending state in `finally` and maps a thrown `onSend` to a visible error. `send-ack.test.ts` covers valid ok/error acks, stripping of extra fields, and 16 malformed shapes; the E2E test replaces real server acks with 5 malformed ones and then a valid one.
- Accessible status: `<p role="status" aria-live="polite">` with exactly the label text; colour is redundant with the text.
- `resetDatabase()` throws while the child is running and removes the DB file plus `-wal`/`-shm` with `force: true`; only `connection.spec.ts` uses it; all 43 E2E tests pass in both modes.
- catch-up technique: `routeWebSocket` forwards real traffic to the real server; `cut()` aborts polling first (so the client cannot silently reconnect via polling) and then closes both ends, producing a genuine `transport close` in the client and a genuine socket removal on the server; the assertions check the real server's `history` packets (`append` of exactly `m1`, `m2`). This tests the product, not a mock.
- Console allowlist: exact text and URL prefix, only for pages inside a declared outage window. Verified by disabling it once (below): exactly that message appears, in a different test than in the maker's calibration, which confirms that it is timing-dependent and that the allowlist is needed and not broader than necessary.

## Decisions asked for by the maker

- **`io server disconnect` → terminal `Disconnected`: recommended to keep.** D2 maps "disconnect with reconnection given up or not attempted → `Disconnected`", and socket.io-client itself does not reconnect after a server-side namespace disconnect (`socket.active` is false). The spec's "SHALL try to reconnect automatically" is exercised by its scenarios for a connection loss and a server restart, both of which are `transport close` and reconnect (tested). The server never sends this packet today, so there is no user-visible difference now; an automatic `connect()` would defeat any future deliberate server-side end of a session. This is a reading of the spec, so the user should confirm it; an optional UI hint such as "reload to reconnect" would be a scope expansion for the user to decide.
- **Initial status `Disconnected`: recommended to keep.** The spec allows only the three labels; before the first `connect` the client is not connected, so `Connected` would be false and `Reconnecting` would be inaccurate before any attempt. If the first connection fails, `reconnect_attempt` switches to `Reconnecting`. In practice it lasts until the first handshake (well under a second locally).
- **Next.js dev HMR.** The manual check confirmed the maker's analysis: with `npm run dev`, restarting the server makes the Next.js HMR client reload the whole page, and the typed draft is lost. With `npm start` there is no reload and the draft is kept. This is framework development tooling, not the product; the E2E route only withholds the HMR socket's close from the page and does not touch the chat's Socket.IO traffic, so it does not mask a chat defect, and prod (the authoritative mode) runs without it. Recommended: note this dev-only behaviour in `docs/testing.md` or the README at some point; not a blocker.

## Evidence honesty

- Red runs genuine: unit red (missing module, exit 1); E2E red attempt 1 with the `procs.sh`-masked `[exit 0]` kept and explained in the following NOTE entry; red attempt 2 with 6 failed, exit 1, and failure reasons matching missing UI and the 5.2 ack bug.
- Green attempts 1 (2 failed) and 2 (5 failed) are recorded with causes; attempt 3 passed.
- Allowlist calibration and mutations 1–6 each end with `RESTORED: hashes match`; mutation 4/4b nested restores both match; the `�` from `cut -c1-220` is disclosed in `implementation.md`.
- Final entry: snapshot verified, no processes, port 3000 free, no temp dirs, nothing staged.
- See R3 and R4 for the two small inaccuracies/omissions.

## Independent checks (checker, Node v24.21.0; outputs kept in the checker's scratchpad)

| Check | Result |
|---|---|
| `sha256sum -c` of the snapshot hash lines (from the repository root) | 14 OK, exit 0 (start and end) |
| `sha256sum checks.txt` | `1207013a…d5421` |
| `E2E_SERVER_MODE=dev npx playwright test e2e/connection.spec.ts --repeat-each=5` | 25 passed, 0 flaky, exit 0 |
| `npm run build && npx playwright test e2e/connection.spec.ts --repeat-each=3` (prod) | 15 passed, 0 flaky, exit 0 |
| `npx vitest run src/app/_chat/send-ack.test.ts` | 19 passed, exit 0 |
| `npm run test:unit` | 10 files, 465 passed, exit 0 |
| `npm run lint` / `npm run typecheck` | exit 0 / exit 0 |
| `npm run test:e2e` | 43 passed, exit 0 |
| `npm run test:e2e:dev` | 43 passed, exit 0 |
| `npm run check` | exit 0 (465 unit, 43 E2E) |
| `npm run check:loop` | exit 0 (465 unit, 43 E2E) |
| `git diff --check` | exit 0 |
| `git diff --no-index --check /dev/null <file>` for `e2e/connection.spec.ts`, `connection-status.tsx`, `send-ack.ts`, `send-ack.test.ts`, `implementation.md`, `snapshot.txt`, `checks.txt` | exit 1 each (differs, no whitespace problem) |
| `git status --short` | same 6 modified and 5 untracked entries as the snapshot; nothing staged |

### Checker mutations (dev, one replacement each, restored with matching SHA-256)

| # | Mutation | Result |
|---|---|---|
| A | `use-chat-socket.ts`: `reconnect_attempt` → `setStatus('Connected')` | **survived**: 5/5 passed (R1). With the temporary probe test: probe failed (`Received "Connected"`), the 5 existing tests passed. Restored `6916434961c9…0eaa36` |
| B | `composer.tsx`: `value={connected ? value : ""}` (draft not kept offline) | caught: stop-server test and `io server disconnect` test failed at `toHaveValue` (`Received ""`); 3 passed. Restored `5942b1e4…441179` |
| C | `use-chat-socket.ts`: both `manager.off(...)` lines removed | survived, 5/5 passed; not detectable by behaviour (R2). Restored `6916434961c9…0eaa36` |
| D | `use-chat-socket.ts`: `disconnect` → always `Reconnecting` (ignores `socket.active`) | caught: `io server disconnect` test failed (`Expected "Disconnected"`, `Received "Reconnecting"`). Restored `6916434961c9…0eaa36` |
| E | `connection.spec.ts`: allowlist disabled (`isToleratedOutageError` → `return false`), `--repeat-each=3` | 1 of 15 failed (rule-(b) test, repeat 2) with exactly `A console: Failed to load resource: net::ERR_CONNECTION_REFUSED (http://127.0.0.1:PORT/socket.io/?EIO=4&transport=polling&t=T)`; 14 passed. Restored `be40eaa7…c7769` |

The probe file `e2e/zz-checker-probe.spec.ts` (a copy of `connection.spec.ts` plus one probe test) existed only during these runs and was deleted; `ls e2e` afterwards shows only the original files.

## Manual check

- `npm run dev` with `CHAT_DB_PATH` in the checker's scratch directory, port 3000, own process group; page opened in the built-in browser pane (the stored nickname "Checker" from the browser's local storage was used). Sent "manual hello" (shown in the list), set a `window` marker, typed a draft.
- SIGINT to the server's process group ("Received SIGINT, shutting down", "Server closed"; port free): DOM showed status `Reconnecting`, Send disabled, draft kept, marker present.
- Restarted `npm run dev`: status `Connected`, Send enabled, history shown once — but the marker was gone and the input empty: **the Next.js dev HMR client reloaded the page** (see Decisions).
- Same procedure with `npm start` (production build from the checks above): after SIGINT the status stayed `Reconnecting` with Send disabled after more than 3 s (several attempts), draft "prod draft" kept; after restart `Connected`, Send enabled, draft kept, marker present (no reload), history "manual hello" shown once.
- The pane's screenshots lagged behind the DOM while the pane was hidden, so the states were read from the DOM with `javascript_tool`; no screenshots from the manual check are stored.
- Afterwards: servers stopped (process groups gone), browser tab closed, the scratch database directory removed, no matching `server.ts|next|playwright|vitest|tsx` processes, port 3000 free, 0 `chat-e2e-*`/`chat-shots-*` temp dirs.

## Limitations

- Mutation runs were done in dev mode only; prod was covered by the repeat runs and the full suites.
- `reconnect_failed` → `Disconnected` is not exercised (unlimited attempts), as disclosed by the maker.
- The manual check used one browser; no second client.
- Timing-dependent behaviour (the allowlist window, R1) was sampled with 25 dev + 15 prod repeats; no flakiness was observed.

## Verdict

**changes requested** — R1 (add an assertion that the status stays `Reconnecting` and Send stays disabled after a failed reconnection attempt). R3 and R4 are optional evidence fixes; R2 and R5 need no change. After the fix, the checker should rerun `connection.spec.ts` (dev `--repeat-each=5`, prod `--repeat-each=3`), mutation A, and `npm run check`.

## Round 2

- Checker: the same Claude Code general-purpose subagent (checker) as round 1, separate from coordinator and maker.
- Date: 2026-09-29. Runtime: Node v24.21.0.
- Reviewed snapshot: `snapshot.txt` revision 2 (base `a9a2f0e`; `git log --oneline -1` = `a9a2f0e`). `sha256sum -c` of its 15 hash lines: all OK (exit 0). `checks.txt` SHA-256 at review time: `ce8f9960b406062bf8dfbbf16c31fc519cb60b5ddda8d3dd7ac4fb428fc55336`, which matches the value stated in `snapshot.txt`.
- Read: the "Round 2" section of `implementation.md`, the "ROUND 2" part of `checks.txt`, `snapshot.txt` revision 2, the changed parts of `e2e/connection.spec.ts` (new helpers `reconnectAttemptFailed` and `expectStillReconnecting`, `NO_RECONNECT_WINDOW_MS`, the stop-server, restart, catch-up, and `io server disconnect` tests), the `docs/testing.md` diff, and the four regenerated PNGs (viewed).
- Product code unchanged from revision 1: `use-chat-socket.ts`, `send-ack.ts`, `send-ack.test.ts`, `connection-status.tsx`, `composer.tsx`, `chat-room.tsx`, `globals.css`, `messaging.spec.ts`, and `e2e/fixtures/chat-server.ts` have the same hashes in revisions 1 and 2. Changed: `e2e/connection.spec.ts` (`be40eaa7…` → `f8eeb74e…`), new in the snapshot: `docs/testing.md`, and the four PNGs.

### User decisions

The coordinator relayed the user's decision of 2026-09-29, "так, приймаю, виправляй" (translated: "yes, I accept, fix it"): `io server disconnect` stays a terminal `Disconnected`, the initial status is `Disconnected`, add the dev-mode HMR note to `docs/testing.md`, and fix R1 and R3–R5. `implementation.md` (Round 2, "User decisions") records the same wording, translation, and scope. The checker has no source for this decision other than the coordinator's message.

### Resolution of round-1 findings

| # | Resolution | Checker verification |
|---|---|---|
| R1 | Resolved. `reconnectAttemptFailed(page)` (`e2e/connection.spec.ts:183`) is registered before the outage. It waits for Playwright's `requestfailed` event on a Socket.IO polling request **without `sid=`** (a new handshake). `expectStillReconnecting` (`:194`) then asserts `Reconnecting` and a disabled Send. It is used in the stop-server (`:237`/`:244`), restart (`:277`/`:282`), and catch-up (`:362`/`:366`) tests. | Sound: socket.io-client's `Manager.reconnect()` emits `reconnect_attempt` before it opens the new engine, so a failed handshake proves that a backoff attempt ran. A failing poll of the old session carries `sid=` and is excluded, so it cannot satisfy the wait early. In the catch-up test the failure is the test's own `route.abort` of that handshake, which is also after `reconnect_attempt`. Checker mutation A rerun (`reconnect_attempt` → `Connected`): **3 failed** (stop-server, restart, catch-up; `Expected "Reconnecting"`, `Received "Connected"`), 2 passed. Restored, SHA-256 `6916434961c9…0eaa36` matches. |
| R2 | No change needed (unchanged, as agreed). | — |
| R3 | Resolved. All four PNGs were regenerated. The helper now waits until the message is in the list, the input is empty, and Send is enabled. | Viewed: `status-connected.png` shows `Connected`, "Hello before the outage" in the list, empty input (`0/1000`), and Send enabled. `status-reconnecting.png` shows `Reconnecting` with the draft kept and Send disabled. `status-connected-after-restart.png` shows `Connected` with the draft kept and Send enabled. `status-disconnected.png` shows `Disconnected` with Send disabled. |
| R4 | Resolved. `implementation.md` Round 2 "R4" describes the `13:44:36Z` entry (typecheck exit 2, four TS2532 errors, entry `[exit 1]`), its cause, and the fix. | Matches `checks.txt`. |
| R5 | Resolved. After injecting `41`, the test waits up to `NO_RECONNECT_WINDOW_MS` = 4 s (`:20`) for any Socket.IO polling request and requires none (`:465`–`:475`). It then asserts `Disconnected`, disabled Send, and the kept text again. | The bound is correct for the configured client: the default `reconnectionDelay` is 1000 ms and `randomizationFactor` 0.5, so the first attempt comes within 0.5–1.5 s, and `reconnectionDelayMax` is 2000 ms (design D2). 4 s is twice the maximum. It is event-based, not a sleep, and every reconnection starts with a polling handshake (default transports). Checker mutation (after `io server disconnect`, `setTimeout(() => socket.connect(), 1500)`): the test **failed** (`Received "reconnection attempted: http://127.0.0.1:<port>/socket.io/?EIO=4&transport=polling&t=…"`), the other 4 passed. Restored, hash matches. The bound would not catch a hypothetical reconnect delayed by more than 4 s, which no socket.io-client default produces; acceptable. |

- **Allowlist:** unchanged and still exact (same text, same URL prefix, same outage window). The failed handshake that R1 waits for is exactly the allowlisted message inside the declared outage.
- **`docs/testing.md` note:** accurate against the checker's round-1 manual check. In dev the HMR client reloads the page after a dev-server restart and a typed draft is lost. With `npm start` the page reconnects without a reload and keeps the draft. The note also says that `connection.spec.ts` withholds the HMR socket's close in dev.

### New findings

None.

### Independent checks (round 2)

| Check | Result |
|---|---|
| `sha256sum -c` snapshot revision 2 (15 lines) | all OK, exit 0 |
| `sha256sum checks.txt` | `ce8f9960…55336` (matches `snapshot.txt`) |
| Mutation A (dev) | 3 failed, 2 passed; restored with matching hash |
| R5 mutation, delayed `socket.connect()` (dev) | 1 failed (`io server disconnect` test), 4 passed; restored with matching hash |
| `E2E_SERVER_MODE=dev npx playwright test e2e/connection.spec.ts --repeat-each=5` | 25 passed, 0 flaky, exit 0 |
| `npm run build && npx playwright test e2e/connection.spec.ts --repeat-each=3` (prod) | 15 passed, 0 flaky, exit 0 |
| `npm run test:unit` | 465 passed, exit 0 |
| `npm run lint` / `npm run typecheck` | exit 0 / exit 0 |
| `npm run test:e2e` / `npm run test:e2e:dev` | 43 passed / 43 passed, exit 0 each |
| `npm run check` / `npm run check:loop` | exit 0 each (465 unit, 43 E2E) |
| `git diff --check` | exit 0 |
| `git diff --no-index --check /dev/null <file>` for every untracked non-PNG file (4 evidence files, `connection.spec.ts`, `connection-status.tsx`, `send-ack.ts`, `send-ack.test.ts`) | exit 1 each (differs, no whitespace problem) |
| `git status --short` | 7 modified (the round-1 six plus `docs/testing.md`), 5 untracked entries; nothing staged |
| Processes (`server.ts\|next\|playwright\|vitest\|tsx`), port 3000, `chat-e2e-*`/`chat-shots-*` temp dirs | none, free, 0 |

### Limitations (round 2)

- The manual browser check was not repeated in round 2, because product code is unchanged from revision 1 (hash-verified).
- As the maker notes, the rule-(b) and `io server disconnect` tests have no failed-attempt assertion. This is acceptable, because three other tests catch mutation A.
- `reconnect_failed` → `Disconnected` remains unexercised (unlimited attempts).

### Verdict (round 2)

**accepted** — snapshot revision 2. All round-1 findings are resolved or need no change, there are no new findings, and all required checks pass.
