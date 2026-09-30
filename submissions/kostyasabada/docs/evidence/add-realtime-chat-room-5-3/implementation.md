# Task add-realtime-chat-room-5-3 — implementation report

- Task: 5.3 in `openspec/changes/add-realtime-chat-room/tasks.md` (connection status and reconnection, red-first E2E in `e2e/connection.spec.ts`), plus the items carried over from the review of task 5.2 (F1, F2, `io server disconnect`, accessible status).
- Maker: Claude Code general-purpose subagent (maker). Fresh subagent with a scoped handoff from the coordinator.
- Base commit: `a9a2f0e`. Nothing staged or committed; the checkbox of task 5.3 is not ticked; the agent loop was not run.
- Snapshot: `snapshot.txt` (revision 1; SHA-256 of every deliverable and screenshot, paths from the repository root).
- Raw command output: `checks.txt` (append-only log written by `rec53.sh`; every attempt, including failures). Each entry's `# <time>` header is written when the command has finished.
- Runtime: Node v24.21.0, npm 11.19.0 (first entry of `checks.txt`).

## Files

| File | Status | Purpose |
|---|---|---|
| `src/app/_chat/use-chat-socket.ts` | modified | `status` (`Connected` / `Reconnecting` / `Disconnected`) from socket and manager events; manager listeners registered and removed in the socket effect (F1); ack read through `readSendAck` (F2) |
| `src/app/_chat/send-ack.ts` | new | Pure `readSendAck(ack: unknown)`: shape check of the `message:send` ack with zod; never throws |
| `src/app/_chat/send-ack.test.ts` | new | 19 Vitest unit tests (valid ok/error acks, 16 malformed shapes); red first |
| `src/app/_chat/connection-status.tsx` | new | `<p role="status" aria-live="polite">` with the exact label text |
| `src/app/_chat/composer.tsx` | modified | `try/catch/finally` around `onSend`: the pending state is always reset; a thrown error becomes a visible send error (F2) |
| `src/app/_chat/chat-room.tsx` | modified | Renders `ConnectionStatus` above the message list inside region "Chat" |
| `src/app/globals.css` | modified | Status styles (colour tokens `--ok`, `--warn` for light and dark; the text label carries the meaning, the dot only repeats it) |
| `e2e/connection.spec.ts` | new | 5 Playwright tests (red first) |
| `e2e/messaging.spec.ts` | modified | Helper `routeAcks` and 1 test for malformed acks (F2; red first) |
| `e2e/fixtures/chat-server.ts` | modified | `resetDatabase()`: deletes the DB file and its `-wal`/`-shm` files while the server is stopped (throws while running) |
| `docs/evidence/add-realtime-chat-room-5-3/*.png` | new | Supplementary screenshots |

No new dependencies. No server code, shared schema, `merge-messages.ts`, Playwright or ESLint configuration, spec, or design file was changed. Existing tests are unchanged except for the added test and helper in `messaging.spec.ts`.

## Hook and status design (design D2, Q5)

- `useChatSocket()` now returns `{ messages, status, connected, send }`, with `connected === (status === 'Connected')`, so the composer contract is unchanged.
- Mapping (all listeners in the one socket effect; the manager listeners are removed explicitly in its cleanup because `socket.removeAllListeners()` does not touch the manager — this makes the 5.2 comment true, F1):
  - socket `connect` → `Connected`.
  - socket `disconnect` → `socket.active ? 'Reconnecting' : 'Disconnected'`. `socket.active` is socket.io-client's own flag for "will reconnect by itself": true after `transport close` / `ping timeout` (stopped server, dropped connection, and the controller's `socket.conn.close()` when `historyFor` fails — task 4.1), false after `io server disconnect` and `io client disconnect`.
  - manager `reconnect_attempt` → `Reconnecting` (also while the very first connection is retried).
  - manager `reconnect_failed` → `Disconnected` (attempts exhausted; with the default unlimited attempts this does not happen, kept for D2 completeness).
  - socket `connect_error` after which the socket is no longer active (a server middleware refused the namespace) → `Disconnected`.
  - Initial state (before the first `connect`): `Disconnected`.
