# Task add-realtime-chat-room-5-4 — checker review

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker. Fresh subagent with a scoped handoff; no repairs, staging, commits, or checkbox changes.
- Round: 1
- Date: 2026-09-30
- Runtime: Node v24.21.0, npm 11.19.0
- Base commit: `b9fb1e7` (`git log --oneline -1`: `b9fb1e7 feat: add connection status and reconnection catch-up (task 5.3)`); nothing staged.
- Reviewed snapshot: `snapshot.txt` (revision 1). Every hash line verified with `sha256sum -c` (all `OK`), before and after my mutation runs: `e2e/history.spec.ts` `85b39c39…`, `message-list.tsx` `9f6841ae…`, `use-chat-socket.ts` `8d96f67b…`, `chat-room.tsx` `6895ee49…`, `globals.css` `ad2bd85d…`, both PNGs, and `implementation.md` `46bd3768…`. `checks.txt` hash computed: `e8ed0b2727aae8951a19a2891a9d21a8b91c80c4057be0b8a168eef1b9a77037`, equal to the value stated in `snapshot.txt`.
- This `review.md` is an evidence report added after the snapshot and is not part of it.

## Sources read

`AGENTS.md`, `docs/review-process.md`, task 5.4 (and 6.1) in `tasks.md`, design D2, D6, and Q4, the chat-room spec requirements "Recent history for a joining client" (all five scenarios) and "History survives a server restart", the maker evidence (`implementation.md`, `checks.txt` in full by entry, `snapshot.txt`, both PNGs viewed), `e2e/history.spec.ts` in full, and the diffs against `b9fb1e7` of `message-list.tsx`, `use-chat-socket.ts`, `chat-room.tsx`, and `globals.css`. Also `docs/testing.md` (coverage section) and the relevant parts of `e2e/fixtures/chat-server.ts`.

## Criteria vs tests

| Task 5.4 case / spec scenario | Test (`e2e/history.spec.ts`) | Assessment |
|---|---|---|
| 105 seeded → exactly 6–105, oldest first, 105 visible without scrolling | line 229 | Meaningful: exact ordered list of 100 rows, 105 inside the list box and the viewport with `scrollY === 0`, list really overflows, message 6 not visible. Also checks Tab reaches the list and leaves it. |
| New message scrolls into view at the bottom | line 256 | Meaningful: from another client (B), visible and at bottom; re-evaluated after Home/End. |
| Scrolled up → view not moved | line 290 | Meaningful: message rendered in A's DOM first, then two frames, then `scrollTop` equal and `scrollHeight` grown; repeated at `scrollTop` 0. |
| 3 messages → all 3 | line 340 | Meaningful: nicknames, texts, `datetime`, and `HH:MM` in order. |
| Empty room hint | line 364 | Meaningful: hint visible on A and B with no items; gone on both once a message arrives. |
| History identical after restart | line 381 | Meaningful: messages accepted through the server (not seeded), `history` payload before and after `stop()`/`start()` compared with `toEqual` (ids, nicknames, texts, createdAt, order) and rendered rows compared. Real persistence: the maker's mutation 7 (`:memory:`) makes it fail. |

All six cases of task 5.4 are covered. The waits are DOM-state polls or two-frame synchronization; no timed sleeps.

## Correctness vs spec

