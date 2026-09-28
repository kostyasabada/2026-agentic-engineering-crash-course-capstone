# Task add-realtime-chat-room-3-2 — implementation

- Task: 3.2 in `openspec/changes/add-realtime-chat-room/tasks.md` (chat service with red-first unit tests).
- Maker: Claude Code general-purpose subagent (maker), fresh scoped handoff from the coordinator.
- Base commit: `611c1d2`; uncommitted working tree, nothing staged. The task checkbox is not ticked (checker acceptance pending).
- Snapshot: `snapshot.txt` (SHA-256 of the deliverables; this report and `checks.txt` are listed separately there).

## Runtime

Node v24.21.0 via `PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`, npm 11.19.0 (first entry of `checks.txt`).

## Changes

- `src/server/chat/chat.service.ts` (new): `createChatService(repository, { now })`.
- `src/server/chat/chat.service.test.ts` (new): 31 Vitest cases with an in-memory `FakeMessageRepository` defined in the file and an injected clock; no Socket.IO, no SQLite.
- No other source, spec, design, or task file changed. No new dependencies.

## API

```ts
export const HISTORY_LIMIT = 100
export type ChatHistory = { mode: 'replace' | 'append'; messages: ChatMessage[] }
export type ChatService = {
  postMessage(input: SendMessageInput): ChatMessage
  historyFor(lastSeenId?: number): ChatHistory
}
export type ChatServiceOptions = { now?: () => Date }
export function createChatService(repository: MessageRepository, options?: ChatServiceOptions): ChatService
```

- `postMessage` calls `repository.insert({ nickname, text, createdAt: now().toISOString() })` and returns the repository's result.
- `historyFor(lastSeenId)`:
  1. `undefined`, or not a non-negative safe integer → `replace` with `latest(100)`.
  2. `since(lastSeenId, 101)`; more than 100 rows → `replace` with `latest(100)`; 1–100 rows → `append` with them.
  3. No rows → `latest(1)`; if `lastSeenId` is greater than the highest id (0 for an empty store) → `replace` with `latest(100)`, else `append` with `[]`.

  `since` runs first, so the common "some messages missed" case needs one query; `latest(1)` (named in design D4 for rule (b)) runs only when nothing newer exists.

## Design choices

- **Validated input (D2, D4).** The service receives input that the controller (task 4.1) has already parsed with `sendMessageSchema`; it does not validate again, because the controller must map schema failures to the ack codes `invalid_nickname`/`invalid_text`. The service destructures only `nickname` and `text`, so extra fields of a mistyped caller are not stored (tested).
- **Defensive `lastSeenId` check.** Rule (a) belongs to the controller; the service repeats `Number.isSafeInteger(lastSeenId) && lastSeenId >= 0` and otherwise treats the value as absent. Reason: `NaN` bound through better-sqlite3 would behave unlike a number, and a negative or fractional value would reach the repository. Tested for negative, fractional, `NaN`, `Infinity`, unsafe integer, `null`, and a string (the last two cast, as they are outside the TypeScript type).
- **Repository limits.** The service passes only `100`, `101`, and `1`. The fake throws on any other limit (and on an invalid `lastSeenId` given to `since`), and a test checks that the guard fires.
- **Errors propagate.** The service does not catch repository errors; the controller (4.1) maps them to `server_error`. Tested for `insert`, `latest`, and `since`.
- **Clock.** Default `() => new Date()`; read once per `postMessage` call, not at construction.
- **Layering.** Only `import type` from `../../lib/chat/schema` and `./message.repository`; no `socket.io`, `better-sqlite3`, db, controller, or app imports.
- The repository interface is unchanged.

## Criteria → tests (`src/server/chat/chat.service.test.ts`)