- **`io server disconnect` decision:** shown as `Disconnected` and treated as terminal (no `connect()` call; a reload reconnects). Reason: D2 maps "reconnection not attempted" to `Disconnected`, and the server never ends a session itself — its controller deliberately closes only the transport so that clients reconnect (task 4.1). A deliberate server-side end of a session (e.g. a future ban) would be defeated by an automatic `connect()`. Covered by the E2E test with an injected `41` packet. See "Needs a user decision".
- Backoff: unchanged from 5.2, `reconnectionDelayMax: 2000` (D2/Q5). No offline queue: Send is disabled whenever `status !== 'Connected'`, Enter is blocked the same way, the input stays editable and its text is kept.
- Catch-up: unchanged from 5.2 — `auth` is a function reading the current highest id, so each reconnect sends `lastSeenId`; `history` `append` is merged by id, `replace` discards the list (rule (b)).
- Status markup: `<p role="status" aria-live="polite" class="connection-status" data-status="…">Connected</p>` — the accessible text is exactly the label; tests locate it with `getByRole('status')` inside region "Chat".
- **F2 (malformed ack):** `readSendAck` accepts only `{ ok: true, message: { id: int, nickname: string, text: string, createdAt: string } }` or `{ ok: false, error: { message: string } }`; anything else gives `Message not confirmed: the server sent an invalid response.` ("not confirmed", because the server may have stored the message — the E2E test shows the broadcast still displays it). The composer additionally resets its pending state in `finally` and shows `Message not sent: an unexpected error occurred.` if `onSend` ever throws (mutation 6 shows this fallback in action).

## Design choices

- **Catch-up while the server stays up: `page.routeWebSocket` (D6 preferred technique, Q12), not the fallback.** B's Socket.IO WebSocket is routed through the test; after the engine.io upgrade (`5`), `cut()` first blocks B's polling requests with `page.route(…, route.abort('connectionrefused'))` (a reconnection starts with polling and would otherwise succeed at once) and then closes both ends of the routed WebSocket; the client sees `transport close` → `Reconnecting`. A sends `m1`, `m2` meanwhile; `restore()` unroutes polling and Socket.IO's own backoff reconnects. The test also records the `history` packets from B's polling responses and asserts that the catch-up was `append` of exactly `m1`, `m2` (lastSeenId path), and that live delivery works afterwards. No limitation to record for the fallback.
- **"Newer than the server's history": fixture reset helper, no limitation.** The test follows the spec example: seed 120 messages (`old 1`–`old 120`), the client shows the latest 100 and has `lastSeenId` 120; stop, `resetDatabase()`, seed 30 (`new 1`–`new 30`), start; the client shows exactly `new 1`–`new 30`, no `old` message, the recorded second `history` is `replace`, and the next sent message is appended. The Node-level tests of 3.2/4.1 are not needed as a substitute.
- **Next.js dev HMR.** In dev mode the Next.js HMR client reloads the page when it reconnects to a restarted dev server (`window.location.reload()` on a new session id in `next/dist/client/dev/hot-reloader/app/web-socket.js`); green attempt 1 failed exactly there (`expectNotReloaded`). Fully mocking the HMR socket (attempt 2) broke the dev page (the nickname form never rendered, all connection tests failed). Final: the `/_next/hmr` WebSocket is forwarded normally, only the server-side close is not passed to the page (`server.onClose(() => {})`), so the dev HMR client never notices the restart. In prod there is no HMR socket, so the route never matches; prod is the authoritative run.
- **Disconnected state in E2E.** Injecting the Socket.IO namespace DISCONNECT packet `41` into the routed WebSocket reproduces `io server disconnect` without changing the server.
- **No sleeps.** All waits are on status text, button state, list contents, or `expect.poll` on recorded packets / the upgrade flag. The reconnect assertions use a 15 s timeout (backoff ≤ 2 s plus server start), documented in the spec.
- **"No reload"** is proven by a `window` marker set before the outage and read after `Connected`.
- **Test helpers duplicated** from `messaging.spec.ts` (region/role locators, `readMessages`, `openClient`), following the existing per-spec convention; no shared helper module was introduced.

