# Task add-realtime-chat-room-5-4 — implementation report

- Task: 5.4 in `openspec/changes/add-realtime-chat-room/tasks.md`: red-first E2E tests in `e2e/history.spec.ts` for history on join (105 → 6–105, 3 → 3), auto-scroll at the bottom, no scroll jump when scrolled up, empty-room hint, and history after a server restart; implement any missing UI pieces.
- Maker: Claude Code general-purpose subagent (maker). Fresh subagent with a scoped handoff from the coordinator.
- Base commit: `b9fb1e7`. Nothing staged or committed. The checkbox of task 5.4 is not ticked, and the agent loop was not run. No 6.x work.
- Snapshot: `snapshot.txt` (SHA-256 of every deliverable and both screenshots, paths from the repository root).
- Raw command output: `checks.txt` (append-only log written by `rec54.sh`; every attempt is kept, including failures).
- Runtime: Node v24.21.0, npm 11.19.0 (first entry of `checks.txt`).
- Sources read: `AGENTS.md`, `docs/review-process.md`, tasks 5.4 and 6.1, design D2, D6, and Q4, and the chat-room spec requirements "Recent history for a joining client" and "History survives a server restart" with their scenarios. Also the existing chat UI files, `globals.css`, `e2e/messaging.spec.ts`, `e2e/connection.spec.ts`, and `e2e/fixtures/chat-server.ts`.

## Files

| File | Status | Purpose |
|---|---|---|
| `e2e/history.spec.ts` | new | 6 Playwright tests (red first), with per-spec helper copies as in the other specs |
| `src/app/_chat/message-list.tsx` | modified | Internal scroll container (`tabIndex={0}`), auto-scroll rule, and the empty-room hint `No messages yet.` (`EMPTY_HINT`) |
| `src/app/_chat/use-chat-socket.ts` | modified | New `historyLoaded` flag: `true` after the first `history` event |
| `src/app/_chat/chat-room.tsx` | modified | Passes `historyLoaded` to `MessageList` |
| `src/app/globals.css` | modified | `.message-list` scrolls internally (`max-height: min(50vh, 32rem)`, `overflow-y: auto`, `overscroll-behavior: contain`, border); `.message-list__empty`; new colour token `--border` for light and dark |
| `docs/evidence/add-realtime-chat-room-5-4/*.png` | new | 2 supplementary screenshots |

No new dependencies. No changes to the server code, the shared schema, `merge-messages.ts`, the fixture, the other specs, the Playwright or ESLint configuration, or the spec and design files.

## Scroll design (design Q4) and definitions

- **Scroll container:** the message list (`<ol aria-label="Messages">`) scrolls internally, not the page. Its height is capped at `min(50vh, 32rem)`, which keeps the composer in view at 1280×720 (see the screenshots). `overscroll-behavior: contain` stops a scroll at the list's end from passing on to the page.
- **Keyboard access:** the list has `tabIndex={0}`, so Tab reaches it and arrow keys, Page Up/Down, and Home/End scroll it. It does not trap focus: the next Tab goes to the Message textbox. Test 1 checks this, and tests 2 and 3 scroll with Home/End. The focus outline is the browser default.
- **Auto-scroll rule** (`message-list.tsx`):
  - `atBottomRef` is updated in `onScroll`. It is `true` while `scrollHeight - scrollTop - clientHeight <= 16` px (`AT_BOTTOM_THRESHOLD_PX`), which tolerates sub-pixel rounding and a few pixels of manual scrolling.
  - After every change of `messages` (the history on join, a new message, a catch-up), a `useLayoutEffect` sets `scrollTop = scrollHeight` only if the list was at the bottom before the change. This runs before paint, so new content is never shown at the old position first. Otherwise the position is left where the person put it.
  - A newly mounted list starts at the bottom: on first render, and after the room was empty, the ref resets to `true` when there is no list. This gives the scroll to the newest message on join.
