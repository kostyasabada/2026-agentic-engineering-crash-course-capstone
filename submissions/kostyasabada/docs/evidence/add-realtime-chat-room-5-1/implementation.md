# Task add-realtime-chat-room-5-1 — implementation report

- Task: 5.1 in `openspec/changes/add-realtime-chat-room/tasks.md` (nickname form with red-first E2E tests in `e2e/nickname.spec.ts`).
- Maker: Claude Code general-purpose subagent (maker). Fresh subagent with a scoped handoff from the coordinator.
- Base commit: `67ed23e`. Nothing staged or committed; the checkbox of task 5.1 is not ticked.
- Snapshot: `snapshot.txt` (SHA-256 of every deliverable, paths from the repository root).
- Raw command output: `checks.txt` (append-only log written by `rec51.sh`; every attempt, including failures).
- Runtime: Node v24.21.0, npm 11.19.0 (first entry of `checks.txt`).

## Files

| File | Status | Purpose |
|---|---|---|
| `src/app/page.tsx` | modified | Server Component; renders `<h1>Chat room</h1>` and `<ChatRoom />` |
| `src/app/layout.tsx` | modified | Server Component; imports `./globals.css` (one line) |
| `src/app/globals.css` | new | Small readable styling (no framework); light/dark via `color-scheme` |
| `src/app/_chat/chat-room.tsx` | new | `'use client'` root of the interactive subtree; nickname storage and view switching |
| `src/app/_chat/nickname-form.tsx` | new | `'use client'` nickname form validated with the shared `nicknameSchema` |
| `e2e/nickname.spec.ts` | new | 12 Playwright tests (red first) |
| `docs/evidence/add-realtime-chat-room-5-1/*.png` | new | Supplementary screenshots |

No new dependencies. No server code, schema, fixture, Playwright or ESLint configuration was changed.

## Component structure (design D1, D4)

- Server Components: `layout.tsx`, `page.tsx` (no `'use client'`, no browser APIs).
- Client boundary: `chat-room.tsx` (`'use client'`), which renders `nickname-form.tsx` (`'use client'`). `src/app/**` imports only `src/lib/chat/schema.ts` (relative `../../lib/chat/schema`), never `src/server/**`; `npm run lint` (with the D4 boundary rule) exits 0.
- `ChatRoom` states:
  - unknown (server render and hydration): `Loading…`;
  - no nickname: section "Choose a nickname" (h2) with the form (button "Join");
  - nickname set: region "Chat" with `Chatting as <nickname>` and a "Change nickname" button, which swaps in the same form (initial value = current nickname, buttons "Save nickname" and "Cancel"). Tasks 5.2+ are expected to put the message list and composer inside this region.

## Design choices

- **Single source of rules.** The form calls `nicknameSchema.safeParse(value)` and shows the schema's issue messages; the limit comes from the exported `NICKNAME_MAX_LENGTH`. No rule or message text is duplicated in `src/app` (the E2E spec contains the expected message strings as test oracles). The stored value is the schema output (`result.data`, trimmed). The server stays authoritative (task 4.1).
- **P20, no `maxlength`.** The input has no `maxlength` (asserted in E2E). A live counter shows the trimmed length (`n/32`). When the trimmed length exceeds 32, the limit message is shown immediately and the confirm button is disabled (Enter does not submit either), while the full text stays in the input. Other errors (empty, characters) appear after a confirm attempt and then update live. If several schema issues apply, all messages are listed.
- **Accessibility.** `<label for>` "Nickname"; the error container has `role="alert"` and is referenced by the input's `aria-describedby` together with the counter; `aria-invalid` is set while errors are shown. Each form has an accessible name (`aria-label`: "Choose a nickname" / "Change nickname"), so it is exposed as role `form`. E2E selectors use roles, labels and visible text only.
- **Why the alert is scoped to the form in tests.** Next.js renders its route announcer as `<div role="alert" aria-live="assertive" id="__next-route-announcer__">`, so `page.getByRole('alert')` alone is ambiguous (green attempt 1 in `checks.txt`). The spec uses `page.getByRole('form').getByRole('alert')`.
- **localStorage, SSR-safe.** Key `chat.nickname` (design Q1). `ChatRoom` reads it with `useSyncExternalStore(subscribe, readNickname, getServerNickname)`: the server snapshot is `undefined` ("unknown"), so the server HTML and the hydration render match, and React then renders the client value. No `window` access during server rendering; no `setState` in an effect. Every `localStorage` call is in `try/catch`; if storage throws, the nickname lives in a module-level in-memory value for the page session. A stored value that fails `nicknameSchema` is ignored (form shown). A `storage` event from another tab updates the view.
- **Console errors fail the tests.** Every test collects browser `console` errors and `pageerror`s (both contexts in the duplicate test) and asserts the list is empty in `afterEach`; mutation 3b shows this catches a hydration mismatch.
- **Scope kept.** No composer, message list, socket hook or connection status (tasks 5.2–5.4).

