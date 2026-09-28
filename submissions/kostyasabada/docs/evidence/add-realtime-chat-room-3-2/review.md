# Task add-realtime-chat-room-3-2 — independent review

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker.
- Round: 1.
- Date: 2026-09-28.
- Runtime: Node v24.21.0, npm 11.19.0 (`PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`).
- Reviewed snapshot: `snapshot.txt` revision 1, base commit `611c1d2`, uncommitted working tree:
  - `src/server/chat/chat.service.ts` `a9c03f36e6f99e33485f15503659da5e61e0739dd875a2a1b94d5d2946e29c99`
  - `src/server/chat/chat.service.test.ts` `e149698c9d008f42a87b9ef0a549d08b05f8ee5fc53abcf643cc570c8486fedd`
  - evidence: `implementation.md` `b436355d…`, `checks.txt` `855663ba…` (all four verified with `sha256sum -c`).
- Read: `AGENTS.md`, `docs/review-process.md`, task 3.2 in `openspec/changes/add-realtime-chat-room/tasks.md`, `design.md` D2 (history/catch-up rule, Socket.IO contract), D3, D4 (layers, rules (a)–(e), boundary table), `specs/chat-room/spec.md` requirements "Recent history for a joining client" and "Connection status and reconnection", `src/lib/chat/schema.ts`, `src/server/chat/message.repository.ts`, both deliverables in full, and the maker evidence.

## Criteria coverage

Every case named in task 3.2 has a meaningful test (`chat.service.test.ts`):

- `postMessage`: stored input and returned stored message (lines 88–105), `createdAt` from the injected clock, ISO 8601 UTC with milliseconds from a `+02:00` clock (107–117), clock read once per call and not at construction (119–132), default clock (134–140), extra input fields not stored (142–150), repository error propagates (152–161).
- `historyFor()`: empty store, fewer than 100, exactly 100, and 105 → 6–105 with a single `latest(100)` call (164–195).
- `historyFor(lastSeenId)`: append of newer messages (198), boundaries 100 missed → `append` (209) and 101 missed → `replace` 12–111 (216), 11–150 missed → `replace` exactly 51–150 (223), nothing missed → `append []` (230), `lastSeenId` 120 with 1–30 stored → `replace` 1–30 (247), greater than the highest of 150 → `replace` 51–150 (254), positive `lastSeenId` on an empty store → `replace []` (261), repository errors (282).
- The fake throws on any limit other than 100/1 (`latest`) and 101 (`since`) and on an invalid `lastSeenId` passed to `since` (lines 9–43), and a test proves the guard fires (78–84); so only the limits 100, 101, and 1 can reach the repository without failing a test.

## Correctness against D2/D4 and the spec

- `lastSeenId = 0`: D2 treats as absent only a value that "is not a non-negative integer"; 0 is a non-negative integer, so it is valid. With 30 stored the rule gives `since(0, 101)` = 1–30 → `append` 1–30; on an empty store nothing is newer and 0 is not greater than the highest id (0), so `append []`. Both follow D2 literally; the spec does not define 0 separately, and the client merges by id (D2), so the result is correct for a client that holds nothing. Consistent.
- The `latest(1)` call runs only when `since` returned nothing (`chat.service.ts:71`); D4 names `latest(1)` for rule (b). One extra query only in the "up to date or reset" case; minimal and correct.
- Clock read once per `postMessage` (`chat.service.ts:54`), `toISOString()` gives UTC with milliseconds (rule (e)); only `nickname` and `text` are destructured.
- Repository errors are not caught, so the controller of task 4.1 can map them to `server_error` (rule (c)).
- No re-validation of `SendMessageInput`: consistent with D4 ("input already validated and trimmed by the schema"), since the controller must map schema failures to the ack codes.

## Findings