- **Own messages (the spec is silent; I chose this):** the person's own sent message follows the same rule. It scrolls into view only if the person was at the bottom. This keeps one rule and needs no "own message" tracking. See "Needs a user decision".
- **Empty-room hint:** `<p class="message-list__empty">No messages yet.</p>`, plain text in region "Chat". It is not a live region, because a second `role="status"` would clash with the connection status, which the tests locate with `getByRole('status')`. It is shown only when the history has arrived (`historyLoaded`) and there are no messages. Before the first `history` event nothing is rendered, so the hint never flashes for a room that has messages. The hint disappears as soon as a message is in the list. While the list is empty there is no `<ol>`, so no empty focusable element exists.
- **Test definitions** (also at the top of `e2e/history.spec.ts`):
  - Every context uses a fixed viewport of 1280×720.
  - "At the bottom" in the tests means `scrollHeight - scrollTop - clientHeight <= 1` px, after the app has scrolled.
  - "Visible without scrolling" means three things: the message's `<li>` lies entirely inside the list's visible box (±0.5 px), it lies inside the browser viewport, and `window.scrollY === 0`. The test performs no scroll action.
- **No sleeps:**
  - Every wait is on DOM state (`expect`, `expect.poll`) or on frame synchronization with `nextFrames`: two `requestAnimationFrame` callbacks. Scroll events are dispatched in a frame's rendering update before rAF callbacks, so after two frames any pending scroll event has reached the app, and any scroll the app started would already have moved the list.
  - For "does not move the view", the test first waits for the new message to be in A's DOM, then for two frames, then compares `scrollTop` with the value before the message.
  - The scroll to the middle waits for the scroll event itself, and resolves at once if the position did not change.

## Criteria mapping (task 5.4 / spec scenario → test in `e2e/history.spec.ts`)

| Criterion / scenario | Test (line) | Main assertions |
|---|---|---|
| 105 seeded → exactly 6–105, oldest first; 105 visible without scrolling ("New client receives the latest 100 messages in order") | `seeded 105 messages show exactly messages 6–105 …` (229) | Exact list `message 6`…`message 105` (Seeder). No hint. `message 105` visible without scrolling and the list at the bottom. The list really scrolls (`scrollHeight > clientHeight`), the page did not scroll, and `message 6` is not visible. Keyboard: Change nickname → Tab → list focused → Tab → Message textbox |
| New message from another client scrolls into view at the bottom ("New message scrolls into view at the bottom") | `a new message from another client scrolls into view when the person is at the bottom` (256) | B sends: A's new message becomes visible without scrolling and the list is at the bottom. Then Home (top), End (bottom), and B sends again: visible and at the bottom (the at-bottom state is re-evaluated) |
| Scrolled up → view does not move ("Reading older messages is not interrupted") | `a new message from another client does not move the view when the person has scrolled up` (290) | Scroll to the middle (more than 100 px from the bottom). B's message is rendered in A's DOM, yet `scrollTop` is unchanged, the page did not scroll, `scrollHeight` grew, and the new message is not visible. Then Home (`scrollTop` 0) and another message: `scrollTop` still 0 |
| 3 messages → all 3, oldest first ("New client receives fewer than 100 messages") | `3 seeded messages show all 3 …` (340) | Exact nicknames, texts, `datetime`, and `HH:MM` (UTC) of Alice/Bob/Carol in order. No hint. First and last visible |
| Empty room hint ("Empty room") | `an empty room shows a hint …` (364) | `No messages yet.` visible with 0 list items on A and B. B sends: A shows the message, and the hint is gone on both |
| History identical after restart ("History after restart") | `after a server restart a new client shows identical history …` (381) | Messages accepted through the running server (A, B, A with a line break; not seeded). A fresh client before the restart records the `history` packet (ids, nicknames, texts, createdAt) and the rendered rows (nickname, text, `datetime`, `HH:MM`). All pages are closed, then `stop()` and `start()` on the same DB file. A fresh client after the restart gets an identical `history` payload (`toEqual`) and identical rendered rows, and the rendered `datetime` values equal the recorded createdAt values |

Seeding follows design D6: `seed()` stops the server, inserts through `SqliteMessageRepository` on the fixture's DB file, and starts the server again. The console-error check is the unconditional one from `messaging.spec.ts`, with no outage allowlist. It is not needed here: the restart test closes all its pages before stopping the server, so no page is open during the outage.

## Red run and tests that were already green

