# Task add-realtime-chat-room-3-1 — review

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker.
- Round: 1
- Date: 2026-09-27
- Node used for independent checks: v24.13.1 (nvm, `$HOME/.nvm/versions/node/v24.13.1/bin`, npm 11.8.0). `.nvmrc` pins 24.21.0; the temporary runtime `/tmp/node-v24.21.0-linux-x64` no longer exists (same deviation as the maker, disclosed in `implementation.md`).
- Reviewed snapshot: `snapshot.txt` revision 1 (base commit `b0714d9`, uncommitted working tree): `src/server/db/sqlite.ts` `5e061268…`, `src/server/chat/message.repository.ts` `bc83ca96…`, `src/server/chat/message.repository.test.ts` `03d51abf…`, `implementation.md` `b9965c12…`, `checks.txt` `e7205f7b…`. `sha256sum -c` from the repository root: all 5 OK. This `review.md` is not part of the snapshot.
- Read: `AGENTS.md`, `docs/review-process.md`, task 3.1 in `openspec/changes/add-realtime-chat-room/tasks.md`, `design.md` D2–D4, `specs/chat-room/spec.md` (server-assigned ordering, recent history, history survives restart), `src/lib/chat/schema.ts`, the three deliverables in full, and the maker evidence (`implementation.md`, `checks.txt`, `snapshot.txt`).

## Criteria coverage

| Task 3.1 case | Test (`src/server/chat/message.repository.test.ts`) | Assessment |
|---|---|---|
| ids increase | line 43 | exact ids 1, 2 and full rows |
| ids never reused (delete newest, insert, greater id) | line 52 | raw test-only delete, asserts `changes === 1` and `next.id > deleted.id`; killed by dropping `AUTOINCREMENT` (maker mutation) |
| given `createdAt` stored and returned unchanged | line 65 (and every full-row `toEqual`) | killed by my mutation M-F |
| `latest(100)` after 105 → 6–105 oldest first | line 73 | both ends and every id; killed by M-A |
| fewer than 100 → all | line 83 (0 and 3 rows) | ok |
| `since(lastSeenId, 101)` only newer, oldest first | lines 90, 99 | includes the boundary `since(10)` on 10 rows, a `lastSeenId` above max, and the 150-row case returning 11–111 (limit applied to the oldest newer rows, as D2 needs to detect more than 100 missed); killed by M-B and M-G |
| survives close and reopen | line 128 | also checks the next id continues at 4 |
| opening the same file twice is idempotent | line 140 | concurrent second handle and a third after close; killed by M-E |
| missing parent directory created | line 157 | two missing levels; killed by M-C |
| WAL (design D3) | line 165 | killed by M-D |

## Correctness against design D2–D4

- Schema (`src/server/db/sqlite.ts:8-15`) matches D3 exactly: `id INTEGER PRIMARY KEY AUTOINCREMENT`, three `TEXT NOT NULL` columns, no `created_at` default, `CREATE TABLE IF NOT EXISTS`. WAL is set (`:27`), default `synchronous` kept. Parent directory creation at `:24`. Setup failures close the handle and rethrow (`:26-32`).
- Repository (`src/server/chat/message.repository.ts`): synchronous interface (`:11-18`); three prepared statements with `?` parameters only (`:37-45`), the only interpolation is the constant `COLUMNS`; `INSERT … RETURNING` (`:38`) so the returned message equals what later reads return (relevant to the lone-surrogate behavior below); `latest` uses newest-`limit` subquery re-ordered ascending (`:41`); `since` uses `id > ? ORDER BY id ASC LIMIT ?` (`:44`), i.e. the oldest newer rows, which is what the D2 rule "query up to 101 rows with `id > lastSeenId`; if 101, send `replace` with the latest 100" requires. SQLite 3.53.4 supports `RETURNING`.
- `ChatMessage` is imported with `import type` from `src/lib/chat/schema.ts` (`:2`), not duplicated; `NewMessage = Omit<ChatMessage, 'id'>`. The repository imports `better-sqlite3` only as types, so the service's `import type` of the interface will not load the driver.
- Layer boundaries: my own `eslint --stdin` probes against the project config for `message.repository.ts` report `./chat.service`, `./chat.controller`, `socket.io`, `../app`, `../../app/page` (each exit 1, one `no-restricted-imports` report) and allow `better-sqlite3`, `../../lib/chat/schema`, `../db/sqlite` (exit 0); the same `./chat.service` import in the `.test.ts` path is allowed (exit 0); `src/server/db/sqlite.ts` rejects `../app` and allows `better-sqlite3`.

## Findings

No blocking or change-requiring findings.