## Criteria mapping (task 5.1 → test in `e2e/nickname.spec.ts`)

| Criterion / spec scenario | Test |
|---|---|
| Valid trimmed nickname accepted (`  Alice_1  ` → `Alice_1`, stored trimmed, chat region shown, no `maxlength`) | `a valid nickname is accepted and stored trimmed` |
| Empty / whitespace-only rejected with message, input stays unavailable (`aria-invalid`, accessible description) | `an empty or whitespace-only nickname is rejected with a message` |
| Too long rejected, full text kept, no truncation, limit message, trimmed length shown, confirm blocked (button and Enter) | `a too-long nickname is rejected and kept in full` |
| Character counting (surrounding spaces not counted, 32/32 accepted; 16 × U+20000 accepted, 17 × rejected, `34/32`) | `surrounding whitespace does not count toward the limit; astral letters count as two units` |
| Disallowed characters rejected with the allowed-characters message (`<script>`, `bob@home`, `a²`, leading U+0301), text kept | `nicknames with disallowed characters are rejected with the allowed characters listed` |
| Combining marks accepted as entered (`प्रिया`) | `a nickname with combining marks is accepted as entered` |
| Remembered after reload | `the nickname is remembered after a reload` |
| Changed nickname shown, stored, survives reload | `the nickname can be changed and the change survives a reload` |
| Invalid change rejected (characters, whitespace, over limit with Save disabled), previous nickname kept in storage and after Cancel and reload | `an invalid nickname change is rejected and the previous nickname stays in use` |
| Duplicates allowed across two independent browser contexts (`Sam` in both) | `the same nickname can be used in two independent browser contexts` |
| Extra: invalid stored value ignored | `an invalid stored nickname is ignored and the form is shown` |
| Extra: localStorage throwing (try/catch path) | `the form still works when localStorage is unavailable` |

**Not verifiable in 5.1 (needs the composer of task 5.2):**
- "changed nickname applies to later messages only" (spec scenario "Nickname is changed": `first` attributed to `Alice`, `second` to `Alicia` on every client). Task 5.1 verifies the observable part (current nickname, `localStorage`, reload). The message attribution must be verified by the E2E of task 5.2; task 5.2's text does not list this scenario explicitly, so the coordinator should include it in 5.2's handoff (for example as an added test in `e2e/nickname.spec.ts` or `e2e/messaging.spec.ts`).
- Duplicate nicknames: both contexts can use `Sam`; "both messages are accepted and delivered, each attributed to `Sam`" needs messaging (5.2). The server side has no uniqueness rule (task 4.1).
- "chat view is shown with the message input enabled": the region "Chat" is shown; the message input itself arrives in 5.2.

## Red run (before any UI existed)

