# Task add-realtime-chat-room-5-5 — checker review

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker. Fresh subagent with a scoped handoff; no repairs, staging, commits, or checkbox changes.
- Round: 1
- Date: 2026-09-30
- Runtime: Node v24.21.0, npm 11.19.0
- Base commit: `393e3d2` (`git log --oneline -1`: `393e3d2 feat: add scrollable history, auto-scroll, and empty-room hint (task 5.4)`); nothing staged (`git diff --cached --name-only | wc -l` → 0).
- Reviewed snapshot: `snapshot.txt` (revision 1). Every hash line verified with `sha256sum -c` (all `OK`) before my runs and again after all mutations: `tasks.md` `66d8eecc…`, `spec.md` `7668da62…`, `design.md` `9d36081b…`, `e2e/history.spec.ts` `9774ac1f…`, `use-chat-socket.ts` `7895d4a4…`, `message-list.tsx` `d6391d65…`, `chat-room.tsx` `253e32d6…`, `implementation.md` `c325da19…`. `checks.txt` hash computed: `e3747462749a56e49856551fa42b6e5d244c0f078a97a61eee353362c895fdcd`, equal to the value stated at the end of `snapshot.txt`.
- This `review.md` is an evidence report added after the snapshot and is not part of it.

## Sources read

`AGENTS.md`, `docs/review-process.md`, the maker evidence (`implementation.md` including the helper bodies, `checks.txt` by entry, `snapshot.txt`), the 5.4 review (`docs/evidence/add-realtime-chat-room-5-4/review.md`, F1–F6), and the diffs against `393e3d2` of `tasks.md`, `specs/chat-room/spec.md`, `design.md` (Q4), `use-chat-socket.ts`, `message-list.tsx`, `chat-room.tsx`, and `e2e/history.spec.ts`. Also `merge-messages.ts`, `send-ack.ts`, and the broadcast line of `src/server/chat/chat.controller.ts:87` (`io.to(CHAT_ROOM).emit`, so the sender receives its own broadcast as well).

## Spec-first coherence

- Task 5.5 (`tasks.md:40`) is new, unticked, names the user decision and design Q4 (a), requires the spec edit before the code, a red-first test, the two mutations, and the full check list. Consistent with what was done.
- Spec (`spec.md:156`): one added sentence (scroll on an accepted own message even when scrolled up; a message that was not accepted does not move the view). New scenario "Own message scrolls into view" (`spec.md:171-173`). "Reading older messages is not interrupted" already says "another client sends a new message", so leaving it unchanged is correct.
- Design Q4: records the Ukrainian quote, its translation, the date 2026-09-30, (a) and (b) as accepted recommendations, and states that (c) (`docs/testing.md`) belongs to 6.1 and does not change the design. Nothing else is labelled a user decision; the implementation detail "triggered by the accepted acknowledgement" is in the task text, not presented as a user decision.
- `docs/testing.md` untouched (`git diff 393e3d2 -- docs/testing.md` empty).
- Commit split in `snapshot.txt`: group "spec" = `tasks.md`, `spec.md`, `design.md`; group "code and evidence" = the four code/test files plus the evidence. The spec group contains no code and the code group no spec file; the order spec → code is preserved if committed as listed.
- `openspec validate add-realtime-chat-room --strict` and `validate --all --strict`: exit 0 (my run).

## Correctness