- `checks.txt`, "RED RUN (prod)", ran with no `src/` change (`git diff --stat -- src` is empty): 4 failed, 2 passed. That entry's `[exit 0]` is the exit code of the trailing `procs.sh`, not of Playwright; a note in the next entry says so. In that run the scrolled-up test hung until the 30 s timeout, because the non-scrollable list fired no scroll event.
- "RED RUN 2" repeated the run after the helper was changed to resolve at once: `[playwright pipeline exit 1]`, with the same 4 failed and 2 passed.
- The four failures:
  - 105 test: message 105 not visible (page layout, no internal scroll).
  - At-bottom test: `from Bob 1` not visible.
  - Scrolled-up test: the list cannot scroll (`target` 0).
  - Empty-room test: hint not found.
- **Already green before the UI changes, stated explicitly:** the 3-message test and the restart test. Earlier tasks (3.x, 4.x, 5.2, 5.3) had already implemented this behavior. Mutations 6 and 7 below show that both tests detect breakage.
- Green attempt 1 (prod, fresh build, after the UI changes): 6 passed, `[pipeline exit 0]`. Lint and typecheck passed in the same entry.

## Mutation checks (dev server, `hist54.sh`; each restore verified by SHA-256)

| # | Mutation | Failed tests | Restored |
|---|---|---|---|
| 1 | Always auto-scroll (`list.scrollTop = list.scrollHeight` unconditionally) | scrolled-up (scrollTop 2779 → 5618) | hashes match |
| 2 | Never auto-scroll | 105, at-bottom, scrolled-up (precondition: not at the bottom on join) | hashes match |
| 3 | No empty-room hint (`return null`) | empty room | hashes match |
| 4 | No internal scroll container (CSS `overflow-y: visible`, no `max-height`) | 105, at-bottom, scrolled-up | hashes match |
| 5 | Render only the first 100 messages (`messages.slice(0, 100)`) | at-bottom, scrolled-up (the 101st message is never rendered) | hashes match |
| 6 | Newest first (`[...messages].reverse()`) | 105, at-bottom, scrolled-up, 3-message, restart | hashes match |
| 7 | Server keeps messages in memory (`openDatabase(':memory:')` in `src/server/app.ts`) | 105, at-bottom, scrolled-up, 3-message (seeded file not read), restart (empty after restart) | hashes match |

## Screenshots (supplementary only)

The screenshots come from `screens54.mts` against a production server on a temporary DB seeded with 105 messages, at 1280×720. They supplement the behavioral tests and do not prove behavior by themselves.

- `history-105-at-bottom.png`: right after joining, the list is at the bottom (messages 100–105 visible, 105 last) and the composer is in view.
- `history-scrolled-up-new-message.png`: Alice scrolled to the middle (messages 53–58). Bob then sent "new message from Bob", which was rendered in her list. The script printed `scrollTop before Bob's message: 2779, after: 2779`.

## Final checks (all in `checks.txt`)

| Check | Result |
|---|---|
| `playwright test e2e/history.spec.ts --repeat-each=3`, prod (fresh `next build`) | 18 passed, exit 0 |
| same, dev (`E2E_SERVER_MODE=dev`) | 18 passed, exit 0 |
| `npm run test:unit` | 10 files, 465 tests passed, exit 0 |
| `npm run test:e2e` | 49 passed, exit 0 |
| `npm run test:e2e:dev` | 49 passed, exit 0 |
| `npm run lint`, `npm run typecheck` | exit 0, exit 0 |
| `npm run check` | exit 0 (lint, typecheck, 465 unit, 49 E2E) |
| `npm run check:loop` | exit 0 (lint, typecheck, 465 unit, 49 E2E dev) |
| Whitespace: `git diff --check`, and `git diff --no-index --check /dev/null <file>` per untracked text file | Calibration: exit 3 for a file with a trailing space, exit 1 for a clean file (it differs from `/dev/null`). "WHITESPACE" misread exit 1 as a failure. "WHITESPACE 2": `git diff --check` exit 0 and every untracked text file clean. The "FINAL" entry checks `snapshot.txt` the same way (clean) |
| Processes and port | `procs.sh` after every E2E entry: "no matching processes", "port 3000: no listener" |