## Console-error allowlist (exact)

Only in `e2e/connection.spec.ts`, only for a page for which the test has declared an outage (`outage.add(page)` right before stopping the server or cutting the connection; `outage.delete(page)` right after `Connected` is shown again), and only this exact message: text `Failed to load resource: net::ERR_CONNECTION_REFUSED` **and** source URL starting with `<baseURL>/socket.io/?EIO=4&transport=polling`. Everything else (other texts, other URLs, any error outside the window, page errors, dialogs) still fails the test. Calibration (`checks.txt`, "ALLOWLIST CALIBRATION"): with the allowlist disabled, dev mode produced exactly one such error in one test (restart test, client B, polling URL; it depends on whether a backoff attempt falls into the outage) and prod `--repeat-each=3` produced none (15 passed). A `WebSocket connection … failed` form was in the first draft but was never observed and was removed. `messaging.spec.ts` keeps its unconditional check (no allowlist).

## Criteria mapping (task 5.3 and carried-over items → test)

| Criterion / spec scenario | Test |
|---|---|
| Stopping the fixture server shows `Reconnecting` or `Disconnected`, sending disabled, typed text kept ("Connection loss is visible"; also Enter blocked, no send error, input still editable, list kept) | `connection.spec.ts:195` `stopping the server shows Reconnecting and disables sending while the typed text is kept` |
| Restarting shows `Connected` without reload, sending enabled ("Automatic reconnection"); "Reconnect after server restart" (two clients, persisted history without duplicates, draft kept and then delivered once) | `connection.spec.ts:221` `after a server restart the clients reconnect without a reload, show Connected, and keep the history without duplicates` |
| Missed messages caught up in order without duplicates, server kept running, `page.routeWebSocket` ("Missed messages are caught up"; catch-up is `append` of exactly m1, m2) | `connection.spec.ts:299` `messages sent while a client is disconnected are caught up in order without duplicates` |
| Last seen message newer than the server's history → list replaced, none of the earlier shown (spec example 120 → 30; fixture `resetDatabase()`) | `connection.spec.ts:353` `a client whose last seen message is newer than the server's history replaces its list with the server's messages` |
| `Disconnected` label; `io server disconnect` handling (carried-over item) | `connection.spec.ts:399` `a session ended by the server shows Disconnected and disables sending while the typed text is kept` |
| Accessible status (`role="status"`, exact label; E2E via roles) | all connection tests (`getByRole('status')` in region "Chat") |
| F1: reconnect listeners registered in the hook, comment accurate | `use-chat-socket.ts` (code + doc comment); behaviour by all connection tests; mutation 1 |
| F2: malformed ack is a failure, pending reset | `messaging.spec.ts:535` `a malformed acknowledgement shows an error, keeps the text, and re-enables sending` (5 malformed acks via `routeAcks`, then a valid one); unit `send-ack.test.ts` (19); mutation 6 |
| "More than 100 missed messages" | not in the 5.3 task list; not tested here (covered at Node level by tasks 3.2/4.1) |

## Red runs (`checks.txt`)

- **Unit, red:** `npx vitest run src/app/_chat/send-ack.test.ts` before `send-ack.ts` existed → failed suite (missing module), exit 1.
- **E2E, red attempt 1 (dev):** `connection.spec.ts` + messaging with `-g "connect|server|malformed"` → 6 failed, 3 passed. The recorded `[exit 0]` of that entry is the exit code of the trailing `procs.sh`, not of Playwright (noted in the next entry); the 3 passed were existing messaging tests matched by `-g "server"`.
- **E2E, red attempt 2 (dev, exit captured):** `connection.spec.ts` + `messaging.spec.ts:535` → **6 failed**, exit 1. The five connection tests fail at the first status assertion (no `role="status"` element); the malformed-ack test fails with no alert shown and `pageerror: Cannot read properties of undefined (reading 'message')` (the 5.2 bug).
- **Green attempt 1 (dev):** 4 passed, 2 failed (`expectNotReloaded` in the two restart tests: Next.js dev HMR reload). **Attempt 2:** HMR socket fully mocked → 5 failed (page never rendered). **Attempt 3:** HMR forwarded without close propagation → 6 passed, exit 0.