- Trigger only on an accepted ack: in `send` (`use-chat-socket.ts:109-125`) "not connected" returns at line 111, the timeout/emit rejection at line 116, rejection and malformed acks (`readSendAck` returns `ok: false`) at line 120; `setOwnAcceptedId(ack.message.id)` is at line 123, reachable only after `ok: true`. Confirmed by reading.
- Unique value per send: the value is the server id of the accepted message; server ids are unique and increasing, so every accepted send produces a new value and `message-list.tsx:62-66` (compare with `scrolledForOwnIdRef`) fires once per send.
- Broadcast before ack: the broadcast merge renders the message without scrolling (scrolled up); the ack then merges again (`mergeMessages` always returns a new array) and sets the new id in the same batch; the effect depends on `[messages, ownAcceptedId]`, so the id change alone is enough. Ack before broadcast: the ack render scrolls; the later broadcast render finds `atBottomRef` true and stays at the bottom. Both orders are correct by reading.
- Other clients' messages: they do not change `ownAcceptedId`, so the 5.4 rule applies unchanged; verified by the own-message test's second half and the unchanged scrolled-up test.
- 5.4 behavior: an empty list (`!list`) still resets `atBottomRef` and returns before the id comparison; the first message after an empty room therefore still starts at the bottom, and a pending own id is picked up on the first render with a list. No regression seen; all 5.4 tests pass in both modes.

## Tests and evidence honesty

- Red run genuine: the "RED RUN (prod)" entry shows `git diff --stat -- src` empty, a fresh build, the own-message test failing at `visibleWithoutScrolling` (line 363 then), 7 passed, and `[exit 1]`.
- Mutations 1–5: each entry shows the diff, the failing test(s) named in `implementation.md`, `mutated run exit: 1`, and `RESTORED: hashes match`. The `[exit 0]` of those entries comes from the trailing `procs.sh`, as disclosed; the real failing result is visible in every entry.
- Rejected-send test added after the implementation and validated only by mutation 5: acceptable. It is a guard for the new spec sentence, not a red-first criterion of the task (before 5.5 nothing scrolled on a failed send either, so it could not have been red). My mutation A (set the id when the send starts) shows it is the only test that detects a trigger placed before the ack, so it is useful.
- F1 test (no hint before the history): sound. My probe C (wait 2 s while gated, then assert Send still disabled, no hint, no "Connected") passes, so the route really holds the Socket.IO polling requests and the assertions are not satisfied only by timing. It holds the handshake too, so it cannot tell "history arrived" from "connected"; this is a minor limitation, not a defect.
- Whitespace-rule misread: the first FINAL entry keeps `[exit 1]`, the calibration (exit 3 for a trailing space, 1 for a clean new file) is in the same entry, and the next entry reruns with the corrected predicate. Kept and explained honestly.
- `checks.txt` hash appended to `snapshot.txt` after the snapshot's own whitespace check: disclosed in `snapshot.txt` and consistent with the value I computed. My own whitespace check of `snapshot.txt` in its final form is clean (below).

## Findings

| # | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|
| F1 | Low (test gap) | `e2e/history.spec.ts:380` | The design reason for the ack trigger (nicknames are not unique) is not tested: every other client in the spec is "Bob". My mutation B (trigger on the broadcast of any message whose nickname equals the nickname this page last sent with, ack path removed) left all 9 tests green. The implementation itself is correct (ack only). My probe D shows that changing only line 380 to open B as `'Alice'` makes the own-message test fail under mutation B (`scrollTop` 2809 → 5677). | Not blocking. Optional one-word follow-up: open the other client with the same nickname in the own-message test (or in the rejected-send test), so a nickname-based trigger cannot pass. |
| F2 | Info (spec wording) | `openspec/changes/add-realtime-chat-room/specs/chat-room/spec.md:156` | "When the server has accepted a message the person sent" is from the server's point of view. If the ack arrives after the 5 s timeout, the server has accepted the message and the sender receives its broadcast (`chat.controller.ts:87`), but the client reports "not sent" and does not scroll. The behavior is consistent with the client's own view and with the second half of the sentence; the maker lists the late-ack case as a limitation. | No change needed now. If the spec is edited again, "when the person's send is confirmed by the server" would match the implementation exactly. |
| F3 | Info (maker limitation, assessed) | `src/app/_chat/message-list.tsx:62-66` | Other clients' messages that arrive between the send and its ack are placed after the own message, and the scroll goes to the bottom. The own message leaves the view only if those later messages together are taller than the list (`min(50vh, 32rem)`) and arrive within the ack round trip (milliseconds locally). Negligible in practice. | No change. |
| F4 | Info (maker limitation) | `src/app/_chat/use-chat-socket.ts:111`, `:116` | The "not connected" and timeout paths are covered only by reading; they return before line 123. I confirm this by reading. The not-connected path is also unreachable from the UI (Send is disabled). | No change. |