Chromium ran with the session's normal execution permissions. The Playwright workers printed a Node warning that `NO_COLOR` is ignored because `FORCE_COLOR` is set; this is output noise only, and some filters drop it. The only temporary directories I created are the fixture's per-test `chat-e2e-*` directories and `chat-screens54-*`, all removed by their own code; the screenshot entry checks this for the latter. The scratchpad helpers live outside the repository.

## Known limitations

- The E2E tests do not cover the "hint does not flash before the history arrives" behavior of `historyLoaded`, which is a timing-dependent absence. Its only effect is to suppress an inaccurate hint.
- The auto-scroll threshold (16 px app, 1 px test tolerance after the app scrolled) is not tested at its boundary values. Mutation 1 and the Home/End sequence in test 2 cover the rule itself.
- A change of the list's height (window resize, the composer textarea resized) does not re-run the at-bottom scroll. Only message changes do.
- Mutations ran against the dev server, so no rebuild was needed. The unmutated suite is green in both modes.
- `docs/testing.md` "Current and planned coverage" is out of date (it predates tasks 2–5). I did not change it because it is outside this task's files.

## Needs a user decision

- **Own sent message and auto-scroll:** the spec only covers messages from another client. I applied the same rule to the person's own messages: they scroll to the bottom only if the person was already at the bottom. Many chat apps always jump to the bottom on the person's own send. Changing this would mean a spec or design addition and a small UI change.
- The hint text `No messages yet.` and the list height `min(50vh, 32rem)` are maker choices within the spec's wording.

## Helper bodies

All helpers live in this session's Claude Code scratchpad directory (`/tmp/claude-1000/…/scratchpad/`), not in the repository. `rec54.sh`, `mutate54.sh`, and `procs.sh` were derived from the 5.3 helpers; only the task directory and backup names changed, and `procs.sh` is unchanged.

### `rec54.sh`

```bash
#!/usr/bin/env bash
# rec54.sh '<command>': runs <command> with bash -c in the submission root and appends a
# timestamped entry ("$ <command>", combined stdout/stderr, measured exit code) to
# checks.txt. Trailing spaces/tabs and CRs in recorded lines are shown as [SPACE]/[TAB]/[CR].
set -u
ROOT=/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada
OUT="$ROOT/docs/evidence/add-realtime-chat-room-5-4/checks.txt"
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

### `mutate54.sh`

```bash
#!/usr/bin/env bash
# mutate54.sh <file> <test-command> <old1> <new1> [<old2> <new2> ...]: backs up <file> to
# the scratchpad, replaces each <old> (which must occur exactly once) with its <new>, shows
# the diff, runs <test-command> with bash -c, restores the backup, and verifies that the
# SHA-256 of the restored file equals the original.
set -u
f=$1; cmd=$2; shift 2
SP=/tmp/claude-1000/-home-ksabada-projects-AI-course-2026-agentic-engineering-crash-course-capstone/4034e690-c8bb-4005-a19e-8b3d5038ed0e/scratchpad
bk="$SP/mutation54-backup-$(basename "$f")"
before=$(sha256sum "$f" | cut -d' ' -f1)
cp "$f" "$bk"
python3 - "$f" "$@" <<'PY' || { echo "mutation not applied"; cp "$bk" "$f"; rm -f "$bk"; exit 98; }
import sys
p, pairs = sys.argv[1], sys.argv[2:]
s = open(p, encoding='utf-8').read()
for old, new in zip(pairs[0::2], pairs[1::2]):
    if s.count(old) != 1: sys.exit(f"expected exactly one occurrence of {old!r}, found {s.count(old)}")
    s = s.replace(old, new)