## Mutation checks (dev, each restored with a SHA-256 match; `mutate53.sh`)

| # | Mutation | Result |
|---|---|---|
| 1 | Status never leaves `Connected` (`disconnect` and `reconnect_attempt` handlers do nothing) | 5/5 connection tests failed (`Expected "Reconnecting"/"Disconnected", Received "Connected"`) |
| 2 | Sending not disabled offline (`canSend` ignores `connected`) | 4 failed at `toBeDisabled`, 1 passed (the rule-(b) test has no disabled assertion) |
| 3 | Rule (b) broken: `replace` merged into the current list | rule-(b) test failed (old messages still shown, +360 lines of diff); the other 4 passed |
| 4 | No dedupe in `mergeMessages` + handshake sends `lastSeenId - 1` | catch-up test failed — already before the outage (own `b1` twice: ack + broadcast) plus React duplicate-key console errors |
| 4b | Catch-up path only: `append` concatenated without merging + `lastSeenId - 1` (overlap of one message) | catch-up test failed after the reconnect (`b1` twice) plus duplicate-key console error |
| 5 | Handshake never sends `lastSeenId` | catch-up test failed on the recorded history (`replace` instead of `append`), although the visible list would have been right |
| 6 | F2: hook trusts the ack again (5.2 logic), composer guard kept | malformed-ack test failed on the text (`Message not sent: an unexpected error occurred.`) — Send re-enabled, showing the composer `finally` fallback |

Mutations 4 and 4b are nested runs (two files, inner helper bodies are in `checks.txt`); both files were restored with matching hashes. In mutation 4b's output, `cut -c1-220` split a multi-byte character (a `�` appears in `checks.txt`); nothing else was affected.

## Final checks (`checks.txt`)

| Check | Result |
|---|---|
| `npx playwright test e2e/connection.spec.ts --repeat-each=3` (prod, after `npm run build`) | 15 passed, exit 0 |
| `E2E_SERVER_MODE=dev npx playwright test e2e/connection.spec.ts --repeat-each=3` | 15 passed, exit 0 |
| `npm run test:unit` | 10 files, 465 tests passed, exit 0 |
| `npm run lint` / `npm run typecheck` | exit 0 / exit 0 |
| `npm run test:e2e` (build + all specs, prod) | 43 passed, exit 0 |
| `npm run test:e2e:dev` | 43 passed, exit 0 |
| `npm run check` | exit 0 (465 unit, 43 E2E) |
| `npm run check:loop` | exit 0 (465 unit, 43 E2E) |
| `openspec validate add-realtime-chat-room --strict` | valid, exit 0 |
| Whitespace calibration (scratch file with one trailing space) | reported, exit 3 |
| `git diff --check` (tracked) | exit 0 |
| `git diff --no-index --check /dev/null <file>` per untracked text file | exit 1 each (differs, no whitespace issue); `implementation.md` and `snapshot.txt` checked in the final entry |
| Processes (server.ts/next/playwright/vitest/tsx), port 3000, temp dirs | none left, no listener, 0 `chat-e2e-*`/`chat-shots-*` dirs (final entry) |

## Screenshots (supplementary; prod server, `screens53.mts`)

