# Review of task add-realtime-chat-room-5-2

## Round 1

- Reviewer: Claude Code general-purpose subagent (checker), separate from coordinator and maker.
- Date: 2026-09-29.
- Runtime: Node v24.21.0, npm 11.19.0 (`PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`).
- Base commit: `33e0900` (`git log --oneline -1`: `33e0900 fix: start server via node --import tsx for reliable graceful shutdown (task 4.3)`). Nothing staged or committed by the checker; no file of the snapshot was changed (mutations restored and hash-verified, see below).
- Reviewed snapshot: `snapshot.txt` revision 1. `grep -E '^[0-9a-f]{64}  ' snapshot.txt | sha256sum -c` from the repository root: all 10 lines `OK`, exit 0 (8 deliverables, 2 screenshots).
- Evidence files outside the snapshot, hashed by the checker:
  - `checks.txt`: `dd7137ad914ee3ead22a0598f4794ae1d7aa5d547699605ddb8d550d711f46e1` (matches the maker's reported `dd7137ad…46e1`).
  - `implementation.md`: `d7fdc843d29a877a1bcf347d351ab82295fccc5d590f48b00ac595992d3569f9`.
  - This `review.md` is not hashed inside itself.

### Scope read

`AGENTS.md`, `docs/review-process.md`, task 5.2 in `tasks.md`, `design.md` D1, D2 (Socket.IO contract, send flow, 5 s ack timeout, history/catch-up rule, P19, P20), D4 (layout, boundary table, "production files only"), D6, Q2–Q6, `specs/chat-room/spec.md` (all requirements touched by 5.2 and the nickname message clauses), `src/lib/chat/schema.ts`, `eslint.config.mjs` (boundary groups). Read in full: `src/app/_chat/merge-messages.ts`, `merge-messages.test.ts`, `use-chat-socket.ts`, `message-list.tsx`, `composer.tsx`, `chat-room.tsx` (and `git diff 33e0900`), the `globals.css` diff, `e2e/messaging.spec.ts`, and the maker's `implementation.md`, `snapshot.txt`, `checks.txt`; both PNGs were viewed.

### Coverage of task 5.2 and the five 5.1 additions

Every case of task 5.2 has a meaningful E2E test in `e2e/messaging.spec.ts` (the maker's mapping table in `implementation.md` is accurate; line numbers checked): delivery without reload (154, window marker survives), two quick sends in server order in both contexts (166, checked against a Node observer's ids), literal markup with no `img`/`b` element and dialogs failing the test (186), three lines via Shift+Enter with `textContent`, `innerText`, and rendered height (203), trimming and the trimmed counter (229), empty/whitespace-only not sent via Enter and button (244), oversized typed and pasted text kept in full with limit message, disabled Send, and no `maxlength` (267), exactly 1000 including a surrogate pair (307), 1020 raw accepted (331), `HH:MM` in UTC plus UTC+05:30 and a live message (348), oversized and invalid-nickname payloads from a modified `socket.io-client` rejected, not broadcast, not stored (378), foreign `Origin` refused on WebSocket and polling with an own-Origin control (414), send failure by server rejection (460) and by the real 5 s timeout (491), both keeping the text.

The coordinator's additions: (1) nickname change Alice→Alicia on both contexts and after reloading A (547; the composer reads the nickname prop at send time, `composer.tsx:49`, and maker mutation 4 kills a mount-time capture); (2) two `Sam`s (570); (3) `  Alice_1  ` enables the input and is shown as `Alice_1` on another client (519); (4) no message input while an empty/whitespace nickname error is shown at join (533; see F4 for the change-nickname case); (5) conventions: role/label helpers, composer and Send scoped to region "Chat", alerts scoped to their form, per-test console/pageerror/dialog check in `afterEach` after closing contexts (27–37).

### Correctness against D2, Q2–Q6, P20

- Ack handling: `ok` → merge `ack.message` and clear; error ack → `Message not sent: <server message>`; timeout (`socket.timeout(5000).emitWithAck`) → timeout message (`use-chat-socket.ts:9`, `:81–87`). Codes follow the contract type (`:15–17`).
- Text cleared only on success, and only if unchanged since the send (`composer.tsx:52–58`); kept on failure (maker mutation 5).
- Dedupe by id for history, broadcast, and ack; order by id (`merge-messages.ts:15–19`); `replace` discards, `append` merges (`:27–29`). Unit tests cover both; checker mutation A kills append-as-replace.
- `lastSeenId`: `auth` is a function reading a ref kept at the highest id (`use-chat-socket.ts:51–61`), as D2 requires. Reconnect behavior itself is task 5.3.
- One socket per `ChatRoom` (`chat-room.tsx:63`), created in an effect and cleaned up with `removeAllListeners()` + `disconnect()` (`use-chat-socket.ts:55–74`). SSR safe: the server render is `Loading…`, the socket and `Date` formatting run in the browser only; no hydration or console error appeared in any E2E run (the per-test error check would fail) or in the manual session.
- Enter sends, Shift+Enter inserts a newline, IME composition is ignored (`composer.tsx:67`); checker mutation B kills Shift+Enter sending.
- No `maxlength`; counter of `value.trim().length`; limit message shown immediately when over the limit; Send disabled when disconnected, pending, or over the limit (`composer.tsx:35–40`); checker mutation D kills a missing pending guard.
- `HH:MM` from `getHours()`/`getMinutes()` with a full `toLocaleString()` `title` and `dateTime` (`message-list.tsx:6–8`, `:30–32`); React text children only, `white-space: pre-wrap` (`globals.css`), no `dangerouslySetInnerHTML` (grep: only in a comment; `react/no-danger` is an error, maker mutation 2).
- Boundaries: production files in `src/app/**` import only `src/lib/chat/schema`, `react`, and `socket.io-client`; `e2e/messaging.spec.ts:4–5` seeds through `SqliteMessageRepository`/`openDatabase`, which D4 and D6 allow (`e2e/**` is outside the boundary groups in `eslint.config.mjs`, only `react-hooks/rules-of-hooks` is changed there). `npm run lint` exit 0.

### Findings

| # | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|
| F1 | low (comment) | `src/app/_chat/use-chat-socket.ts:42-43` | The doc comment says the reconnect listeners "are registered here", but only `connect`/`disconnect` are registered; `implementation.md` correctly says 5.3 will add `reconnect_attempt`/`reconnect_failed`. | Reword (e.g. "will be registered here") now or in task 5.3. Not blocking. |
| F2 | low (robustness) | `src/app/_chat/use-chat-socket.ts:85`, `src/app/_chat/composer.tsx:49-51` | If an ack were not an object (a contract violation), `ack.ok` would throw, `onSend` would reject, and `sendingRef`/`sending` would never be reset, leaving Send disabled until reload. The real server always acks per the contract (controller tests of task 4.1), so this is not reachable today. | Optional: treat a malformed ack as a failure, or reset the pending state in a `finally`. Not blocking. |
| F3 | info | `src/app/_chat/use-chat-socket.ts:86` | Merging the ack message is not independently observable: checker mutation C (line removed) keeps all 18 tests green, because the sender also receives the `message:new` broadcast (D2). The ack+broadcast dedupe itself is proven by maker mutation 1 (duplicate-key errors). | No action; the ack merge is a harmless safeguard. |
| F4 | info | `src/app/_chat/chat-room.tsx:81-103`; `e2e/messaging.spec.ts:533` | While the "Change nickname" form is open (also with a validation error), the list and composer stay available under the previous nickname. Addition (4) is tested for the join form only. The spec scenario "Invalid nickname change is rejected" ("the previous nickname stays in use") supports this behavior, so I consider it compliant. | Coordinator: confirm that addition (4) meant the join case. No user decision needed unless the coordinator meant otherwise. |
| F5 | nit | `e2e/messaging.spec.ts:42` | `messageInput` is page-scoped, while `sendButton`, `composer`, and `messageList` are scoped to region "Chat". The composer is still shown to be inside the region, because every test waits for the region-scoped Send button. | Optional: scope `messageInput` to `chatRegion` as well. |
| F6 | nit (coverage) | `src/app/_chat/composer.tsx:67` | The IME `isComposing` guard has no test (hard to drive in Playwright). The code is correct. | Record as a limitation; no action. |

No blocking defect found.

### Maker choices

- **One pending send at a time** (Send disabled until ack or timeout): acceptable UX, consistent with D2 (no offline queue) and with the handoff's "Send disabled when pending". Spec concurrency is across clients and is tested. No user decision needed.
- **`.message__author` / `.message__text` in `readMessages`**: acceptable. They are used only inside `evaluateAll` to read exact `textContent` from list items already located by role (`list "Messages"` → `listitem`), never for interaction; role/label locators cannot return unnormalized text. No change needed (a `data-testid` would only add attributes).
- **Server rejection by rewriting packets with `routeWebSocket`**: acceptable and deterministic; the real server produces the `invalid_nickname` ack, and the helper waits for the engine.io upgrade packet so that no send goes over polling. It depends on the Socket.IO packet format (`42<ackId>["message:send"`) and on JSON key order in the payload; revisit if Socket.IO is upgraded. It is the Q12 technique that task 5.3 may reuse.
- **Foreign Origin through a Node client**: acceptable; a browser page cannot send a foreign `Origin` to the fixture without DNS setup, and Host/DNS-rebinding cases are covered by `src/server/app.test.ts` and `e2e/host-policy.spec.ts`.

None of the four needs a user decision.

### Readiness for task 5.3

`useChatSocket()` returns `{ messages, connected, send }`; `Composer` takes `connected` as a prop and already disables Send and keeps the text when it is false. A `status` (`Connected` / `Reconnecting` / `Disconnected`) can be derived in the same effect from `socket.io` manager events (`reconnect_attempt`, `reconnect_failed`) and the `disconnect` reason (`io server disconnect` does not reconnect automatically) without changing the list, merge, or composer contracts. `lastSeenId` catch-up is already wired through the `auth` function.

### Evidence honesty

- Red runs are genuine: the unit red run shows `merge-messages.test.ts` present and `merge-messages.ts` absent (`Cannot find module './merge-messages'`, exit 1); the E2E red run shows only `chat-room.tsx`, `merge-messages.test.ts`, and `nickname-form.tsx` in `src/app/_chat`, 17 failed on the missing enabled `Send`, 1 passed, exit 1. The one pass is the absence test for addition (4), correctly explained as a regression guard.
- Maker mutations 1–7 each show the diff, a killing run, and `RESTORED: hashes match`; the restored hashes equal the snapshot hashes.
- The head-truncated mutation-1 entry is kept with `mutated run exit: 141` and a follow-up note; the three screenshot attempts (CJS top-level await, unresolvable package, success) are kept; the unplanned extra dev run (12:55:07Z, 18 passed) is logged and disclosed; the overwritten shared-scratchpad `procs.sh` is disclosed with its body.
- Entry timestamps are in execution order (12:32:16Z to 13:07:43Z).

### Independent checks (checker, Node v24.21.0)

All run from `submissions/kostyasabada/`. Durations are wall-clock per recorded command.

| Command | Result |
|---|---|
| `sha256sum -c` of the snapshot hash lines | 10 × `OK`, exit 0 |
| `sha256sum checks.txt` | `dd7137ad914ee3ead22a0598f4794ae1d7aa5d547699605ddb8d550d711f46e1` |
| `npx vitest run src/app/_chat/merge-messages.test.ts` | 1 file, 12 passed, exit 0 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 9 files, 446 passed, exit 0 |
| `npm run build` then `npx playwright test e2e/messaging.spec.ts --repeat-each=3` (prod) | `54 passed (1.9m)`, exit 0; 0 failed, 0 flaky; timeout test 6.0 s, 6.0 s, 6.0 s |
| `E2E_SERVER_MODE=dev npx playwright test e2e/messaging.spec.ts --repeat-each=3` | `54 passed (2.7m)`, exit 0; 0 failed, 0 flaky; timeout test 6.3 s, 6.2 s, 6.3 s |
| `npm run test:e2e` | `37 passed (1.0m)`, exit 0 |
| `npm run test:e2e:dev` | `37 passed (1.5m)`, exit 0 |
| `npm run check` | lint, typecheck, 446 unit, `37 passed (1.0m)`, exit 0 (85 s) |
| `npm run check:loop` | lint, typecheck, 446 unit, `37 passed (1.5m)`, exit 0 (110 s) |
| `git diff --check` | no output, exit 0 |
| `git diff --no-index --check /dev/null <file>` for the 9 untracked text files | no whitespace report for any file (exit 1 = files differ) |
| `git status --short` | unchanged from the maker's state: `M` chat-room.tsx, globals.css; `??` the evidence directory, `e2e/messaging.spec.ts`, composer, merge-messages (+test), message-list, use-chat-socket |
| `git log --oneline -1` | `33e0900` |

Checker mutations (each applied to one occurrence, run, restored; SHA-256 before = after = snapshot hash):

| # | File | Mutation | Run | Result |
|---|---|---|---|---|
| A | `merge-messages.ts` | `applyHistory` ignores `append` (always replaces) | unit | killed: `append merges the missed messages …` failed, 1 failed / 11 passed; restored `096e0e2b…dc04` |
| B | `composer.tsx` | Shift+Enter also sends (no `shiftKey` check) | E2E dev | killed: `a three-line message is shown on three lines` failed, 1 failed / 17 passed; restored `3bcc5fe8…988b3a` |
| C | `use-chat-socket.ts` | accepted ack message not merged | E2E dev | survived: 18 passed (expected, see F3); restored `fb3ce372…6d7f` |
| D | `composer.tsx` | Send not disabled while a send is pending | E2E dev | killed: the 5 s timeout test failed, 1 failed / 17 passed; restored `3bcc5fe8…988b3a` |
| E | `use-chat-socket.ts` | ack timeout 3 s instead of 5 s | E2E dev | killed: the 5 s timeout test failed, 1 failed / 17 passed; restored `fb3ce372…6d7f` |

Manual look: `npm run dev` started in its own process group with `CHAT_DB_PATH` in a checker scratch directory (the project's `data/` was not touched); `GET /` returned 200; two tabs in the built-in browser pane (same browser profile, so both used the nickname `Checker`, with two separate sockets); tab 2 was loaded before tab 1 sent `manual check from tab 1`, and both tabs then showed `Checker 16:27` / `manual check from tab 1`; no console errors in either tab. `SIGINT` to the process group: the log shows `> Received SIGINT, shutting down` and `> Server closed`, the group exited, port 3000 had no listener, and only `chat.sqlite` remained (no `-wal` file).

Processes: before and after all runs, no process matching `server.ts|next-server|next dev|playwright|vitest|tsx` (the checker's own shells excluded), no listener on port 3000, 0 `/tmp/chat-e2e-*` directories. The checker's scratch directory (helpers, logs, manual database) was removed at the end.

### Limitations

- Reconnection, the status UI, and `lastSeenId` catch-up are not exercised (task 5.3), and neither are auto-scroll or the empty-room hint (task 5.4).
- The IME guard is reviewed in code only (F6).
- The manual session used two tabs of one browser profile, not two independent contexts; the E2E tests cover independent contexts.
- The checker's raw command log was kept only in its scratch directory; the results above are copied from it.

### Verdict

**accepted** — all task 5.2 criteria and the five 5.1 additions are covered by meaningful tests, the repeat runs are stable in prod and dev, all required checks pass, and the evidence is accurate. Findings F1–F6 are non-blocking; F1 and F2 may be addressed in task 5.3 or later at the coordinator's discretion.