| Criterion | Test(s) |
|---|---|
| `postMessage` stores validated input with `createdAt` from the injected clock and returns the stored message | "stores the input with createdAt from the injected clock and returns the stored message"; "returns what the repository stored (repository-assigned id)"; "reads the clock once per message at the time of posting" |
| `createdAt` is ISO 8601 UTC with milliseconds, not a DB default | "formats createdAt as ISO 8601 UTC with milliseconds regardless of the clock offset" (`+02:00` clock → `…Z`, regex); the insert call carries `createdAt` explicitly (first test); "uses the current time when no clock is injected" |
| Client-supplied fields are not stored | "stores only nickname, text, and the server createdAt (no extra input fields)" |
| `historyFor()` → `replace`, latest 100, oldest first | "returns replace with the latest 100, oldest first (messages 6 to 105 of 105)"; "returns replace with all 100 when exactly 100 are stored"; "uses a history limit of 100" |
| `historyFor()` → all when fewer; empty store | "returns replace with all messages, oldest first, when fewer than 100 are stored"; "returns replace with an empty list for an empty store" |
| `append` with only newer messages when at most 100 missed | "returns append with only the newer messages when fewer than 100 were missed"; "returns append with exactly 100 messages when exactly 100 were missed" (boundary) |
| `append` with none when nothing missed | "returns append with none when nothing was missed"; "returns append with none for lastSeenId 0 and an empty store" |
| More than 100 missed → `replace` latest 100 | "returns replace with the latest 100 when 101 were missed" (boundary); "returns replace with exactly messages 51 to 150 when lastSeenId is 10 and 11 to 150 were missed" |
| `lastSeenId` greater than the highest id → `replace` latest 100 | "returns replace with the latest 100 when lastSeenId is greater than the highest stored id" (120 vs 1–30); "returns replace with the latest 100 (not all) when lastSeenId is greater than the highest of 150"; "returns replace with an empty list when lastSeenId is positive and the store is empty" |
| `lastSeenId` 0 is valid | "treats lastSeenId 0 as valid: append with everything when at most 100 are stored" |
| Defensive invalid `lastSeenId` | seven `it.each` cases "defensively treats a … lastSeenId as absent" |
| Repository errors propagate | two "lets repository errors propagate" tests |
| Fake rejects misuse of limits | "rejects limits the service must never pass" |

## Checks (all in `checks.txt`, in execution order)

1. Runtime: `node --version` → v24.21.0.
2. Red run, no module: `npm run test:unit | tail` recorded exit 0 because the pipe hid the exit code (kept); rerun with `set -o pipefail` → exit 1, `Cannot find module './chat.service'`, other 191 tests pass.
3. Red run with a throwing stub (`createChatService` throws `not implemented`, content recorded): 30 failed, 1 passed (the fake-guard test), exit 1.
4. Green: service tests 31/31, exit 0.
5. Mutations (helper `mutate.sh`, body below; backup copy, SHA-256 before/after, all restores verified at `a9c03f36…`):
   - `missed.length > HISTORY_LIMIT` → `>=` (100 vs 101 boundary): killed (1 test: exactly 100 missed).
   - `now().toISOString()` → `new Date().toISOString()` (clock ignored): killed (4 tests).
   - greater-than-highest check replaced by `lastSeenId < 0`: killed (3 tests).
   - probe limit `101` → `-1`: killed (10 tests, via the fake guard).
   - The first two were rerun after the test-file typecheck fix (step 7): both killed again, restore verified.
6. Boundary lint probes with `eslint --stdin --stdin-filename src/server/chat/chat.service.ts` (probe line prepended to the real file): `socket.io` (value and `import type`), `better-sqlite3` (value and `import type`), `../db/sqlite`, `./chat.controller`, `../app`, `../../app/page` → each an error, exit 1. The service file as-is (with `import type` of `./message.repository`) → exit 0. A `better-sqlite3` import in the `chat.service.test.ts` path → no error, exit 0.
7. `npm run typecheck` failed first (exit 2, two `noUncheckedIndexedAccess` errors in the test file); fixed in the test only (clock queue with `??`, optional chaining), rerun exit 0.
8. Final: `npm run test:unit` 222/222 exit 0; `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run check` exit 0 (lint, typecheck, 222 unit tests, `next build`, 2 Playwright tests); `openspec validate add-realtime-chat-room --strict` exit 0.
9. Process check (`procs.sh`, narrow patterns limited to processes whose working directory is in the submission) before and after `npm run check`: 0 matching processes.
10. Whitespace: calibration (clean file → exit 1, trailing space → exit 3), then `git diff --check` and `git diff --no-index --check /dev/null <file>` for each untracked file plus a single-final-newline check. The first final run failed (exit 1) only on `checks.txt` (trailing spaces inside recorded output); they were stripped as a documented edit (note in the `checks.txt` header), and the rerun passed for all four files (exit 0). The check was run once more after this report was last edited.

## Limitations and notes

- The rule (a) check in the controller and the full Socket.IO flow are task 4.1; the service tests use a fake only. The service's behavior against `SqliteMessageRepository` is not tested here (task 4.1 controller tests use the real repository).
- An invalid `Date` from the clock makes `toISOString()` throw a `RangeError`, which propagates like a repository error; not tested.
- The defensive `lastSeenId` check duplicates rule (a) on purpose (see Design choices); it adds no behavior beyond D2.
- `vitest.config.ts` prints a Vite `configLoader` warning during `npm run check`; it predates this task.