No blocking defects. The 5.4 items F2–F4 stay as documented; F5 is task 6.1 by user decision (c); F6 fixed; F1 now covered.

## Independently executed checks

Recorded with my own recorder (visible `[SPACE]`/`[TAB]`/`[CR]` markers, measured exit codes) in the session scratchpad (`checker55/`), outside the repository, 2026-09-30.

| Check | Result |
|---|---|
| `sha256sum -c` of the snapshot hash lines; `checks.txt` hash | all `OK` (before and after the mutations); `e3747462…` matches |
| `openspec validate add-realtime-chat-room --strict`; `validate --all --strict` | exit 0; exit 0 |
| `E2E_SERVER_MODE=dev npx playwright test e2e/history.spec.ts --repeat-each=5` | 45 passed, 0 flaky, exit 0 |
| `npx next build` then `npx playwright test e2e/history.spec.ts --repeat-each=3` (prod) | 27 passed, 0 flaky, exit 0 |
| Mutation A (`use-chat-socket.ts`): `setOwnAcceptedId` called when the send starts, before the ack resolves; the success-path call removed | rejected-send test failed (`scrollTop` 2779 → 5559; 1 failed, 8 passed), mutated run exit 1; the own-message test passed under this mutation; restored, hashes match |
| Mutation B (`use-chat-socket.ts`): trigger on the `message:new` broadcast of a message with the nickname this page last sent with; ack path removed | all 9 passed, mutated run exit 0 (survived, see F1); restored, hashes match |
| Probe C (`e2e/history.spec.ts`, F1 test only): 2 s wait while gated, then Send disabled, no hint, no "Connected" | 1 passed (the gate holds); restored, hashes match |
| Probe D: mutation B plus the own-message test's other client named `'Alice'` | own-message test failed (`scrollTop` 2809 → 5677), mutated run exit 1; both files restored, hashes match (the outer `mutated run exit: 0` is the exit of the inner restore script) |
| `npm run lint`, `npm run typecheck` | exit 0, exit 0 |
| `npm run test:unit` | 10 files, 465 tests passed, exit 0 |
| `npm run test:e2e` | 52 passed, exit 0 |
| `npm run test:e2e:dev` | 52 passed, exit 0 |
| `npm run check` | exit 0 (465 unit, 52 E2E) |
| `npm run check:loop` | exit 0 (465 unit, 52 E2E dev) |
| Processes after every run (node / headless Chromium matching `server.ts`, `next`, `playwright`, `vitest`, `tsx`; my own shells excluded) | no matching processes; port 3000: no listener |
| `git diff --check` | exit 0 |
| `git diff --no-index --check /dev/null <file>` for each untracked file (`checks.txt`, `implementation.md`, `snapshot.txt`, this `review.md`) | exit 1 each (clean; a whitespace error gives 3) |
| `git status --short` | the seven modified files of the snapshot and `?? docs/evidence/add-realtime-chat-room-5-5/`; nothing staged |

## Proportionality

The change is small (one state value, one ref comparison, one prop) and follows the existing scroll rule. The three added tests plus the F1 test and five mutations are proportionate for a behavior change that a user asked for explicitly. The F1 test (from the 5.4 review) and the F6 cleanup are small additions in a file the task already owned and are disclosed.

## Limitations