open(p, 'w', encoding='utf-8').write(s)
PY
diff "$bk" "$f"
bash -c "$cmd"
echo "mutated run exit: $?"
cp "$bk" "$f"; rm -f "$bk"
after=$(sha256sum "$f" | cut -d' ' -f1)
echo "sha256 before: $before"; echo "sha256 after:  $after"
[ "$before" = "$after" ] && echo "RESTORED: hashes match" || { echo "RESTORE MISMATCH"; exit 97; }
```

### `hist54.sh`

```bash
#!/usr/bin/env bash
# hist54.sh [playwright args...]: runs e2e/history.spec.ts against a dev-mode server (source
# changes apply without a build) and prints the result lines and failure headlines only.
set -o pipefail
E2E_SERVER_MODE=dev npx playwright test e2e/history.spec.ts "$@" 2>&1 \
  | grep -E '✓|✘|passed|failed|Error:|Expected|Received|^\s+> [0-9]+ \|' | grep -v 'Warning' | head -60
```

The mutation entries record `[exit 0]` for `rec54.sh` because `mutate54.sh` exits 0 after a verified restore. The mutated run's own result is the `mutated run exit: 1` line together with the ✘ lines.

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

### `screens54.mts`

Run with `node --import tsx` (see the "SCREENSHOTS" entry of `checks.txt`). Full body:

```ts
// screens54.mts: supplementary screenshots for task 5.4 (not a test). Starts the production
// server through the E2E fixture class on a free port with a temporary database seeded with
// 105 messages (repository, server stopped), opens two browser contexts at 1280x720 (Alice
// reads, Bob sends), and saves: (1) Alice's view right after joining (at the bottom, message
// 105 visible); (2) Alice scrolled up to the middle of the list after Bob's new message
// arrived (the view stayed where she left it). Waits are on DOM state only.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ChatServerProcess, freePort } from '/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/e2e/fixtures/chat-server'
import { SqliteMessageRepository } from '/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/src/server/chat/message.repository'
import { closeDatabase, openDatabase } from '/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/src/server/db/sqlite'

const ROOT = '/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada'
const OUT = path.join(ROOT, 'docs/evidence/add-realtime-chat-room-5-4')
const { chromium, expect } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test') as typeof import('@playwright/test')

const dir = await mkdtemp(path.join(tmpdir(), 'chat-screens54-'))
const dbPath = path.join(dir, 'chat.sqlite')
const db = openDatabase(dbPath)
const repository = new SqliteMessageRepository(db)
for (let i = 1; i <= 105; i++) {
  repository.insert({ nickname: 'Seeder', text: `message ${i}`, createdAt: new Date(Date.UTC(2026, 8, 26, 10, 0, i - 1)).toISOString() })
}
closeDatabase(db)
const server = new ChatServerProcess(await freePort(), dbPath, 'prod')
const browser = await chromium.launch()
try {
  await server.start()
  const open = async (nickname: string) => {
    const context = await browser.newContext({ baseURL: server.baseURL, timezoneId: 'UTC', viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()
    await page.goto('/')
    await page.getByLabel('Nickname', { exact: true }).fill(nickname)
    await page.getByRole('button', { name: 'Join' }).click()
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
    return page
  }
  const alice = await open('Alice')
  const list = alice.getByRole('list', { name: 'Messages' })
  await expect(list.getByRole('listitem')).toHaveCount(100)
  await expect.poll(() => list.evaluate((l) => l.scrollHeight - l.scrollTop - l.clientHeight)).toBeLessThanOrEqual(1)
  await alice.screenshot({ path: path.join(OUT, 'history-105-at-bottom.png') })

  await list.evaluate(
    (l) =>
      new Promise<void>((resolve) => {
        l.addEventListener('scroll', () => resolve(), { once: true })
        l.scrollTop = Math.floor((l.scrollHeight - l.clientHeight) / 2)
      }),
  )
  const before = await list.evaluate((l) => l.scrollTop)
  const bob = await open('Bob')
  await bob.getByRole('textbox', { name: 'Message', exact: true }).fill('new message from Bob')
  await bob.getByRole('textbox', { name: 'Message', exact: true }).press('Enter')
  await expect(list.getByText('new message from Bob', { exact: true })).toHaveCount(1)
  await alice.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
  const after = await list.evaluate((l) => l.scrollTop)
  console.log(`scrollTop before Bob's message: ${before}, after: ${after}`)
  await alice.screenshot({ path: path.join(OUT, 'history-scrolled-up-new-message.png') })
} finally {
  await browser.close()
  await server.stop()
  await rm(dir, { recursive: true, force: true })
}
```