- 105 → 6–105 oldest first and 105 visible without scrolling: confirmed by the test and by `history-105-at-bottom.png` (messages 100–105, composer in view at 1280×720).
- Auto-scroll only at the bottom: `message-list.tsx:48-55` sets `scrollTop = scrollHeight` in a `useLayoutEffect` on `[messages]` only if `atBottomRef` was true; `onScroll` (`message-list.tsx:57-60`) updates the ref with a 16 px threshold. Content growth fires no scroll event, so the ref reflects the person's last position. Consistency of 16 px (app) vs 1 px (test): consistent. The test's 1 px is the tolerance for the result of the app's own scroll (`scrollTop = scrollHeight` gives distance 0 up to sub-pixel rounding); it is not a second definition of "at the bottom", and the scrolled-up test uses a distance above 100 px, well outside the 16 px threshold.
- Scrolled-up view not moved: confirmed; `history-scrolled-up-new-message.png` matches the recorded `2779 → 2779`.
- Empty hint: rendered only when `historyLoaded && messages.length === 0` (`message-list.tsx:62-64`); `historyLoaded` is set in the `history` handler (`use-chat-socket.ts:91-94`) and never reset, which is correct because the room state stays known across reconnects. Hidden as soon as a message exists.
- Restart persistence: real (file-backed DB, same path on `start()`), see above.
- Accessibility of the scroll container: `<ol aria-label="Messages" tabIndex={0}>` keeps the native `list` role with an accessible name (aria snapshot: `list "Messages"`). A focusable scrollable region is the recommended pattern for keyboard users (it is what axe's `scrollable-region-focusable` rule asks for), and there is no focus trap: in my check Tab moved Change nickname → list → Message textbox, and Shift+Tab twice returned to Change nickname. The focus ring is the browser default (`outline: auto 1px`, `:focus-visible` matched). No empty focusable element exists while the room is empty. ESLint (including jsx-a11y from `eslint-config-next`) reports nothing. Acceptable.

## Findings

| # | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|
| F1 | Low (test gap, acknowledged by the maker) | `src/app/_chat/message-list.tsx:63` | The "no hint before the history arrives" behavior is untested: my mutation B (ignore `historyLoaded`, always show the hint when the list is empty) left all 6 tests green. The behavior itself is correct in the code. Without it a room that has messages would briefly show an inaccurate "No messages yet." | Not blocking. Optional follow-up: one test that holds the first polling response (for example with `page.route` on `/socket.io/?EIO=4&transport=polling`) and asserts the hint is absent while the list is empty, then releases it. Could be done now by the maker in a few lines, or left documented; not needed for 6.1. |
| F2 | Low (test gap, acknowledged) | `src/app/_chat/message-list.tsx:14` | The 16 px threshold is not tested at its boundary: my mutation A (threshold 0 px) left all tests green at 1280×720, where scroll positions are integral. A threshold that is too large is detected (my mutation D, 100000 px, failed the scrolled-up test). | Not blocking; keep as a documented limitation. A boundary test would be timing- and zoom-sensitive for little value. |
| F3 | Info | `src/app/_chat/message-list.tsx:54` | A new message taller than the list (observed at 375 px with a 1000-character unbroken text, list height 406 px) is scrolled to its bottom, so its author and time line is above the visible area. The message is visible, so the spec scenario holds; it is a UX detail. | No change now. If the user wants it, scroll the new last item's top into view when it is taller than the list. |
| F4 | Info (acknowledged) | `src/app/_chat/message-list.tsx:46-56` | A height change of the list (window resize, textarea resize) does not re-run the scroll to the bottom; only message changes do. The next message still scrolls correctly because the ref stays true. | No change now. |
| F5 | Info (docs, acknowledged) | `docs/testing.md:32-42` | "Current and planned coverage" still lists only the setup-era tests and names the chat tests as planned. No task in `tasks.md` owns this section (1.6 covered the commands only), and 6.1 is a verification task. | Recommend a small documentation task before 6.1 (or an explicit addition to 6.1's scope), decided by the user. Not a 5.4 defect: the file is outside 5.4's owned files. |
| F6 | Nit | `e2e/history.spec.ts:327-328` | Two consecutive blank lines inside the scrolled-up test. Not a whitespace error (`git diff --check` clean) and not flagged by lint. | Optional cleanup if the file is touched again. |

No blocking defects.

## Evidence honesty

- Red run genuine: "RED RUN (prod)" shows 4 failed, 2 passed with `git diff --stat -- src` empty; its `[exit 0]` comes from the trailing `procs.sh`, and the next entry states this explicitly instead of rewriting the log. The 30 s timeout of the scrolled-up test in that run is visible ("Test timeout of 30000ms exceeded"), and the helper change (resolve at once if the position did not change) is recorded in the "RED RUN 2" entry, which ends with `[exit 1]` and the same 4/2 split. The failure reasons match `implementation.md`.
- Already-green tests stated explicitly (3-message and restart) and backed by mutations 6 (newest first) and 7 (`:memory:` DB), whose logs show those tests failing and restores hash-verified.
- Mutations 1–7: every log entry shows the diff, `mutated run exit: 1`, the failing tests as listed in `implementation.md`, and `RESTORED: hashes match`.
- Whitespace misread corrected honestly: the "WHITESPACE" entry keeps `[exit 1]`, the calibration entry shows exit 3 for a trailing space and 1 for a clean file, and "WHITESPACE 2" re-interprets with that calibration.
- Final checks in `checks.txt` (prod/dev repeat-3, unit 465, E2E 49 in both modes, lint, typecheck, `check`, `check:loop`) are consistent with my own reruns.

## Independently executed checks

Recorded with my own recorder (visible `[SPACE]`/`[TAB]`/`[CR]` markers, measured exit codes) in the session scratchpad, outside the repository; 2026-09-30T07:45Z–08:13Z.

| Check | Result |
|---|---|
| `sha256sum -c` of the snapshot hash lines; `checks.txt` hash | all `OK`; `e8ed0b27…` matches |
| `E2E_SERVER_MODE=dev npx playwright test e2e/history.spec.ts --repeat-each=5` | 30 passed, 0 flaky, pipeline exit 0 |
| `npx next build` then `npx playwright test e2e/history.spec.ts --repeat-each=3` (prod) | 18 passed, 0 flaky, pipeline exit 0 |
| Mutation A: `AT_BOTTOM_THRESHOLD_PX = 0` | 6 passed (survived; see F2); restored, hashes match |
| Mutation B: hint shown before the history arrives (`historyLoaded` ignored) | 6 passed (survived; see F1); restored, hashes match |
| Mutation C: scroll to the bottom on every render, unconditionally (`useLayoutEffect` without deps) | scrolled-up test failed (1 failed, 5 passed), exit 1; restored, hashes match |
| Mutation D: `AT_BOTTOM_THRESHOLD_PX = 100000` | scrolled-up test failed (1 failed, 5 passed), exit 1; restored, hashes match |
| Mutation E: hint kept next to the list (first attempt was invalid JSX, a syntax error in my mutation, not a test result; redone as a hint `<li>` inside the list) | all 6 failed (extra list item), exit 1; restored, hashes match |
| Mutation F: hint rendered in `chat-room.tsx` whenever `historyLoaded` (never hidden) | 105, 3-message, and empty-room tests failed (3 failed), exit 1; restored, hashes match |
| `npm run test:unit` | 10 files, 465 tests passed, exit 0 |
| `npm run lint`, `npm run typecheck` | exit 0, exit 0 |
| `npm run test:e2e` | 49 passed, exit 0 |
| `npm run test:e2e:dev` | 49 passed, exit 0 |
| `npm run check` | exit 0 (lint, typecheck, 465 unit, build, 49 E2E) |
| `npm run check:loop` | exit 0 (lint, typecheck, 465 unit, 49 E2E dev) |
| `git diff --check` | exit 0 |
| `git diff --no-index --check /dev/null <file>` per untracked text file (`checks.txt`, `implementation.md`, `snapshot.txt`, `e2e/history.spec.ts`) | exit 1 each (clean; 3 would mean a whitespace error) |
| `git status --short` | the 4 modified `src/` files, `?? docs/evidence/add-realtime-chat-room-5-4/`, `?? e2e/history.spec.ts`; 0 staged |
| Processes and port after every E2E entry (node/Chromium with `server.ts`, `next`, `playwright`, `vitest`, or `tsx`) | "no matching processes", "port 3000: no listener" |

## Layout check (375 px)

A checker script (`node --import tsx`, production build current, the E2E fixture's `ChatServerProcess` on a free port, a temporary DB seeded with 105 messages, Chromium 375×812 with mobile emulation) joined, sent one 1000-character unbroken message, and measured. The first attempt failed inside my script (tsx `__name` helper inside `page.evaluate`); the second ran:

- No horizontal scroll: `documentElement.scrollWidth` 375 = `clientWidth` 375; `body.scrollWidth` 375; the list's `scrollWidth` 341 = `clientWidth` 341 (the long word wraps, `overflow-wrap: anywhere`).
- Page not scrolled (`scrollY` 0); list 16–359 px wide, 406 px high; list at the bottom (distance 0) after my own message.
- Composer usable: the Message textbox (16–290 px) and the Send button (298–359 px, bottom 731 px) are fully inside the viewport.
- Keyboard: see "Correctness vs spec"; no console errors.
- The temporary directory `chat-chk54-layout-*` was removed by the script (checked: none left); the screenshot stayed in the scratchpad and is not evidence here.

## Maker's open questions (recommendations; the user decides)

- (a) Own sent message when scrolled up: recommend that the person's own sent message always scrolls to the bottom. It is what most chat apps do, and without it a person who scrolled up, typed, and sent sees no confirmation that the message appeared. This is a spec addition (a scenario under "Recent history for a joining client", for example "Own message scrolls into view") plus a small UI change (scroll after a successful `send` ack, or when a merged message id equals the acked id) and one E2E test, done spec-first as its own small task. Keeping the current single rule is also acceptable and consistent with the current spec, which is silent.
- (b) Hint text "No messages yet." and list height `min(50vh, 32rem)`: recommend keeping both. The text matches the spec wording ("a hint that there are no messages yet"), and the height keeps the composer in view at 1280×720 and at 375×812 (verified above). No spec change needed.

## Limitations (assessment)

- Hint flash before the history (F1): low; fix now is optional, otherwise keep documented. Not a 6.1 item.
- Threshold boundary (F2): low; keep documented.
- Resize not re-scrolling (F4): low; keep documented.
- Mutations only in dev: acceptable; the unmutated suite is green in both modes (maker and my reruns), and the mutated code paths are client-side and mode-independent. My mutations also ran in dev only.
- `docs/testing.md` coverage section stale (F5): fix before archiving, through a small docs task or an explicit 6.1 scope addition, as the user decides.
- My own limitations: I did not test other browsers, dark mode, or zoom levels other than 100%; the 375 px check is a one-off script, not a committed test.

## Verdict

**accepted** (round 1) for the snapshot in `snapshot.txt` revision 1. All task 5.4 criteria are met with meaningful tests, the red run is genuine, the required checks pass in my reruns, and the findings are low or informational and do not block completion. Open question (a) needs a user decision and, if accepted, a separate spec-first task.