`checks.txt`, entries "RED RUN" (dev mode, `src/app` = `layout.tsx`, `page.tsx` from base):
- First attempt: the list was cut by `head -60`, so the recorded exit is 141 (SIGPIPE); 10 failures visible, no summary. Kept as recorded.
- Repeated without `head`: **12 failed**, pipeline exit 1; each fails waiting for the heading "Choose a nickname".

## Green attempts

1. Dev: 5 failed, 7 passed — strict-mode violation, `getByRole('alert')` also matched Next's route announcer. Fix: forms get an accessible name (`name` prop → `aria-label`), spec scopes alerts to `getByRole('form')`.
2. Dev: **12 passed**. Then `npm run lint` 0, `npm run typecheck` 0, `npm run build` 0 and prod **12 passed**.

## Mutation checks (dev mode, `mutate.sh`, restore verified by SHA-256)

| # | Mutation | Result | Restore |
|---|---|---|---|
| 1 | `nickname-form.tsx`: `onSubmit(result.data)` → `onSubmit(value)` (skip trimming) | killed: 2 failed (stored `"  Alice_1  "`, `"  Alicia "`) | hashes match (`ac07a078…`) |
| 2 | `chat-room.tsx`: `localStorage.setItem` removed (do not persist) | killed: 5 failed (stored `null`, not remembered after reload) | hashes match (`5ffbc0c8…`) |
| 3 | `chat-room.tsx`: server snapshot `undefined` → `null` | **survived** (12 passed). Explanation: with `useSyncExternalStore`, React renders the server snapshot during hydration and then the client snapshot, so this is not a hydration mismatch; it only shows the form briefly before the stored nickname. Not an SSR hazard. | hashes match |
| 3b | `chat-room.tsx`: read `localStorage` directly during render (`typeof window` branch) | killed: 12 failed, each with `pageerror: Hydration failed …` from the console check | hashes match |

## Screenshots (supplementary; do not replace the behavioral tests)

Taken by the scratchpad script `shots.ts` against the production build (fixture class `ChatServerProcess`, free port, temporary database, removed afterwards):
- `nickname-form-valid.png` — `  Alice_1  ` typed, counter `7/32`, no error.
- `nickname-form-error-characters.png` — `bob@home` after Join, allowed-characters message.
- `nickname-form-error-too-long.png` — 40 × `a`, counter `40/32`, limit message, Join disabled, full text kept.
- `nickname-accepted.png` — `Chatting as Alice_1` with "Change nickname".

## Final checks (`checks.txt`)

| Check | Result |
|---|---|
| `nickname.spec.ts` dev, `--repeat-each=3` | 36 passed, exit 0 |
| `nickname.spec.ts` prod (after `npm run build`), `--repeat-each=3` | 36 passed, exit 0 |
| `npm run test:unit` | 8 files, 434 tests passed, exit 0 |
| `npm run test:e2e` | 19 passed, exit 0 |
| `npm run test:e2e:dev` | run 1: **1 failed** (`shutdown.spec.ts` SIGINT), 18 passed, exit 1; rerun: 19 passed, exit 0; 3 more runs: passed / **1 failed** (`shutdown.spec.ts` SIGTERM, code 143) / passed |
| `npm run lint`, `npm run typecheck` | exit 0 (also inside `npm run check`) |
| `npm run check` | exit 0 (lint, typecheck, 434 unit, build, 19 E2E) |
| Whitespace | calibration: `git diff --no-index --check /dev/null <file>` exits 1 for a clean file, 3 with a whitespace error. `git diff --check` exit 0; each new code file exit 1 (clean); no CR in any changed file. Evidence text files: last entries of `checks.txt`. |
| Processes | `procs.sh` after every E2E run: no matching processes, port 3000 no listener |

## Known limitations and open issues