- Only Chromium (the project's configured browser) at the specs' viewports; no manual visual check or screenshot.
- The late-ack case (F2) and the timeout path were assessed by reading, not by a test.
- My mutations were applied to the working-tree files with hash-verified restores; no commit or stash was used.

## Verdict

**accepted** — the snapshot meets task 5.5 and the spec change; F1 is a recommended, non-blocking one-word test strengthening; F2–F4 are informational.

## Round 2

- Checker: the same Claude Code general-purpose subagent (checker), separate from coordinator and maker; no repairs, staging, commits, or checkbox changes.
- Date: 2026-09-30; Node v24.21.0; base `393e3d2` (`git log --oneline -1` unchanged); nothing staged.
- Reviewed snapshot: `snapshot.txt` revision 2. `sha256sum -c` of all hash lines: `OK` (including `review.md` `5ece2e00…`, which is the round-1 content of this file; appending this section changes its hash, as expected for an evidence report). `checks.txt` hash computed: `fdc8bc562d2512ec30bdf734254f0862e083fbc98d9cc409f93b9bd3fdfc6c1e`, equal to the value in `snapshot.txt`.
- User decision relayed by the coordinator (2026-09-30): "так, виправляй і потім коміть" ("yes, fix and then commit"), in reply to the coordinator's recommendation to fix F1 now.

### Resolution of round-1 findings

| # | Resolution |
|---|---|
| F1 | Resolved. `e2e/history.spec.ts:382`: in the own-message test the other client joins as `'Alice'`, with a comment explaining why; the second half's text is `'from the other Alice after the own message'`, and a new assertion at `:403` checks that this message is last with nickname `Alice`. My mutation B, rerun against revision 2 on the full history spec, now fails that test at `:400` (`scrollTop` 2809 → 5677; 1 failed, 8 passed; mutated run exit 1). `use-chat-socket.ts` restored, hashes match (`7895d4a4…`). |
| F2–F4 | Informational; unchanged, no action required. |

### Round 2 verification

- Only `e2e/history.spec.ts` changed among the deliverables: the hashes of `tasks.md`, `spec.md`, `design.md`, `use-chat-socket.ts`, `message-list.tsx`, and `chat-room.tsx` equal the round-1 values recorded above; `history.spec.ts` changed from `9774ac1f…` to `bb7822de…`.
- Bob coverage elsewhere intact: the other client is still `'Bob'` at `e2e/history.spec.ts:311` (at-bottom test), `:345` (other-client scrolled-up test), `:499` (empty-room test), and `:514` (restart test).
- Maker evidence: the round-2 entries in `checks.txt` match `implementation.md` (mutation B entry shows the diff, the failure at `:400`, `mutated run exit: 1`, and a hash-verified restore; the other round-2 entries end with `[exit 0]`). The maker discloses that the round-2 divider in `checks.txt` was written by hand and that `check:loop` was not rerun as a whole; I ran it below.

| Check (my recorder, scratchpad `checker55/`) | Result |
|---|---|
| `sha256sum -c` of snapshot revision 2; `checks.txt` hash | all `OK`; `fdc8bc56…` matches |
| Mutation B (full history spec, dev) | own-message test failed, mutated run exit 1; restored, hashes match |
| `E2E_SERVER_MODE=dev npx playwright test e2e/history.spec.ts --repeat-each=3` | 27 passed, 0 flaky, exit 0 |
| `npx next build` then `npx playwright test e2e/history.spec.ts --repeat-each=3` (prod) | 27 passed, 0 flaky, exit 0 |
| `npm run check` | exit 0 (465 unit, 52 E2E) |
| `npm run check:loop` | exit 0 (465 unit, 52 E2E dev) |
| Processes after every run | no matching processes; port 3000: no listener |
| `git diff --check`; `git diff --no-index --check /dev/null <file>` per untracked file (incl. this `review.md` after the append) | exit 0; exit 1 each (clean) |
| `git status --short` | the seven modified snapshot files and `?? docs/evidence/add-realtime-chat-room-5-5/`; nothing staged |

No new findings.

### Round 2 verdict

**accepted** — revision 2 resolves F1; F2–F4 remain informational.
