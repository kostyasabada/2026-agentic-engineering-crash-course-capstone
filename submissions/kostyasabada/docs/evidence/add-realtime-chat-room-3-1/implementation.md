# Task add-realtime-chat-room-3-1 — implementation

- Task: 3.1 in `openspec/changes/add-realtime-chat-room/tasks.md` (repository layer per design D3–D4).
- Maker: Claude Code general-purpose subagent (maker), fresh subagent with a scoped handoff.
- Base commit: `b0714d9`; nothing staged or committed; the task checkbox is not ticked.
- Snapshot: `snapshot.txt` in this directory (SHA-256 of all changed deliverables).
- Command output: `checks.txt` in this directory (every attempt, in order, with measured exit codes; helper body at the end).

## Runtime

The handoff asked for `PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH`, but that temporary runtime no longer exists on this machine (`ls` fails, recorded in `checks.txt`, also outside the sandbox). All checks therefore ran with Node **v24.13.1** from nvm (`$HOME/.nvm/versions/node/v24.13.1/bin`, npm 11.8.0), which satisfies `engines` `^24.0.0` but differs from `.nvmrc` (24.21.0). The first `checks.txt` entry ran with the host Node v22.22.1 (it only printed versions and git state). better-sqlite3 13.0.3 loaded on 24.13.1 (SQLite 3.53.4).

## Changes

| File | Change |
|---|---|
| `src/server/db/sqlite.ts` | New. `openDatabase(path)`: creates the parent directory (`mkdirSync(..., { recursive: true })`), opens the file with better-sqlite3, sets `journal_mode = WAL` (default `synchronous` kept), creates `messages(id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)` with `CREATE TABLE IF NOT EXISTS`; closes the handle and rethrows if setup fails. `closeDatabase(db)`. |
| `src/server/chat/message.repository.ts` | New. `NewMessage = Omit<ChatMessage, 'id'>`, the synchronous `MessageRepository` interface (`insert`, `latest`, `since`), and `SqliteMessageRepository`, which receives the open connection in its constructor and uses three prepared statements (no string-built SQL from values; only the constant column list is interpolated). `insert` uses `INSERT ... RETURNING`, so it returns the row as stored. `ChatMessage` is imported with `import type` from `src/lib/chat/schema.ts` (not duplicated). |
| `src/server/chat/message.repository.test.ts` | New. 13 tests against temporary files under `os.tmpdir()` (`mkdtempSync`), all handles closed and the directory removed in `afterEach`. |
| `docs/evidence/add-realtime-chat-room-3-1/*` | This report, `checks.txt`, `snapshot.txt`. |

## Criteria → tests (`src/server/chat/message.repository.test.ts`)

| Criterion (task 3.1) | Test |
|---|---|
| ids increase | `SqliteMessageRepository > assigns increasing ids and returns the stored message` |
| ids never reused (`AUTOINCREMENT`; insert, delete newest, insert → greater id) | `... > never reuses the id of a deleted newest row (AUTOINCREMENT)` (the delete is a test-only raw prepared statement through the db handle) |
| given `createdAt` stored and returned unchanged | `... > stores and returns the given createdAt unchanged` (also every `toEqual` on full messages) |
| `latest(100)` after 105 inserts → messages 6–105 oldest first | `... > latest(100) after 105 inserts returns messages 6-105 oldest first` |
| fewer than 100 → all | `... > latest(100) returns all messages oldest first when there are fewer than 100` (0 and 3 rows) |
| `since(lastSeenId, 101)` → only newer rows oldest first | `... > since(lastSeenId, 101) returns only newer rows oldest first`; additionally `... stops at the limit, taking the oldest newer rows` (150 rows, `since(10, 101)` → 11–111) |
| data survives closing and reopening | `openDatabase > keeps data after closing and reopening the file` |
| opening the same file twice is idempotent | `openDatabase > creates the schema idempotently when the same file is opened twice` (second handle while the first is open, then a third after both closed; one `messages` table, data intact) |
| missing parent directory is created | `openDatabase > creates a missing parent directory` (two missing levels) |
| WAL (design D3, not in the task list) | `openDatabase > uses WAL journal mode` |
| checker note: control characters | `SqliteMessageRepository > keeps control characters in text unchanged` (U+0000, U+0007, U+001F, U+007F, CR LF round-trip) |
| checker note: lone surrogates | `SqliteMessageRepository > records the driver behavior for lone surrogates: replaced by U+FFFD` |

## Lone-surrogate finding (flagged, no spec rule invented)

A direct driver probe (recorded in `checks.txt`) shows that better-sqlite3 13.0.3 does **not** round-trip lone surrogates: `"a\uD800b"` and `"a\uDC00b"` are stored as UTF-8 `61 EFBFBD 62`, i.e. the lone surrogate becomes U+FFFD; valid surrogate pairs (emoji) and control characters, including U+0000, round-trip unchanged. The shared schema accepts lone surrogates, so a message containing one is persisted and later returned with U+FFFD. Because `insert` returns the row via `RETURNING`, the message returned (and later broadcast by the service/controller) matches what history returns, so live and history views agree. The test records this actual behavior. Whether to reject or normalize lone surrogates is a spec/user decision for the coordinator; nothing was changed in the spec. (Replacement does not change the UTF-16 length: one lone surrogate unit becomes one U+FFFD unit.)

## Checks (all in `checks.txt`)

- Red run before implementation: `npm run test:unit` exit **1** — `Cannot find module '../db/sqlite'`, 1 failed suite, 160 other tests passed. (A first attempt piped through `tail` reported exit 0 from the pipe; it is kept and was rerun with the real exit code.)
- After implementation: repository tests 13/13 passed (exit 0); `npm run lint` 0; `npm run typecheck` 0.
- Boundary rules: `--print-config` for `message.repository.ts` shows paths `socket.io` and patterns app/service/controller; stdin probes importing `./chat.service`, `./chat.controller`, `socket.io`, `../app` into that path each fail lint (exit 1). `src/server/db/sqlite.ts` falls under `src/server/**` (no `../app`).
- Mutation 1 (drop `AUTOINCREMENT`): 1 test fails (`expected 2 to be greater than 2`); restore verified by SHA-256.
- Mutation 2 (`ORDER BY id DESC` in `latest` and `since`): 6 tests fail; restore verified by SHA-256.
- `npm run check` exit **0** (lint, typecheck, 173 unit tests, `next build`, 2 Playwright tests).
- Final: no `data/` directory and no SQLite/WAL/SHM files in `git status --short --ignored`; no leftover temp dirs; no leftover next/playwright/tsx/vitest processes; nothing staged; whitespace checks — see the last entries of `checks.txt`.
- One documented edit in `checks.txt`: the first leftover-process check used the pattern `chrom`, which matched the user's own desktop processes (Google Chrome, crashpad handlers, the Claude Code session); those 73 lines were replaced by a marked note, and the check was rerun with a narrower pattern.

## Limitations and notes

- Node 24.13.1 instead of the requested 24.21.0 (runtime missing, see above).
- `@types/better-sqlite3` 9.6.0 vs driver 13.0.3: no mismatch surfaced for the API used (`new Database(path)`, `pragma`, `exec`, `prepare<Params, Row>`, `get`, `all`, `run().changes`, `open`, `close`); typecheck passes. Newer driver APIs were not checked against the types.
- `latest`/`since` do not validate `limit`; SQLite treats a negative `LIMIT` as unlimited. The only caller (the service, task 3.2) passes constants 1, 100, 101.
- Lone surrogates are replaced by U+FFFD (flagged above).