1. **`e2e/shutdown.spec.ts` (task 4.2) is intermittently red in dev mode.** Failure: the spawned `tsx` CLI exits with 130 (SIGINT) or 143 (SIGTERM) instead of 0, although `server.ts` logged `> Received SIG…, shutting down`. Mechanism, from `node_modules/tsx/dist/cli.mjs` (`relaySignalToChild` / `waitForSignalFromChild`, `setTimeout(…, 30)`): when the process group gets the signal, the tsx CLI waits only 30 ms for the child to report the signal over IPC; if the child's event loop is busy (dev-mode Next.js work), tsx kills the child and exits `128 + signal`. It predates this task: with `src/app` temporarily restored to the base (`base-app.sh`, hashes verified on restore) it failed 1 of 60 runs (0 of 30 in an earlier batch); with this task's `src/app` 3 of 60 and 2 of 30 — the dev server now has more to compile, which may make the race more likely (small samples; not proven). Prod mode (`npm run test:e2e`, `npm run check`) passed every time. Not fixed here: `shutdown.spec.ts`/`server.ts` belong to task 4.2 and are out of scope; needs a coordinator/user decision (for example spawning `server.ts` with `node --import tsx` instead of the tsx CLI in the fixture and the spec, or accepting 128+signal from the wrapper).
2. "Later messages only" and duplicate-nickname message delivery are verified only in part (see the mapping); they depend on task 5.2.
3. `checks.txt` contains a long entry (mutation 3b prints the full hydration-error diffs for 12 tests); kept as recorded.
4. The in-memory fallback (storage unavailable) is per page session only; the nickname is asked again after a reload in that case (by design of the fallback; not a spec requirement).

## Helper bodies

The helpers live in the Claude Code scratchpad directory of this session (`$SP` below), not in the repository. `mutate.sh` is shown in its final form; for mutation 1 its diff line was `git diff -U0 -- "$f" | grep -E '^[-+][^-+]'`, which printed nothing for the untracked file, and was then replaced by `diff "$SP/mutation-backup" "$f"` (recorded in `checks.txt`).

### `rec51.sh`

```bash
#!/usr/bin/env bash
# rec51.sh '<command>': runs <command> with bash -c in the submission root and appends a
# timestamped entry ("$ <command>", combined stdout/stderr, measured exit code) to
# checks.txt. Trailing spaces/tabs/CRs in recorded lines are shown as [SPACE]/[TAB]/[CR].
set -u
ROOT=/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada
OUT="$ROOT/docs/evidence/add-realtime-chat-room-5-1/checks.txt"
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
# server.ts, next, playwright, or vitest (shell wrappers of the recorder are excluded
# because their first word is /bin/bash). Also reports a listener on port 3000.
out=$(pgrep -af '^[^ ]*(/node|headless_shell|/chrome) ' | grep -E 'server\.ts|next|playwright|vitest')
if [ -n "$out" ]; then echo "$out" | cut -c1-200; else echo "no matching processes"; fi
ss -ltn 2>/dev/null | grep -E ':3000\b' || echo "port 3000: no listener"
```

### `mutate.sh`

```bash
#!/usr/bin/env bash
# mutate.sh <file> <old> <new> <grep-filter>: backs up <file> to the scratchpad, replaces
# the single occurrence of <old> with <new> (fails if not exactly one), shows the diff,
# runs e2e/nickname.spec.ts in dev mode, restores the backup, and verifies the SHA-256
# of the restored file equals the original.
set -u
f=$1; old=$2; new=$3
SP=/tmp/claude-1000/-home-ksabada-projects-AI-course-2026-agentic-engineering-crash-course-capstone/4034e690-c8bb-4005-a19e-8b3d5038ed0e/scratchpad
before=$(sha256sum "$f" | cut -d' ' -f1)
cp "$f" "$SP/mutation-backup"
python3 - "$f" "$old" "$new" <<'PY' || { echo "mutation not applied"; exit 98; }
import sys
p, old, new = sys.argv[1:4]
s = open(p, encoding='utf-8').read()
if s.count(old) != 1: sys.exit(f"expected exactly one occurrence, found {s.count(old)}")
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY
diff "$SP/mutation-backup" "$f"
set -o pipefail
E2E_SERVER_MODE=dev npx playwright test e2e/nickname.spec.ts --reporter=line 2>&1 | grep -vE '^\s*$' | grep -E 'passed|failed|flaky|^\s+[0-9]+\) |Expected|Received|^\s+[-+] |console:|pageerror|Hydration|hydrat'
echo "mutated run pipeline exit: $?"
cp "$SP/mutation-backup" "$f"; rm -f "$SP/mutation-backup"
after=$(sha256sum "$f" | cut -d' ' -f1)
echo "sha256 before: $before"; echo "sha256 after:  $after"
[ "$before" = "$after" ] && echo "RESTORED: hashes match" || { echo "RESTORE MISMATCH"; exit 97; }
```

