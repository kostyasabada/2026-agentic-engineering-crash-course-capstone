# Task add-realtime-chat-room-5-2 — implementation report

- Task: 5.2 in `openspec/changes/add-realtime-chat-room/tasks.md` (message list, composer, `use-chat-socket.ts`, `merge-messages.ts` with unit tests, red-first E2E in `e2e/messaging.spec.ts`), plus the message clauses deferred from task 5.1 (review finding F2 of 5.1).
- Maker: Claude Code general-purpose subagent (maker). Fresh subagent with a scoped handoff from the coordinator.
- Base commit: `33e0900`. Nothing staged or committed; the checkbox of task 5.2 is not ticked; the agent loop was not run.
- Snapshot: `snapshot.txt` (revision 1; SHA-256 of every deliverable and screenshot, paths from the repository root).
- Raw command output: `checks.txt` (append-only log written by `rec52.sh`; every attempt, including failures). Each entry's `# <time>` header is written when the command has finished.
- Runtime: Node v24.21.0, npm 11.19.0 (first entry of `checks.txt`).

## Files

| File | Status | Purpose |
|---|---|---|
| `src/app/_chat/merge-messages.ts` | new | Pure helpers: `mergeMessages` (dedupe by id, order by id), `applyHistory` (`replace`/`append`), `lastSeenIdOf`, `HistoryEvent` type |
| `src/app/_chat/merge-messages.test.ts` | new | 12 Vitest unit tests (merge, dedupe, ordering, replace/append, last seen id); red first |
| `src/app/_chat/use-chat-socket.ts` | new | `'use client'` hook: one Socket.IO connection, history/live merge, `lastSeenId` auth, send with 5 s ack timeout |
| `src/app/_chat/message-list.tsx` | new | `'use client'` list; React text only, `HH:MM` local time with full date/time `title` |
| `src/app/_chat/composer.tsx` | new | `'use client'` message form: Enter sends, Shift+Enter newline, trimmed counter, limit message, send errors |
| `src/app/_chat/chat-room.tsx` | modified | Calls `useChatSocket()` once; renders `MessageList` and `Composer` inside region "Chat" |
| `src/app/globals.css` | modified | List, message (`white-space: pre-wrap`), and composer styles |
| `e2e/messaging.spec.ts` | new | 18 Playwright tests (red first) |
| `docs/evidence/add-realtime-chat-room-5-2/*.png` | new | Supplementary screenshots |

No new dependencies (`socket.io-client` 4.8.4 was already a dependency). No server code, shared schema, fixture, Playwright or ESLint configuration, and no existing spec file was changed.

## Component and hook structure (design D1, D2, D4)

- Server Components unchanged (`layout.tsx`, `page.tsx`). The client subtree is `chat-room.tsx` → `nickname-form.tsx`, `message-list.tsx`, `composer.tsx`, and the hook `use-chat-socket.ts`. `src/app/**` imports only `src/lib/chat/schema.ts` and `socket.io-client`, never `src/server/**` (lint with the D4 boundary rule exits 0). Types of the wire contract (`HistoryEvent`, the ack type) are declared client-side; no validation rule is duplicated (the composer uses `messageTextSchema` and `MESSAGE_MAX_LENGTH`).
- `ChatRoom` calls `useChatSocket()` unconditionally (one socket per `ChatRoom`, also while the nickname form is shown). The message list and composer are rendered only inside region "Chat", i.e. after a valid nickname exists; so while the nickname is rejected there is no message input.
- `useChatSocket()` returns `{ messages, connected, send }`:
  - The socket is created in `useEffect` (`io()` to the page's own origin, `reconnectionDelayMax: 2000`), so nothing runs during server rendering; cleanup removes the listeners and disconnects (also correct under React Strict Mode's double effect in dev).
  - `history` → `applyHistory` (`replace` discards, `append` merges); `message:new` → `mergeMessages`; an accepted send's ack message is merged as well. Dedupe by id makes the sender's own message appear once although it arrives by broadcast and by ack (mutation 1 shows the duplicates otherwise).
  - `auth` is a function reading a ref that an effect keeps at `lastSeenIdOf(messages)`, so each reconnection sends the current highest id (D2). Task 5.2 does not test reconnection (task 5.3).
  - `send(nickname, text)`: `socket.timeout(5000).emitWithAck('message:send', { nickname, text })`; ok → `{ ok: true }`; error ack → `Message not sent: <server message>`; timeout → `Message not sent: the server did not confirm it within 5 seconds.`; not connected → `Message not sent: not connected to the server.`
  - For task 5.3: `connected` is the only state exposed today (from `connect`/`disconnect`); 5.3 can replace it with a `Connected`/`Reconnecting`/`Disconnected` status from the manager's `reconnect_attempt`/`reconnect_failed` events inside the same effect, without changing the list, merge, or composer contracts.