1. Lone surrogates become U+FFFD — severity: informational (policy decision for the user, not a defect of this task). Independently confirmed with a probe through `openDatabase` + `SqliteMessageRepository` (temporary directory in the checker scratchpad, removed): `"a\uD800b"` and `"a\uDC00b"` are stored as hex `61EFBFBD62` and read back as `"a�b"`; the value returned by `insert` equals the value later read; UTF-16 length is unchanged (3 → 3), so the length limits are not affected; a valid pair (`😀`) round-trips (hex `61F09F988062`). The test at `src/server/chat/message.repository.test.ts:114` records this driver behavior without inventing a spec rule. Whether to reject or normalize lone surrogates at the schema is for the user to decide.
2. Control characters round-trip — informational. Confirmed U+0000, U+0007, U+001F, U+007F, CR, LF stored as `610062071F7F0D0A` and read back identical (test at `:106`).
3. `limit` is not validated — severity: low, no action required for this task. Confirmed: `latest(-1)` and `since(0, -1)` return all 9 rows (SQLite treats a negative `LIMIT` as unlimited), `latest(0)` returns none, and a fractional limit (`latest(1.5)`) throws `datatype mismatch`; a fractional `lastSeenId` is accepted (`since(2.5, 2)` → ids 3, 4). The only planned caller (the service, task 3.2) passes constants, and the controller (task 4.1) must reject non-integer `lastSeenId` before it reaches the service. Documented as a limitation in `implementation.md`.
4. `openDatabase` error path is not covered by a test — severity: low (not a task 3.1 case). My probe shows a non-database file throws `file is not a database` from `openDatabase`, and a directory path throws `unable to open database file` from the constructor (no handle exists then). That the handle is closed in the first case follows from `src/server/db/sqlite.ts:29-31` but is not observable from outside and was not tested.
5. `@types/better-sqlite3` 9.6.0 vs driver 13.0.3 — informational. `npm run typecheck` passes for the used API (`Statement<Params, Row>` generics, `pragma`, `exec`, `get`, `all`, `run().changes`, `open`, `close`), and the runtime returns `id` as `number`. Newer driver APIs were not checked, as the maker notes.

## Evidence honesty (`checks.txt`)

- Red run genuine: `npm run test:unit` exit 1 with `Cannot find module '../db/sqlite'` before the implementation files existed (entry 08:27:47Z); the earlier piped attempt that reported exit 0 through `tail` is kept (08:27:22Z) and explained. The red is a module-resolution failure, not an assertion failure; the mutation runs (maker and mine) show the assertions discriminate.
- Maker mutations (drop `AUTOINCREMENT`; `ORDER BY id DESC`) record before/after SHA-256 equal to the snapshot hashes; the grep line numbers 41/44 match the file.
- The `[DOCUMENTED EDIT]` (line 216) replacing 73 lines of `pgrep` output is marked in place, announced in the file header (line 13) and in `implementation.md`, justified (the broad `chrom` pattern matched the user's desktop processes), and the check is rerun with a narrower pattern (line 228). Acceptable.
- Node deviation disclosed in the header and `implementation.md`; the first entry ran with host Node v22.22.1 and only printed versions and git state, as stated.
- The helper script body is included. The mutation backups are in the maker's scratchpad, outside the repository.

## Independent checks (Node v24.13.1)

| Check | Result |
|---|---|
| `sha256sum -c` of the snapshot entries (from the repository root) | 5/5 OK |
| `git log --oneline -1` | `b0714d9 feat: add shared chat message schema via first agent loop run (task 2.1)` |
| `npx vitest run src/server/chat/message.repository.test.ts` (run 1, run 2) | exit 0, 13/13 passed; exit 0, 13/13 passed |
| `npm run test:unit` | exit 0, 4 files, 173 tests passed |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run check` | exit 0, 31 s (lint, typecheck, 173 unit tests, `next build`, 2 Playwright tests) |
| `OPENSPEC_TELEMETRY=0 ./node_modules/.bin/openspec validate add-realtime-chat-room --strict` | exit 0, valid |
| Own mutations, each restored and verified by SHA-256 equal to the snapshot hash | M-A `latest` inner `ORDER BY id ASC` → 1 failed; M-B `since` `id >= ?` → 2 failed; M-C remove `mkdirSync` → 1 failed; M-D remove WAL pragma → 1 failed; M-E `CREATE TABLE` without `IF NOT EXISTS` → 2 failed; M-F store `new Date().toISOString()` instead of the given `createdAt` → 6 failed; M-G `since` without `LIMIT` → 1 failed |
| Boundary probes (`eslint --stdin` with the project config) | as listed under Correctness |
| Driver probes (lone surrogates, control characters, limits, error paths) | as listed under Findings 1–4 |
| Leftover processes (`pgrep -af "server\.ts\|next-server\|next build\|playwright\|vitest"`) | none |
| `git status --short --ignored` | only the three untracked task paths plus pre-existing ignored `.agent-loop/`, `.next/`, `next-env.d.ts`, `node_modules/`, `playwright-report/`, `test-results/`; no `data/`, no SQLite/WAL/SHM files |
| Temporary directories | no `chat-repo-test-*` in `/tmp`, no probe directories left in the checker scratchpad |
| `git diff --check` | exit 0 |
| `git diff --no-index --check /dev/null <file>` for each untracked file (6 files incl. `snapshot.txt`) | exit 1 each (= clean, no whitespace errors) |
| Staged files | 0 |

## Limitations

- Node 24.13.1 instead of the pinned 24.21.0 (runtime unavailable).
- The close-on-failure branch of `openDatabase` was reasoned from the code, not observed.
- Durability under a real server restart (spec "History survives a server restart") is only covered here at the file level (close and reopen); the server-level scenario belongs to tasks 4.2 and 5.4.
- `review.md` was written after the snapshot and is not hashed in it.

## Verdict

accepted — the reviewed snapshot (revision 1) meets every task 3.1 criterion; Finding 1 (lone-surrogate policy) is left to the user; Findings 2–5 need no change in this task.