### `base-app.sh`

```bash
#!/usr/bin/env bash
# base-app.sh <command>: temporarily puts src/app back to the base commit (moves the task's
# src/app files to the scratchpad, restores page.tsx/layout.tsx from HEAD), runs <command>,
# then restores the task's files and verifies their SHA-256 hashes.
set -u
SP=/tmp/claude-1000/-home-ksabada-projects-AI-course-2026-agentic-engineering-crash-course-capstone/4034e690-c8bb-4005-a19e-8b3d5038ed0e/scratchpad
B=$SP/app-backup; rm -rf "$B"; mkdir -p "$B"
files="src/app/page.tsx src/app/layout.tsx src/app/globals.css src/app/_chat/chat-room.tsx src/app/_chat/nickname-form.tsx"
sha256sum $files > "$B/sums"
cp -a src/app "$B/app"
rm -rf src/app/_chat src/app/globals.css
git show HEAD:submissions/kostyasabada/src/app/page.tsx > src/app/page.tsx
git show HEAD:submissions/kostyasabada/src/app/layout.tsx > src/app/layout.tsx
echo "src/app now:"; ls -R src/app; git status --short src/app
bash -c "$1"; rc=$?
rm -rf src/app; cp -a "$B/app" src/app
sha256sum -c "$B/sums" && echo "RESTORED: hashes match"
rm -rf "$B"
exit $rc
```

### `shots.ts`

```ts
// shots.ts: supplementary screenshots of the nickname form (not a behavioral test).
// Starts the production server through the E2E fixture class on a free port with a
// temporary database, captures a valid state and an error state, then stops the server.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/node_modules/@playwright/test/index.mjs'
import { ChatServerProcess, freePort } from '/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/e2e/fixtures/chat-server'

const EV = '/home/ksabada/projects/AI_course/2026-agentic-engineering-crash-course-capstone/submissions/kostyasabada/docs/evidence/add-realtime-chat-room-5-1'

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), 'chat-shots-'))
  const server = new ChatServerProcess(await freePort(), path.join(dir, 'chat.sqlite'), 'prod')
  const browser = await chromium.launch()
  try {
    await server.start()
    const page = await browser.newPage({ viewport: { width: 800, height: 420 } })
    await page.goto(server.baseURL)
    await page.getByLabel('Nickname', { exact: true }).fill('  Alice_1  ')
    await page.screenshot({ path: `${EV}/nickname-form-valid.png` })
    await page.getByLabel('Nickname', { exact: true }).fill('bob@home')
    await page.getByRole('button', { name: 'Join' }).click()
    await page.getByRole('form').getByRole('alert').waitFor()
    await page.screenshot({ path: `${EV}/nickname-form-error-characters.png` })
    await page.getByLabel('Nickname', { exact: true }).fill('a'.repeat(40))
    await page.screenshot({ path: `${EV}/nickname-form-error-too-long.png` })
    await page.getByLabel('Nickname', { exact: true }).fill('Alice_1')
    await page.getByRole('button', { name: 'Join' }).click()
    await page.getByText(/^Chatting as /).waitFor()
    await page.screenshot({ path: `${EV}/nickname-accepted.png` })
    console.log('screenshots written')
  } finally {
    await browser.close()
    await server.stop()
    await rm(dir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```