`status-connected.png`, `status-reconnecting.png` (server stopped; typed text kept, Send disabled), `status-connected-after-restart.png` (same page, no reload), `status-disconnected.png` (injected `41`). Screenshot attempt 1 failed (the `41` was injected into the pre-restart WebSocket because the helper's upgrade flag was not reset); attempt 2 succeeded. Screenshots do not prove behaviour; the E2E tests do.

## Limitations and open issues

- `io server disconnect` is terminal (`Disconnected` until reload); the spec sentence "The client SHALL try to reconnect automatically" is read as applying to connection loss, not to a server-ended session. Needs confirmation (below).
- Initial status before the first connection is `Disconnected` (the spec has no "Connecting" label); it normally lasts only until the first `connect`.
- In dev mode the Next.js HMR socket's close is withheld from the page by the test (see Design choices); prod runs without any HMR routing.
- The catch-up test blocks polling with `route.abort('connectionrefused')`; aborted requests produced no console errors in any run.
- `reconnect_failed` → `Disconnected` is not exercised (unlimited attempts by default).
- The history packets are read from polling responses; if a future config used WebSocket-only transport, `recordHistory` would need to read WebSocket frames too.
- "More than 100 missed messages" is not an E2E test in 5.3 (not in the task list).

## Needs a user decision

- Handling of `io server disconnect`: current choice terminal `Disconnected` (D2 "not attempted"). Alternative: show `Disconnected` and call `socket.connect()` (automatic retry). The server never sends it today, so there is no user-visible difference now.

## Helper bodies

All helpers live in the Claude Code scratchpad directory of this session, not in the repository. `rec53.sh` and `mutate53.sh` were derived from the 5.2 helpers (only the task directory and backup names changed); `procs.sh` is the unchanged 5.2 helper.

### `rec53.sh`

```bash
#!/usr/bin/env bash
# rec53.sh '<command>': runs <command> with bash -c in the submission root and appends a
# timestamped entry ("$ <command>", combined stdout/stderr, measured exit code) to
# checks.txt. Trailing spaces/tabs and CRs in recorded lines are shown as [SPACE]/[TAB]/[CR].
set -u
ROOT=/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada
OUT="$ROOT/docs/evidence/add-realtime-chat-room-5-3/checks.txt"
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
export OPENSPEC_TELEMETRY=0 NO_COLOR=1
unset FORCE_COLOR
mark() { sed -E 's/\r/[CR]/g; :a; s/ ((\[SPACE\]|\[TAB\])*)$/[SPACE]\1/; s/\t((\[SPACE\]|\[TAB\])*)$/[TAB]\1/; ta'; }
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

### `mutate53.sh`

```bash
#!/usr/bin/env bash
# mutate53.sh <file> <test-command> <old1> <new1> [<old2> <new2> ...]: backs up <file> to
# the scratchpad, replaces each <old> (which must occur exactly once) with its <new>, shows
# the diff, runs <test-command> with bash -c, restores the backup, and verifies that the
# SHA-256 of the restored file equals the original.
set -u
f=$1; cmd=$2; shift 2
SP=/tmp/claude-1000/-home-ksabada-projects-AI-course-2026-agentic-engineering-crash-course-capstone/4034e690-c8bb-4005-a19e-8b3d5038ed0e/scratchpad
before=$(sha256sum "$f" | cut -d' ' -f1)
cp "$f" "$SP/mutation53-backup-$(basename "$f")"
python3 - "$f" "$@" <<'PY' || { echo "mutation not applied"; cp "$SP/mutation53-backup-$(basename "$f")" "$f"; exit 98; }
import sys
p, pairs = sys.argv[1], sys.argv[2:]
s = open(p, encoding='utf-8').read()
for old, new in zip(pairs[0::2], pairs[1::2]):
    if s.count(old) != 1: sys.exit(f"expected exactly one occurrence of {old!r}, found {s.count(old)}")
    s = s.replace(old, new)
open(p, 'w', encoding='utf-8').write(s)
PY
diff "$SP/mutation53-backup-$(basename "$f")" "$f"
bash -c "$cmd"
echo "mutated run exit: $?"
cp "$SP/mutation53-backup-$(basename "$f")" "$f"; rm -f "$SP/mutation53-backup-$(basename "$f")"
after=$(sha256sum "$f" | cut -d' ' -f1)
echo "sha256 before: $before"; echo "sha256 after:  $after"
[ "$before" = "$after" ] && echo "RESTORED: hashes match" || { echo "RESTORE MISMATCH"; exit 97; }
```

The backup name was `mutation53-backup` (without the file name) for the two allowlist-calibration runs; it was made per-file before mutation 1 so that nested runs (mutations 4 and 4b) do not share a backup.

### `procs.sh`

```bash
#!/usr/bin/env bash
# procs.sh: lists only node / headless Chromium processes whose command line mentions
# server.ts, next, playwright, vitest, or tsx (the recorder's bash wrappers are excluded
# because their first word is /bin/bash). Also reports a listener on port 3000.
out=$(pgrep -af '^[^ ]*(/node|headless_shell|/chrome) ' | grep -E 'server\.ts|next|playwright|vitest|tsx')
if [ -n "$out" ]; then echo "$out" | cut -c1-200; else echo "no matching processes"; fi
ss -ltn 2>/dev/null | grep -E ':3000\b' || echo "port 3000: no listener"
```

### `screens53.mts`

Final version (attempt 2); attempt 1 lacked the `upgraded = false` line.

```ts
// screens53.mts: supplementary screenshots for task 5.3 (not a test). Starts the production
// server through the E2E fixture class on a free port with a temporary database, opens one
// browser context (Alice), sends a message, and saves the Connected, Reconnecting (server
// stopped, typed text kept, Send disabled), Connected-again (server restarted, no reload),
// and Disconnected (an injected Socket.IO `41` packet, as in the E2E test) states.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ChatServerProcess, freePort } from '/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/e2e/fixtures/chat-server'

const { chromium } = createRequire('/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/package.json')('@playwright/test') as typeof import('@playwright/test')
const OUT = '/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/docs/evidence/add-realtime-chat-room-5-3'
const dir = await mkdtemp(path.join(tmpdir(), 'chat-shots-'))
const server = new ChatServerProcess(await freePort(), path.join(dir, 'chat.sqlite'), 'prod')
await server.start()
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ baseURL: server.baseURL, timezoneId: 'UTC', viewport: { width: 560, height: 560 } })
  const page = await context.newPage()
  let toPage: import('@playwright/test').WebSocketRoute | undefined
  let upgraded = false
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    const s = ws.connectToServer()
    toPage = ws
    upgraded = false // a new WebSocket (after the restart): wait for its own upgrade
    ws.onMessage((m) => { if (m === '5') upgraded = true; s.send(m) })
    s.onMessage((m) => ws.send(m))
  })
  await page.goto('/')
  await page.getByLabel('Nickname', { exact: true }).fill('Alice')
  await page.getByRole('button', { name: 'Join' }).click()
  const status = page.getByRole('region', { name: 'Chat' }).getByRole('status')
  const input = page.getByRole('textbox', { name: 'Message', exact: true })
  await status.filter({ hasText: /^Connected$/ }).waitFor()
  await input.fill('Hello before the outage')
  await input.press('Enter')
  await page.getByText('Hello before the outage', { exact: true }).last().waitFor()
  await page.screenshot({ path: path.join(OUT, 'status-connected.png'), fullPage: true })
  await input.fill('typed while the server is down')
  await server.stop()
  await status.filter({ hasText: /^Reconnecting$/ }).waitFor()
  console.log('Reconnecting: Send disabled =', await page.getByRole('button', { name: 'Send', exact: true }).isDisabled(), '; value =', await input.inputValue())
  await page.screenshot({ path: path.join(OUT, 'status-reconnecting.png'), fullPage: true })
  await server.start()
  await status.filter({ hasText: /^Connected$/ }).waitFor({ timeout: 15_000 })
  console.log('Connected again: Send enabled =', await page.getByRole('button', { name: 'Send', exact: true }).isEnabled(), '; value =', await input.inputValue())
  await page.screenshot({ path: path.join(OUT, 'status-connected-after-restart.png'), fullPage: true })
  for (let i = 0; i < 100 && !upgraded; i++) await page.waitForTimeout(100)
  toPage!.send('41')
  await status.filter({ hasText: /^Disconnected$/ }).waitFor()
  await page.screenshot({ path: path.join(OUT, 'status-disconnected.png'), fullPage: true })
} finally {
  await browser.close()
  await server.stop()
  await rm(dir, { recursive: true, force: true })
}
```

The screenshot helper polls the upgrade flag with `waitForTimeout` (supplementary script only; the committed tests use no sleeps).

---

## Round 2 (after checker review round 1, `review.md`, findings R1–R5)

Maker: the same Claude Code general-purpose subagent (maker) as round 1. Snapshot: `snapshot.txt` revision 2 (base `a9a2f0e`). The round-1 sections above are kept unchanged; where they differ from round 2 (line numbers, screenshot hashes, the stop-server test body), round 2 applies. Raw output: the "ROUND 2" part of `checks.txt`.

### User decisions (recorded)

- 2026-09-29, the user replied in Ukrainian "так, приймаю, виправляй" (translated: "yes, I accept, fix it"), accepting the coordinator's recommendations:
  - `io server disconnect` → terminal `Disconnected` (no automatic reconnect until reload), per design D2 ("reconnection not attempted → `Disconnected`"). Implemented in round 1 unchanged; round 2 adds the test that no reconnection happens (R5).
  - Initial status before the first connect is `Disconnected`. Implemented in round 1 unchanged.
  - A short note in `docs/testing.md` that in dev mode the Next.js HMR client reloads the page after a dev-server restart (typed draft lost in dev only; prod keeps it; the chat itself does not reload). Done; the README does not describe this and is unchanged.

### Changes

| File | Change |
|---|---|
| `e2e/connection.spec.ts` | R1: helpers `reconnectAttemptFailed(page)` (waits for Playwright's `requestfailed` of a Socket.IO polling **handshake** request, i.e. one without `sid=`, registered before the outage, timeout 15 s, rejection pre-handled) and `expectStillReconnecting(page, failed)` (after that failure: `Reconnecting` and Send disabled). Used in the stop-server test (plus the draft kept afterwards), the restart test (client A, draft kept), and the catch-up test (client B; the failure there is the test's own `route.abort('connectionrefused')`). R5: the `io server disconnect` test waits, event-based, for a Socket.IO polling request from before the `41` injection until `NO_RECONNECT_WINDOW_MS` = 4 s later and requires none; then `Disconnected`, Send disabled, and the text kept again. |
| `docs/testing.md` | One paragraph on dev mode and server restarts (HMR reload in dev only; `connection.spec.ts` withholds the HMR socket's close in dev). |
| `docs/evidence/add-realtime-chat-room-5-3/*.png` | All four regenerated (R3); `status-connected.png` now shows the completed send. |

No product code changed in round 2 (`use-chat-socket.ts`, `composer.tsx`, `send-ack.ts`, `connection-status.tsx`, `chat-room.tsx`, `globals.css` have the round-1 hashes).

- **Why `sid=` is excluded (R1):** a poll of the old session that fails at the moment of the stop would carry `sid=` and could resolve the wait before any reconnection attempt; only a new handshake (no `sid`) proves that a backoff attempt ran and failed.
- **Bound for R5:** socket.io-client's first reconnection attempt would come after `reconnectionDelay` 1 s with ±50 % jitter (≤ 1.5 s), and no delay exceeds `reconnectionDelayMax` 2 s (design D2); the window is twice that maximum. Every reconnection starts with a polling handshake request (default transports), so its absence is observed through Playwright's `request` event, not by polling the page. The wait adds about 4 s to that test.
- **Console-error allowlist:** unchanged and still exact. The failed handshake that R1 waits for is exactly the allowlisted `Failed to load resource: net::ERR_CONNECTION_REFUSED` on `<baseURL>/socket.io/?EIO=4&transport=polling…` inside the declared outage (for `route.abort` in the catch-up test no console message was ever logged).

### R4 (round-1 omission)

Round 1 had one more failed attempt not mentioned in its report: the entry `2026-09-29T13:44:36Z` (after the first implementation) ran the send-ack unit test (19 passed), typecheck, and lint; typecheck exited 2 with four `TS2532: Object is possibly 'undefined'` errors in `e2e/connection.spec.ts` (index access `histories[0]`/`histories[1]` under `noUncheckedIndexedAccess`), so the entry ended `[exit 1]`. The spec was changed to compare `summarize(histories)` instead; the next typecheck (13:45:18Z) exited 0.

### Red first and mutations (round 2, dev, each restored with a SHA-256 match)

| Run | Result |
|---|---|
| R1 red: checker mutation A (`reconnect_attempt` → `setStatus('Connected')`, `use-chat-socket.ts:79`) against the **revision-1** spec | survived: 5 passed (reproduces the checker's result) |
| Unmutated round-2 spec (dev) | 5 passed, exit 0; typecheck and eslint of the spec exit 0 |
| Mutation A against the **round-2** spec | **3 failed** (stop-server, restart, catch-up: `Expected "Reconnecting"`, `Received "Connected"` after the failed attempt), 2 passed (rule-(b) and `io server disconnect` tests, which have no failed-attempt assertion) |
| R5 mutation: on `io server disconnect` the hook calls `socket.connect()` after 1 s | the `io server disconnect` test **failed** (`Received "reconnection attempted: http://127.0.0.1:<port>/socket.io/?EIO=4&transport=polling&t=…"`); the other 4 passed |

### R3 screenshots

The helper `screens53.mts` now waits until the message is in the list "Messages", the input is empty, and Send is enabled before the Connected screenshot (the three `waitFor`/`waitForFunction` lines marked "Round 2" in the helper; otherwise the body above is unchanged). Attempt 3 (round 2): exit 0; all four PNGs regenerated from a fresh prod build; `status-connected.png` viewed: `Connected`, message "Hello before the outage" in the list, empty input (`0/1000`), Send enabled. The other three show the states described in round 1. Exact round-2 change to the helper body shown in round 1 (one line replaced by five):

```ts
// removed:
  await page.getByText('Hello before the outage', { exact: true }).last().waitFor()
// added:
  // Round 2 (review finding R3): wait until the send has completed — the message is in the
  // list, the input is cleared, and Send is enabled — before the Connected screenshot.
  await page.getByRole('list', { name: 'Messages' }).getByText('Hello before the outage', { exact: true }).waitFor()
  await page.waitForFunction(() => (document.querySelector('.composer textarea') as HTMLTextAreaElement).value === '')
  await page.waitForFunction(() => !(document.querySelector('.composer button') as HTMLButtonElement).disabled)
```

### Criteria mapping (round-2 line numbers in `e2e/connection.spec.ts`)

stop-server test `:227` (now also after a failed reconnection attempt); restart `:257` (also after a failed attempt for A); catch-up `:338` (also after a failed attempt for B); rule (b) `:394`; `io server disconnect` `:440` (now also: no reconnection within 4 s); malformed ack `messaging.spec.ts:535` (unchanged).

### Round-2 final checks (`checks.txt`)

| Check | Result |
|---|---|
| `E2E_SERVER_MODE=dev npx playwright test e2e/connection.spec.ts --repeat-each=5` | 25 passed, exit 0 |
| `npm run build && npx playwright test e2e/connection.spec.ts --repeat-each=3` (prod) | 15 passed, exit 0 |
| `npm run test:unit` | 10 files, 465 passed, exit 0 |
| `npm run lint` / `npm run typecheck` | exit 0 / exit 0 |
| `npm run test:e2e` | 43 passed, exit 0 |
| `npm run test:e2e:dev` | 43 passed, exit 0 |
| `npm run check` | exit 0 (465 unit, 43 E2E) |
| `npm run check:loop` | exit 0 (465 unit, 43 E2E) |
| `openspec validate add-realtime-chat-room --strict`, whitespace checks, processes, port 3000, temp dirs | final round-2 entries of `checks.txt` |

### Remaining limitations

- The rule-(b) test and the `io server disconnect` test have no failed-attempt assertion (mutation A survives in those two; it is caught by the other three).
- `reconnect_failed` → `Disconnected` is still not exercised (unlimited attempts).
- R2 (the `manager.off` calls are not detectable by behaviour) needs no change, as the checker noted.