- `Composer({ nickname, connected, onSend })`: validates with `messageTextSchema.safeParse(value)`; counter `n/1000` of `value.trim().length`; no `maxlength` (P20). Schema messages are shown after a send attempt, and immediately when over the limit. Send is disabled while not connected, while a send is pending, or over the limit (Enter is blocked the same way). The nickname prop is read when the message is sent, so a changed nickname applies to later messages. On success the input is cleared (only if unchanged since the send); on failure the error is shown in its own `role="alert"` and the text is kept.
- `MessageList`: `<ol aria-label="Messages">`, each item with the author, `<time dateTime=createdAt title=toLocaleString()>HH:MM</time>` (local hours/minutes from `getHours()`/`getMinutes()`, independent of the locale's separator), and the text as a React text child in `<p class="message__text">` with `white-space: pre-wrap`.

## Design choices

- **Send failure in E2E.** Two deterministic tests through `page.routeWebSocket` on the page's Socket.IO WebSocket (Q12 technique). The helper forwards every frame, waits until the engine.io upgrade packet `5` was sent (so later packets use the routed WebSocket, not polling), and then (a) rewrites the nickname inside the `message:send` packet to `bob@home`, so the **real server** rejects it with `invalid_nickname` and the UI shows `Message not sent: <schema message>` (then the route is repaired and the retry succeeds), or (b) drops the packet, so no ack arrives and the real 5-second timeout (D2) fires. D2 fixes the timeout at 5 s and offers no test-only override, and Playwright's clock would also fake Socket.IO's and React's timers, so test (b) accepts one real 5 s wait (6.1–6.3 s in the final runs) and asserts at least 4.9 s elapsed.
- **Modified and foreign clients.** `socket.io-client` in the Playwright test process: a rogue client sends 1001 characters (`invalid_text`), `bob@home` and a 33-character nickname (`invalid_nickname`), then a valid message; both browser contexts show only the valid one, the rogue's own `message:new` log has only the valid one, and a reload shows the same history (nothing stored). The foreign-Origin client sets `extraHeaders: { Origin: 'http://evil.example' }` on the WebSocket and the polling transport; both get `connect_error`, no `history`, and stay disconnected; a control client with the page's own Origin connects and receives `history`.
- **Timestamps.** Every context uses `timezoneId: 'UTC'` unless stated. The timestamp test stops the fixture server, seeds `2026-09-26T14:05:00.000Z` through `openDatabase` + `SqliteMessageRepository` (design D6 seeding; `e2e/**` is outside the boundary rules), starts the server, and expects `14:05` in UTC and `19:35` in an `Asia/Kolkata` context (local time); a live message shows the `HH:MM` of its `datetime` attribute.
- **Line breaks.** The three-line test types with Shift+Enter, sends with Enter, and checks the text's `textContent`, its `innerText` (layout-aware), and the rendered height (3 line heights) in both contexts; mutation 7 (no `pre-wrap`) fails it.
- **Browser errors fail tests.** Every context opened by a test records console errors, page errors, and dialogs (an `alert(1)` from injected markup would appear here); contexts are closed after the test and the list must be empty (addresses 5.1 finding F3: the check runs after the contexts are closed).
- **Locators.** Roles and labels (`region "Chat"`, `textbox "Message"`, `button "Send"`, `form "Send a message"`, `list "Messages"`); alerts are scoped to their form (Next.js route announcer). Exception: the helper `readMessages` reads each list item's author and text through the class names `.message__author` / `.message__text` inside `evaluateAll`, to compare exact (not whitespace-normalized) text.
- **Empty and whitespace-only messages.** The Send button stays enabled for an empty text so that an attempt shows the schema's `Message is required.` (same pattern as the nickname form); nothing is emitted.
- **Scope kept.** No connection status UI or reconnection tests (5.3); no empty-room hint, auto-scroll, or history-limit tests (5.4). The list has no scroll container yet.

## Criteria mapping (task 5.2 and 5.1 additions → test in `e2e/messaging.spec.ts`, line)

| Criterion / spec scenario | Test |
|---|---|
| Delivery to another independent browser context without reload ("Message reaches another independent client"; a window marker survives) | `a message reaches another independent browser context without a reload` (154) |
| Two quickly sent messages in the same order in both contexts, matching server ids ("Messages appear in server order on every client"; A and B send concurrently; order checked against a Node observer's ids) | `two messages sent in quick succession appear in the same server order in both contexts` (166) |
| Markup rendered literally, no element, no script ("Markup is rendered as text") | `markup in a message is shown literally: no element is created and no script runs` (186) |
| Three-line message on three lines ("Line breaks are preserved"; Shift+Enter newline, Enter sends) | `a three-line message is shown on three lines` (203) |
| Trimming ("Surrounding whitespace is trimmed") and counter of the trimmed length | `surrounding whitespace is trimmed and the counter shows the trimmed length` (229) |
| Empty and whitespace-only not sent ("Empty message is rejected", "Whitespace-only message is rejected"; spaces, tabs, line breaks; Enter and button) | `empty and whitespace-only messages are not sent` (244) |
| Oversized typed or pasted text kept in full, limit message, sending blocked, no `maxlength`, counter ("Oversized message is rejected in the browser"; typed with `pressSequentially`, pasted from the clipboard with Ctrl/Meta+V) | `oversized typed or pasted text is kept in full with the limit message and sending blocked` (267) |
| Exactly at the limit accepted ("Message at the limit is accepted"; also 998 + emoji = 1000 units) | `a message of exactly 1000 characters is accepted` (307) |
| 1000 characters with surrounding spaces (1020 raw) accepted ("Surrounding whitespace does not count toward the limit") | `1000 characters surrounded by spaces (1020 before trimming) are accepted` (331) |
| Timestamp `HH:MM` in a UTC context ("Timestamp is shown as local hours and minutes"; plus UTC+05:30 and a live message) | `timestamps are shown as local HH:MM` (348) |
| Oversized and invalid-nickname payloads from a modified `socket.io-client` rejected and not shown ("Oversized message is rejected by the server", "Server rejects an invalid nickname sent by a modified client") | `oversized and invalid-nickname payloads from a modified socket.io-client are rejected and not shown` (378) |
| Foreign `Origin` refused ("Foreign origin is refused"; WebSocket and polling) | `a socket.io-client connection with a foreign Origin is refused` (414) |
| Send failure keeps the text: server rejection ("Sender is informed when a send fails") | `a send rejected by the server shows the error and keeps the text for a retry` (460) |
| Send failure keeps the text: no confirmation within 5 s | `a send that is not confirmed within 5 seconds shows the error and keeps the text` (491) |
| 5.1 addition 3 — "Valid nickname is accepted": `  Alice_1  ` → message input enabled, message shown as `Alice_1` on another client | `a valid trimmed nickname enables the message input and attributes messages to it` (519) |
| 5.1 addition 4 — "Empty or whitespace-only nickname is rejected": no message input while the error is shown | `while an empty or whitespace-only nickname is rejected, no message input is available` (533) |
| 5.1 addition 1 — "Nickname is changed": `first` by Alice, `second` by Alicia in A and B; after reloading A the nickname is Alicia and `first` is still by Alice | `a changed nickname applies to later messages only, on every client and after a reload` (547) |
| 5.1 addition 2 — "Duplicate nicknames are allowed": two `Sam`s each send; both shown in both contexts | `two clients with the same nickname can both send, each attributed to it` (570) |
| 5.1 addition 5 — conventions: composer inside region "Chat", per-test browser-error check, scoped alerts, role/label selectors | all tests (helpers at the top of the spec) |
| Merge, dedupe, ordering (unit) | `src/app/_chat/merge-messages.test.ts` (12 tests) |

## Red runs (`checks.txt`)

- **Unit, red:** `npx vitest run src/app/_chat/merge-messages.test.ts` before `merge-messages.ts` existed → `Cannot find module './merge-messages'`, 1 failed suite, exit 1. Green after implementation: 12 passed.
- **E2E, red:** `E2E_SERVER_MODE=dev npx playwright test e2e/messaging.spec.ts` with only the base UI (nickname form) → **17 failed, 1 passed**, exit 1; the failures wait for the missing `Send` button or `Message` textbox. The one passing test is `while an empty or whitespace-only nickname is rejected, no message input is available`: it asserts absence, which the 5.1 UI already satisfies (expected; its value is as a regression guard, and it fails if a message input were shown before joining).
- **E2E, green attempt 1 (dev):** 18 passed, exit 0. Then build + messaging and nickname specs in prod: 30 passed.

## Mutation checks (each restored and SHA-256 verified; `mutate52.sh`)

| # | File | Mutation | Result |
|---|---|---|---|
| 1 | `merge-messages.ts` | no dedupe (`[...current, ...incoming].sort(...)`) | killed: 4 unit tests failed; E2E: sender shows its message twice and React's duplicate-key console error fails the tests (output cut by `head -60` before the summary, exit 141 from the filter; recorded as is, the filter was then replaced) |
| 2 | `message-list.tsx` | text via `dangerouslySetInnerHTML` | killed: `eslint` `react/no-danger` error (exit 1); E2E `markup …` failed with `A dialog: alert 1`, `B dialog: alert 1`; 1 failed, 17 passed |
| 3 | `composer.tsx` | counter/limit on the raw length (`value.length`) | killed: 3 failed (trimmed counter, whitespace-only counter, 1020-raw accepted) |
| 4 | `composer.tsx` | nickname captured at mount (`useState(nickname)`) | killed: `a changed nickname applies to later messages only …` failed |
| 5 | `composer.tsx` | failed send clears the text | killed: both send-failure tests failed |
| 6 | `merge-messages.ts` | no sort by id | killed: 4 unit tests failed (the `mutated run exit: 0` line is the exit of the `grep` filter, not of vitest) |
| 7 | `globals.css` | no `white-space: pre-wrap` | killed: `a three-line message is shown on three lines` failed |

## Screenshots (supplementary; they do not prove delivery by themselves)

- `two-contexts-side-by-side.png`: Alice's and Bob's independent contexts after three messages (plain text, a three-line message, literal markup), prod server, UTC.
- `composer-limit-message.png`: 1002 typed characters kept (value length 1002 printed by the script), counter `1002/1000`, limit message, Send disabled.
- Made by `screens52.mts` (below) with the fixture class `ChatServerProcess`; attempts 1 (CJS top-level await) and 2 (package not resolvable from the scratchpad) failed and are recorded; attempt 3 succeeded; its temporary directory was removed.

## Final checks (`checks.txt`, Node v24.21.0)

| Check | Result |
|---|---|
| `npx playwright test e2e/messaging.spec.ts --repeat-each=3` (prod, after `npm run build`) | 54 passed, exit 0 |
| `E2E_SERVER_MODE=dev npx playwright test e2e/messaging.spec.ts --repeat-each=3` | 54 passed, exit 0 |
| `npm run test:unit` | 9 files, 446 tests passed, exit 0 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run test:e2e` (build + all specs, prod) | 37 passed, exit 0 |
| `npm run test:e2e:dev` | 37 passed, exit 0 |
| `npm run check` | exit 0 (37 E2E passed) |
| `npm run check:loop` | exit 0 (37 E2E passed) |
| Whitespace calibration (scratch file with one trailing space) | reported, exit 3 (marker `[SPACE]` visible) |
| `git diff --check` (tracked changes) | exit 0 |
| `git diff --no-index --check /dev/null <file>` per untracked text file (9 files; PNGs skipped) | exit 1 each = differs, no whitespace issue; `implementation.md` rechecked after its last edit (final entry) |
| `openspec validate add-realtime-chat-room --strict` | valid, exit 0 |
| Processes (server.ts/next/playwright/vitest/tsx), port 3000, fixture temp dirs | none left, no listener, 0 `chat-e2e-*`/`chat-shots-*` dirs |

An extra single dev run of the messaging spec (18 passed) was recorded between the two repeat runs because it was appended by mistake to the same shell call; it is kept.

## Limitations and open issues

- The foreign-Origin E2E uses a Node client that sets the `Origin` header; a real browser page on another origin is not exercised (browsers cannot be pointed at a foreign origin that resolves to the fixture without DNS setup). The Host/DNS-rebinding cases stay covered by `src/server/app.test.ts` and `e2e/host-policy.spec.ts`.
- The server-rejection test rewrites the packet in transit because the browser UI validates with the same schema and cannot produce a rejected payload by itself; `server_error` (storage failure) is covered by the controller unit test of task 4.1, not by E2E.
- The timeout test waits for the real 5 s timeout once (about 6 s per run).
- `readMessages` in the spec uses two CSS class names inside `evaluateAll` (see Locators).
- One pending send at a time per client (Send is disabled until the ack or the timeout); not a spec requirement, a UX choice. Spec-level concurrency ("each send a message in quick succession") is tested across two clients.
- Reconnection, the status UI, and `lastSeenId` catch-up are wired in the hook but not tested here (task 5.3). Empty-room hint and scrolling are task 5.4.
- The shared scratchpad already contained helpers of earlier tasks; `procs.sh` was overwritten with the version below.

## Helper bodies

All helpers live in the Claude Code scratchpad directory of this session, not in the repository.

### `rec52.sh`

```bash
#!/usr/bin/env bash
# rec52.sh '<command>': runs <command> with bash -c in the submission root and appends a
# timestamped entry ("$ <command>", combined stdout/stderr, measured exit code) to
# checks.txt. Trailing spaces/tabs and CRs in recorded lines are shown as [SPACE]/[TAB]/[CR].
set -u
ROOT=/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada
OUT="$ROOT/docs/evidence/add-realtime-chat-room-5-2/checks.txt"
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

### `mutate52.sh`

```bash
#!/usr/bin/env bash
# mutate52.sh <file> <test-command> <old1> <new1> [<old2> <new2> ...]: backs up <file> to
# the scratchpad, replaces each <old> (which must occur exactly once) with its <new>, shows
# the diff, runs <test-command> with bash -c, restores the backup, and verifies that the
# SHA-256 of the restored file equals the original.
set -u
f=$1; cmd=$2; shift 2
SP=/tmp/claude-1000/-home-ksabada-projects-AI-course-2026-agentic-engineering-crash-course-capstone/4034e690-c8bb-4005-a19e-8b3d5038ed0e/scratchpad
before=$(sha256sum "$f" | cut -d' ' -f1)
cp "$f" "$SP/mutation52-backup"
python3 - "$f" "$@" <<'PY' || { echo "mutation not applied"; cp "$SP/mutation52-backup" "$f"; exit 98; }
import sys
p, pairs = sys.argv[1], sys.argv[2:]
s = open(p, encoding='utf-8').read()
for old, new in zip(pairs[0::2], pairs[1::2]):
    if s.count(old) != 1: sys.exit(f"expected exactly one occurrence of {old!r}, found {s.count(old)}")
    s = s.replace(old, new)
open(p, 'w', encoding='utf-8').write(s)
PY
diff "$SP/mutation52-backup" "$f"
bash -c "$cmd"
echo "mutated run exit: $?"
cp "$SP/mutation52-backup" "$f"; rm -f "$SP/mutation52-backup"
after=$(sha256sum "$f" | cut -d' ' -f1)
echo "sha256 before: $before"; echo "sha256 after:  $after"
[ "$before" = "$after" ] && echo "RESTORED: hashes match" || { echo "RESTORE MISMATCH"; exit 97; }
```

### `msg-dev.sh` (version 1, used for mutation 1 only)

```bash
#!/usr/bin/env bash
# msg-dev.sh: runs e2e/messaging.spec.ts against a dev-mode server and prints a filtered
# summary (result lines, failing test titles, expected/received lines, browser errors).
set -o pipefail
E2E_SERVER_MODE=dev npx playwright test e2e/messaging.spec.ts --reporter=line 2>&1 | grep -vE '^\s*$' | grep -E 'passed|failed|flaky|^\s+[0-9]+\) |Expected|Received|console:|pageerror:|dialog:|Error:' | head -60
```

### `msg-dev.sh` (version 2, mutations 2–7 and one extra run)

```bash
#!/usr/bin/env bash
# msg-dev.sh [spec...]: runs the given specs (default e2e/messaging.spec.ts) against a
# dev-mode server; prints the failing test titles with the first Error line of each, all
# recorded browser errors (unique), and the final summary; exits with Playwright's code.
specs=${*:-e2e/messaging.spec.ts}
out=$(mktemp)
E2E_SERVER_MODE=dev npx playwright test $specs --reporter=line >"$out" 2>&1
rc=$?
grep -E '^\s+[0-9]+\) |^\s+Error: ' "$out" | awk '/^ +[0-9]+\) /{print; n=0; next} n<2{print; n++}'
grep -oE '"[A-Za-z0-9 ]+ (console|pageerror|dialog): [^"]{0,120}' "$out" | sort -u | head -10
grep -E '^\s+[0-9]+ (passed|failed|flaky|skipped|did not run)' "$out"
rm -f "$out"
echo "playwright exit: $rc"
exit $rc
```

### `screens52.mts` (final form; attempt 1 was the same file named `.ts` with `import { chromium } from '@playwright/test'`)

```ts
// screens52.ts: supplementary screenshots for task 5.2 (not a test). Starts the production
// server through the E2E fixture class on a free port with a temporary database, opens two
// independent browser contexts (Alice, Bob), exchanges messages, and saves screenshots.
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ChatServerProcess, freePort } from '/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/e2e/fixtures/chat-server'

// Resolve @playwright/test from the project (this script lives outside it).
const { chromium } = createRequire('/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/package.json')('@playwright/test') as typeof import('@playwright/test')
const OUT = '/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/docs/evidence/add-realtime-chat-room-5-2'
const dir = await mkdtemp(path.join(tmpdir(), 'chat-shots-'))
const server = new ChatServerProcess(await freePort(), path.join(dir, 'chat.sqlite'), 'prod')
await server.start()
const browser = await chromium.launch()
try {
  const open = async (nickname: string) => {
    const context = await browser.newContext({ baseURL: server.baseURL, timezoneId: 'UTC', viewport: { width: 560, height: 720 } })
    const page = await context.newPage()
    await page.goto('/')
    await page.getByLabel('Nickname', { exact: true }).fill(nickname)
    await page.getByRole('button', { name: 'Join' }).click()
    await page.getByRole('button', { name: 'Send', exact: true }).waitFor()
    await page.waitForFunction(() => !(document.querySelector('.composer button') as HTMLButtonElement).disabled)
    return page
  }
  const send = async (page: import('@playwright/test').Page, text: string) => {
    const input = page.getByRole('textbox', { name: 'Message', exact: true })
    await input.fill(text)
    await input.press('Enter')
    await page.waitForFunction(() => (document.querySelector('.composer textarea') as HTMLTextAreaElement).value === '')
  }
  const alice = await open('Alice')
  const bob = await open('Bob')
  await send(alice, 'Hello Bob')
  await send(bob, 'Hi Alice!\nThis message has\nthree lines.')
  await send(alice, '<img src=x onerror=alert(1)><b>bold</b>')
  await bob.getByText('<b>bold</b>', { exact: false }).waitFor()
  await alice.screenshot({ path: path.join(dir, 'a.png') })
  await bob.screenshot({ path: path.join(dir, 'b.png') })
  // Side by side: both screenshots in one page.
  const combine = await browser.newPage({ viewport: { width: 1140, height: 740 } })
  const src = async (file: string) => `data:image/png;base64,${(await readFile(path.join(dir, file))).toString('base64')}`
  await combine.setContent(`<body style="margin:0;display:flex;gap:10px;padding:10px;background:#888"><figure style="margin:0"><img src="${await src('a.png')}"></figure><figure style="margin:0"><img src="${await src('b.png')}"></figure></body>`)
  await combine.screenshot({ path: path.join(OUT, 'two-contexts-side-by-side.png') })
  // Limit message: 1002 characters typed (full text kept, counter, Send disabled).
  const input = alice.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('a'.repeat(1000))
  await input.pressSequentially('bc')
  await alice.getByText('Message must be at most 1000 characters.').waitFor()
  await alice.screenshot({ path: path.join(OUT, 'composer-limit-message.png'), fullPage: true })
  console.log('value length kept:', (await input.inputValue()).length)
} finally {
  await browser.close()
  await server.stop()
  await rm(dir, { recursive: true, force: true })
}
```