1. Low (evidence) — `docs/evidence/add-realtime-chat-room-3-2/checks.txt:10`: the `[DOCUMENTED EDIT]` stripped trailing whitespace from the whole file after recording. It is disclosed in the header right below the claim "never by editing this file" (lines 8–9), names the `sed` command and the affected sources, and changes only whitespace; I found no sign that any exit code or result was altered. Two side effects: the calibration output `+trailing ` no longer shows the trailing space it was meant to demonstrate, and blank `diff -u` context lines lost their leading space. Earlier tasks (1.5, 1.6, 2.1) used visible `[SPACE]` markers, which keep the recorded content reconstructable; this task is inconsistent with that convention. Not blocking; a note for later tasks to prefer visible markers (or to record commands without trailing spaces) is enough. No change required for acceptance.
2. Info — `src/server/chat/chat.service.ts:61`: the defensive repeat of rule (a) duplicates the controller's check. It is small, documented in a comment and in `implementation.md`, tested (lines 266–280), adds no behavior beyond D2, and protects the repository from `NaN`/negative/fractional values. Acceptable; not flagged as a defect.
3. Info — lint boundary scope: a value import `import { SqliteMessageRepository } from './message.repository'` in the service is not reported by ESLint (my probe, exit 0). The D4 boundary table does not forbid it; D4 requires `import type` in prose, and the service complies (`chat.service.ts:4`). Outside the scope of task 3.2; mentioned for awareness only.
4. Info — the service is tested only against the fake; behavior over `SqliteMessageRepository` is covered by task 4.1, as `implementation.md` states. An invalid `Date` from the clock throws `RangeError` (untested, documented limitation).

## Evidence honesty

- The first red run's `exit 0` (exit code of `tail`, not vitest) is kept and followed by a `pipefail` rerun with exit 1 and `Cannot find module './chat.service'`.
- The throwing-stub red run is recorded with the stub's content: 30 failed, 1 passed (the fake-guard test), exit 1.
- The typecheck failure (exit 2, two `noUncheckedIndexedAccess` errors in the test file) and its test-only fix are recorded, and mutations 1–2 were rerun against the final test file hash `e149698c…`, which matches the snapshot.
- The helper scripts' full bodies are included; mutation restores are hash-verified at `a9c03f36…`.

## Independent checks (run by the checker)

| Check | Result |
|---|---|
| `sha256sum -c` of the four snapshot entries (paths from the repository root) | all OK |
| `git log --oneline -1` | `611c1d2 feat: reject lone surrogates in message schema (task 2.2)` |
| `git status --short` | only `?? docs/evidence/add-realtime-chat-room-3-2/`, `?? src/server/chat/chat.service.test.ts`, `?? src/server/chat/chat.service.ts`; nothing staged |
| `npx vitest run src/server/chat/chat.service.test.ts` (twice) | 31 passed, exit 0 both times |
| `npm run test:unit` | 5 files, 222 tests passed, exit 0 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run check` | exit 0 (222 unit tests, `next build`, 2 Playwright tests), about 24 s wall time |
| `openspec validate add-realtime-chat-room --strict`; `openspec validate --all --strict` | valid, exit 0; 1 passed, 0 failed |
| Leftover processes (`server.ts`, `next-server`, `next build`, `next dev`, `playwright`, `vitest`, limited to the submission working directory, own shell excluded) | 0 |
| Whitespace: `git diff --check`; `git diff --no-index --check /dev/null <file>` per untracked file including this `review.md` | `git diff --check` exit 0; each of the six untracked files (both deliverables, `checks.txt`, `implementation.md`, `snapshot.txt`, this file) exit 1 (clean) with a single final newline |

Checker mutations of `chat.service.ts` (backup copy, SHA-256 before and after, all four restores verified at `a9c03f36…`):

- `lastSeenId > highestId` → `>=`: killed (2 tests: nothing missed; `lastSeenId` 0 on an empty store).
- `append` branch for 1–100 missed removed: killed (3 tests).
- `insert({ nickname, text, … })` → `insert({ ...arguments[0], … })` (extra fields forwarded): killed (1 test).
- `|| lastSeenId < 0` removed from the defensive check: killed (1 test, via the fake's `lastSeenId` guard).

Checker boundary probes (`npx eslint --stdin --stdin-filename src/server/chat/chat.service.ts`, probe line prepended to the real file): `import { Server } from 'socket.io'` → error, exit 1; `import { openDatabase } from './../db/sqlite'` → error, exit 1; `export * from './chat.controller'` → error, exit 1; value import of `SqliteMessageRepository` from `./message.repository` → exit 0 (finding 3). The maker's probes for `better-sqlite3`, `../db/sqlite`, `./chat.controller`, and `../app` are recorded with exit 1 in `checks.txt`.

## Limitations

- Mutation testing was sampled (maker 4 plus checker 4 mutants), not exhaustive.
- The whitespace edit in `checks.txt` cannot be reversed exactly from the file itself; I relied on its disclosure and on rerunning every material check myself.
- No Socket.IO or SQLite integration was exercised for the service; that is task 4.1.

## Verdict

accepted
