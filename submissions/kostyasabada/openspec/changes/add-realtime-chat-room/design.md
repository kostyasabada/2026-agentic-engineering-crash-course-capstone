# Design

## Context

See `proposal.md` (Why, scope, non-goals) and the three delta specs for required behavior. Current state observed on 2026-09-26:

- No application code exists. `package.json` pins development tools only: `@fission-ai/openspec` 1.13.2, `@playwright/test` 1.63.0, `eslint` 10.11.0, `typescript` 7.0.2, `vite` 8.3.1, `vitest` 5.0.2. There are no npm scripts except `openspec`. Chromium for Playwright was installed earlier (see `docs/testing.md`).
- `package.json` requires Node `^24.0.0`; `.nvmrc` pins 24.21.0. On the machine where this design was written, `node` on `PATH` is v22.22.1, nvm provides v24.13.1, and an isolated official Node 24.21.0 runtime extracted during setup exists at `/tmp/node-v24.21.0-linux-x64/` (temporary, machine-local; see `docs/evidence/setup-dev-dependencies/node24-runtime.txt`). All implementation checks must record the Node version used.
- `openspec/specs/` is empty; this is the first change.
- `claude` 2.1.198 is installed; `codex` is **not found on `PATH`** in this environment.
- The user accepted the recommended toolchain and product defaults and chose `claude -p` as the default fixer on 2026-09-26 (user's message in Ukrainian, translated: "yes, I accept all the recommendations, set claude -p"; recorded in `docs/evidence/README.md`). Items decided that day are labelled "Accepted (user decision, 2026-09-26)".

Every item below carries one label:

- **Accepted (user decision)** — decided by the user; recorded in `docs/architecture.md` and `docs/evidence/README.md`, with the date where the decision was made for this change.
- **Proposal Pn** — suggested by the coordinator or this maker. All proposals P1–P22 are **Accepted (user decision, 2026-09-26, task 0.1)** as written; the numbering is kept so that references remain valid. The user's reply is recorded in `docs/evidence/add-realtime-chat-room-0-1/decisions.md`.
- **Open question** — still unanswered; listed with a recommended default in Open Questions. Resolved questions are kept there with their resolution.

## Goals / Non-Goals

**Goals:**

- One Node process serves the Next.js UI and the Socket.IO endpoint on one port, backed by one SQLite file.
- All spec scenarios are covered by automated checks reachable from a single `npm run check`, so tasks can go red → green and a checker can rerun everything. A faster `npm run check:loop` (no production build) serves agent-loop iterations; `npm run check` stays the final gate.
- The chat logic (validation, storage, socket handlers) is testable without Next.js or a browser.
- The agent loop and the `SessionStart` hook are small, deterministic shell tools with documented failure modes.

**Non-Goals:**

- No production deployment pipeline, containers, or process manager.
- No abstraction layer for swapping transports or databases.
- No cross-browser E2E matrix (Chromium only) in this change.

## Decisions

### D1. Framework and routing

- **Accepted (user decision):** Next.js is the application framework.
- **Proposal P1:** Next.js **16.3.6** (npm `latest` on 2026-09-26) with the **App Router**, React and React DOM **19.3.0**. Alternative: Pages Router — rejected; App Router is the current default and supports Server Components.
- **Proposal P2:** TypeScript with `"strict": true` (plus `noUncheckedIndexedAccess`).
- **Accepted (user decision, 2026-09-26):** TypeScript **6.0.3** and ESLint **9.39.5** replace the currently pinned TypeScript 7.0.2 and ESLint 10.11.0 (resolves Q7). `package.json`/`package-lock.json` are changed by task 1.1, not by this planning change.
- **Proposal P3:** Server Components by default. `'use client'` only on the interactive chat subtree (nickname form, message list, composer, connection status) because it needs browser state, `localStorage`, and a socket. `page.tsx` and `layout.tsx` stay Server Components.
- **Proposal P4:** npm as package manager (already used; `package-lock.json` exists).

### D2. Real-time transport and custom server

- **Accepted (user decision, 2026-09-26; chosen over SSE):** Socket.IO with a custom Node server `server.ts` that serves both Next.js and Socket.IO. Chosen over SSE to keep future messenger features (presence, typing, acknowledgements) straightforward.
- **Consequences (accepted with the decision):** with a custom server, Next.js removes some automatic optimizations (the Next.js custom-server docs name Automatic Static Optimization), `output: 'standalone'` does not include `server.ts`, and serverless/Vercel-style hosting is not possible. Deployment requires a regular long-running Node process.
- **Proposal P5:** `socket.io` and `socket.io-client` **4.8.4**. `server.ts` creates one `http.Server`, passes normal requests to Next's request handler, and attaches Socket.IO at the default path `/socket.io/`. Socket.IO is created with `destroyUpgrade: false` so that WebSocket upgrades it does not own (Next.js dev HMR) are not destroyed; non-Socket.IO upgrades are forwarded to Next's upgrade handler.
- **Proposal P6:** run `server.ts` with `tsx` **4.23.15** in both modes (`dev`: `NODE_ENV=development`, Next dev; `start`: `NODE_ENV=production` after `next build`). Alternative: compile `server.ts` with `tsc` to `dist/` — rejected for now as extra build plumbing for a local-only app. `tsc --noEmit` still type-checks `server.ts`.
- Environment: `PORT` (default 3000), `HOST` (default `127.0.0.1`), `CHAT_DB_PATH` (default `data/chat.sqlite`). A small config module parses and validates them.
- **Accepted (user decision, 2026-09-26; review finding N9):** restrict the Socket.IO `Origin` so that a foreign site cannot write to the chat. The user accepted this principle; the mechanism below (Proposal P19) was accepted in task 0.1.
- **Proposal P19 — Host and Origin allowlist mechanism** (review findings N12, B2, N17, N18):
  - **Allowlist construction.** At startup a small module (`src/server/host-policy.ts`) builds the own hosts from `localhost`, `127.0.0.1`, `[::1]`, and the configured `HOST` unless it is a wildcard (`0.0.0.0`, `::`), each combined with `PORT`. Every entry is normalized by parsing it as `new URL("http://" + host + ":" + PORT)` and keeping `.host` (lowercase, default port 80 omitted, IPv6 bracketed); the allowed origins are the matching `.origin` values. Incoming values are normalized the same way before comparison, so `PORT=80` and uppercase host names compare consistently.
  - **Host check for every request.** `server.ts` checks the `Host` header of every HTTP request and every upgrade request before passing it to Next.js or Socket.IO. A missing, unparsable, or non-allowlisted `Host` gets HTTP 403 (upgrades: the socket is answered with 403 and destroyed). This covers all engine.io traffic, including polling requests that carry an existing `sid`, which engine.io's `allowRequest` does not re-check, and it covers the pages themselves.
  - **Origin check at the handshake.** Socket.IO's `allowRequest` (no permissive `cors` option) rejects a handshake whose `Origin` is present but is not an allowed origin; `Origin: null` and unparsable values are rejected, and parse errors are caught and treated as rejection, never as a crash or acceptance. A missing `Origin` is accepted, which is safe only because the `Host` check above has already passed.
  - **DNS rebinding.** A rebinding page at `http://evil.example:<PORT>` is same-origin with the server, so its GET requests (including the polling handshake) carry no `Origin`; they carry `Host: evil.example:<PORT>` and are refused by the `Host` check on every request and transport. Alternative considered: Origin-only checking or `Origin`-equals-`Host` — rejected because same-origin GETs omit `Origin` and a rebinding page's `Origin` and `Host` match.
  - **Residual risks (accepted for a local unauthenticated demo):** local non-browser processes can connect with any allowlisted `Host`; access from other machines through a LAN address is refused unless `HOST` names that address (then that address is trusted); the app serves plain HTTP only, so scheme is not considered beyond requiring `http` in allowed origins.
  - Socket.IO's default `maxHttpBufferSize` (1 MB) bounds payloads before validation.

**Socket.IO contract (Proposal P7).** All payloads are validated with the shared zod schemas (D4) on the server; client-side validation is for UX only.

| Direction | Event | Payload | Notes |
|---|---|---|---|
| handshake | `auth` option | `{ lastSeenId?: number }` | `auth` is a function on the client so each reconnect sends the current highest message id. |
| server → client | `history` | `{ mode: "replace" \| "append", messages: ChatMessage[] }` | Sent once per (re)connection, immediately after the socket joins the room. |
| server → all | `message:new` | `ChatMessage` | Broadcast after the row is committed. |
| client → server | `message:send` | `{ nickname: string, text: string }` + ack callback | Ack: `{ ok: true, message: ChatMessage }` or `{ ok: false, error: { code: "invalid_nickname" \| "invalid_text" \| "server_error", message: string } }`. Extra fields (client ids, timestamps) are stripped. |

`ChatMessage = { id: number, nickname: string, text: string, createdAt: string /* ISO 8601 UTC */ }`.

History/catch-up rule on connection: with no `lastSeenId` → `replace` with the latest 100 (oldest first). With `lastSeenId` → query up to 101 rows with `id > lastSeenId`; if ≤ 100, send `append` with them; if 101, send `replace` with the latest 100. The client merges by `id` (dedupe) and sorts by `id`. Because the SQLite driver is synchronous (D3) and the handler joins the room and reads history in the same tick, no message can slip between the history read and the live broadcast; client dedupe covers any overlap anyway.

Client send flow: `socket.timeout(5000).emit("message:send", …)`; on ok the input is cleared; on error or timeout the error is shown and the text is kept (spec: "Sender is informed when a send fails"). While disconnected, the send button is disabled; there is no offline queue. Socket.IO's built-in reconnection (exponential backoff, `reconnectionDelayMax: 2000`) is used; the status maps `connect` → `Connected`, `disconnect` followed by manager reconnect attempts → `Reconnecting`, and `disconnect` with reconnection given up or not attempted → `Disconnected`.

Length counting: all limits use JavaScript `string.length` (UTF-16 code units) after `trim()`, in both client validation and the shared zod schema (spec requirement "Character counting"; review findings N3 and N15). **Proposal P20 — no HTML `maxlength`:** the nickname and message inputs have no `maxlength` attribute, because `maxlength` counts the raw untrimmed value and truncates silently. Instead the composer shows a live counter of the trimmed length (`n/1000`), and when a trimmed value exceeds its limit the UI shows the limit message and disables sending or confirming while keeping the full text. The server's zod validation is authoritative.

- **Proposal P8:** use database-based catch-up (`lastSeenId`) rather than Socket.IO "connection state recovery". Connection state recovery keeps packets in server memory only, so it does not survive a server restart and duplicates what SQLite already provides.

### D3. Storage

- **Accepted (user decision, 2026-09-26):** SQLite; history survives a server restart.
- **Accepted (user decision, 2026-09-26):** local, single-process deployment. Limitation: Socket.IO broadcast is in-process, so it works for exactly one server instance; a second instance would neither receive nor broadcast the other's messages (would need a Socket.IO adapter such as Redis — out of scope).
- **Proposal P9 — driver: `better-sqlite3` 13.0.3** (engines `node >= 22`). Reasons: mature and stable API, synchronous calls that make the history/broadcast ordering argument in D2 trivial, prepared statements, and prebuilt binaries for current Node versions; Next.js already treats it as a server-external package, and it is only imported from the custom-server side anyway. Alternative: built-in `node:sqlite` (`DatabaseSync`) — no native dependency, but on Node 24.13.1 (checked on this machine) `require('node:sqlite')` still prints `ExperimentalWarning: SQLite is an experimental feature`, and its API may change. Trade-off accepted by this proposal: `better-sqlite3` is a native addon; if no prebuilt binary matches, installation needs a C++ toolchain.
- Schema: `messages(id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)`. `AUTOINCREMENT` guarantees ids are never reused. Journal mode WAL; `synchronous = NORMAL` is not used — default `FULL` keeps the "stored before broadcast" guarantee simple. Schema creation is idempotent on startup (`CREATE TABLE IF NOT EXISTS`); no migration framework.
- The message store module exposes: `insert({ nickname, text }) → ChatMessage` (assigns `created_at = new Date().toISOString()` on the server), `latest(limit)`, `since(lastSeenId, limit)`, and `close()`. `server.ts` closes the database on `SIGINT`/`SIGTERM`.
- Retention: see Open question Q10 (recommended: keep all rows; only the latest 100 are ever read).

### D4. Module layout (Proposal P10)

Follows the Next.js project-structure guidance (`src/` folder, colocation, private `_` folders). Directories are created only when their task needs them.

```
server.ts                               custom server: Next handler + Socket.IO on one http.Server
src/app/layout.tsx                      Server Component shell
src/app/page.tsx                        Server Component; renders <ChatRoom />
src/app/globals.css
src/app/_chat/chat-room.tsx             'use client' root of the interactive subtree
src/app/_chat/nickname-form.tsx         'use client'
src/app/_chat/message-list.tsx          'use client'; renders text via React text nodes only
src/app/_chat/composer.tsx              'use client'
src/app/_chat/connection-status.tsx     'use client'
src/app/_chat/use-chat-socket.ts        client hook: socket lifecycle, merge/dedupe, lastSeenId
src/app/_chat/merge-messages.ts         pure merge/sort helper (+ .test.ts)
src/lib/chat/schema.ts                  shared zod schemas, limits, ChatMessage type (+ .test.ts)
src/server/config.ts                    env parsing (+ .test.ts)
src/server/host-policy.ts               Host/Origin allowlist and normalization (+ .test.ts)
src/server/chat/message-store.ts        SQLite access (+ .test.ts)
src/server/chat/socket-handlers.ts      attach handlers to a Socket.IO server (+ .test.ts)
e2e/                                    Playwright specs and fixtures
scripts/agent-loop.sh                   agent loop
scripts/session-context.sh              SessionStart hook command
```

- **Proposal P11:** `zod` **4.6.5** for the shared schema used by both client and server (single source of the limits in the chat-room spec).
- XSS: messages and nicknames are rendered only as React text children. `dangerouslySetInnerHTML`, Markdown, and auto-linking are not used; an ESLint rule (`react/no-danger`) enforces the first.

### D5. Lint, type check, unit tests, and `npm run check`

- **Accepted (user decision):** a single check command `npm run check` (lint, type check, unit tests, Playwright E2E) that the checker reruns and that is the loop's final gate.
- **Accepted (user decision, 2026-09-26; review finding N8):** remove `next build` from each loop iteration; the full `npm run check` stays the final gate.
- **Proposal P21 — `check:loop` with dev-mode E2E:** iterations run `npm run check:loop` (lint, type check, unit tests, E2E against a dev-mode server), and the full `npm run check` runs once when `check:loop` is green. Alternative considered: skipping E2E in iterations entirely — rejected because most chat behavior is only covered by E2E.
- **Proposal P12:** ESLint flat config (`eslint.config.mjs`) extending `eslint-config-next` 16.3.6 (`core-web-vitals` + `typescript`), on ESLint 9.39.5 and TypeScript 6.0.3 (accepted in D1).
- **Proposal P13:** Vitest 5.0.2 (already pinned) for unit and Node-level integration tests, colocated as `src/**/*.test.ts`, plus `scripts/agent-loop.test.ts` for the loop. Environment `node`; no jsdom in this change (UI behavior is covered by E2E). Socket handler tests start Socket.IO on an ephemeral port with a temporary SQLite file and connect with `socket.io-client` — no Next.js involved.
- Scripts (Proposal P14):

```json
{
  "dev": "NODE_ENV=development tsx server.ts",
  "build": "next build",
  "start": "NODE_ENV=production tsx server.ts",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test:unit": "vitest run",
  "test:e2e": "next build && playwright test",
  "test:e2e:dev": "E2E_SERVER_MODE=dev playwright test",
  "check": "npm run lint && npm run typecheck && npm run test:unit && npm run test:e2e",
  "check:loop": "npm run lint && npm run typecheck && npm run test:unit && npm run test:e2e:dev"
}
```

Both check scripts stop at the first failing stage and exit non-zero on any failure. No stage may report success without running real checks (`--passWithNoTests` is not used). Tasks 1.2 and 1.3 add these scripts explicitly (review finding N6).

### D6. Browser E2E with Playwright

- **Accepted (user decision):** `@playwright/test` (dev dependency, already pinned at 1.63.0) for committed browser E2E tests runnable with one command; agent-driven browser checks are supplementary only.
- **Proposal P15 — configuration** (`playwright.config.ts`): `testDir: "e2e"`, `testMatch: "**/*.spec.ts"`, one project `chromium` (Desktop Chrome), `workers: 1`, `fullyParallel: false`, `retries: 0`, `forbidOnly: !!process.env.CI`, `timeout: 30_000`, `expect.timeout: 5_000`, `reporter: [["list"], ["html", { open: "never" }]]`, `use.trace: "retain-on-failure"`, `use.screenshot: "only-on-failure"`. Outputs go to `test-results/` and `playwright-report/` (git-ignored).
- **Server startup:** tests must stop and restart the server (restart and reconnection scenarios), which Playwright's `webServer` option cannot do mid-test. Therefore the config has **no `webServer`**. A fixture `e2e/fixtures/chat-server.ts` spawns `tsx server.ts` per test with a free `PORT` and a fresh temporary `CHAT_DB_PATH`, waits until `GET /` returns 200, exposes `baseURL`, `stop()`, and `start()` (same DB file), and kills the process after the test. `E2E_SERVER_MODE` selects the mode: `prod` (default; `NODE_ENV=production`, requires the `next build` that `test:e2e` runs first) for the final gate, or `dev` (`NODE_ENV=development`, no build; on-demand compilation) for `check:loop`. Production mode avoids on-demand compilation and is the authoritative result. Alternative considered: `webServer: { command: "npm run start" }` for most tests plus a custom fixture for restart tests — rejected to keep one startup path and isolated state per test.
- **Seeding:** the 100-message test seeds 105 rows by calling the message-store module on the fixture's DB file before starting the server.
- **Modified-client scenarios** (server-side rejection of oversized text or invalid nickname) use `socket.io-client` from the test process against the fixture server.
- **Connection loss:** stop the fixture server → assert the status and disabled send; start it → assert reconnection. **Catch-up while the server stays up** (client B disconnected, A sends): planned with `page.routeWebSocket` on B's page to close and later allow its WebSocket; if that proves unreliable with Socket.IO's transport upgrade, the scenario is covered by a Node-level integration test in `socket-handlers.test.ts` plus the E2E restart test, and the limitation is recorded in that task's evidence (Open question Q12).
- **Host and Origin checks:** Node-level tests use raw HTTP requests with explicit headers (Node `http.request` for the polling handshake `GET /socket.io/?EIO=4&transport=polling` and for `GET /`, and an HTTP upgrade request for `transport=websocket`), because browser clients cannot set `Host`. Refused: no `Origin` with `Host: evil.example:<PORT>` (the realistic rebinding case) on both transports and for `GET /`; allowed `Host` with `Origin: http://evil.example`, `Origin: null`, or an unparsable value. Accepted: no `Origin` with `Host: 127.0.0.1:<PORT>`; `Host: LOCALHOST:<PORT>`; `Origin: http://localhost:<PORT>`. The browser E2E connection (fixture base URL `http://127.0.0.1:<PORT>`) succeeds.
- **Exact commands:** `npm run test:e2e` (build + all E2E, production server), `npm run test:e2e:dev` (dev server, no build), or `npx playwright test` after a build. Prerequisite once per machine: `npm exec -- playwright install chromium`. Chromium sockets may be blocked in restricted agent sandboxes (observed during setup); run E2E with approved execution permissions and record that.

### D7. Agent loop `scripts/agent-loop.sh`

- **Accepted (user decision)** — recorded in `docs/architecture.md`: on failing checks the loop passes the failure output to a non-interactive agent, repeating until green or the iteration limit (default 5); per-iteration log at `docs/evidence/<task-id>/loop-run.log`; at least one real task runs through it with the log committed. The **task maker launches the loop**, not the coordinator. Each fix iteration is a fresh process with scoped input (task, failure output, owned files) acting on the maker's side; it is not a checker. The required checker is a separate Claude Code subagent that reviews the spec, changes, and `loop-run.log` and reruns checks; a green loop does not complete a task, and findings return to the same maker, who may rerun the loop.
- **Accepted (user decision, 2026-09-26):** the default fixer is **`claude -p`** (Codex CLI is not installed here); `codex exec` stays selectable with `--agent codex`, its flags unverified until Codex is available. Cross-tool separation: an additional review pass of Claude-written code by Codex/ChatGPT is an optional extra, recorded as evidence only when actually performed; it is not a required gate (resolves Q9).
- **Accepted (user decision, 2026-09-26; review finding N8):** simplify the loop — keep 3–4 stop reasons instead of 8 and remove `next build` from each iteration.
- **Proposal P22 — exact loop simplification:** the four stop reasons below, and no out-of-scope change detection (only an informational `changed_files` list in the log).
- **Proposal P16 — interface** (normative behavior in `specs/agent-loop/spec.md`):

```
scripts/agent-loop.sh --task-id <id> --brief <file> [--agent claude|codex] [--max-iterations N] [--agent-timeout SECONDS]
```

  - `--task-id` (required): `^[a-z0-9][a-z0-9-]*$`, e.g. `add-realtime-chat-room-2-1`; selects `docs/evidence/<task-id>/`.
  - `--brief` (required): Markdown file written by the maker with the OpenSpec task reference, acceptance criteria, relevant spec/design paths, and an `## Owned files` list. Kept at `docs/evidence/<task-id>/loop-brief.md` so the checker can see what the fixer was told.
  - `--agent` (default `claude`), `--max-iterations` (default 5, allowed 1–10), `--agent-timeout` (default 900 s per fixer run).
  - The script `cd`s to its own parent's parent (the project root) first, so it works from any directory.
  - Test seams: `AGENT_LOOP_CHECK_CMD` and `AGENT_LOOP_FULL_CHECK_CMD` override `npm run check:loop` and `npm run check` only for the loop's own self-tests; the values used are written in the log header, so a checker can confirm a real run used the real commands.
- **Fixer prompt:** a fixed preamble (you are one fix iteration; edit only owned files; do not weaken or delete tests or specs; do not commit, push, edit `tasks.md`, or write review files; stop when done) + the brief + the last 200 lines (max 20 KB, ANSI stripped) of the failing check output. Passed on stdin; no session resume.
- **Proposal P17 — CLI invocation and permissions:**
  - Claude Code (default): `claude -p --permission-mode acceptEdits --allowedTools "Read" "Edit" "Write" "Glob" "Grep" "Bash(npm run lint)" "Bash(npm run typecheck)" "Bash(npm run test:unit)" --no-session-persistence --output-format text --max-budget-usd "${AGENT_LOOP_CLAUDE_MAX_USD:-2}"` (flags confirmed present in `claude --help` of 2.1.198).
  - Codex (selectable): `codex exec --sandbox workspace-write --cd <project-root> -` (prompt from stdin). Unverified: Codex is not installed here; confirm with `codex exec --help` before first use and record the output.
  - Never used: `--dangerously-skip-permissions`, `--permission-mode bypassPermissions`, or Codex's sandbox/approval bypass. No network or `git commit`/`git push` permission is granted to the fixer. The fixer is not given E2E execution; the loop itself runs the checks outside the agent's permission scope.
  - The script runs with the maker's own user permissions; the maker must obtain any approval their harness requires to execute `scripts/agent-loop.sh`, which in turn launches the agent CLI.
- **Iteration and stop conditions:** iteration 0 = initial `check:loop`; each further iteration = one fixer run + one `check:loop`. When `check:loop` passes, `npm run check` runs once; if it fails, its output feeds the next fixer run. Stop reasons and exit codes: `checks_passed` 0, `max_iterations_reached` 1, `agent_error` 2 (fixer missing, non-zero exit, or timeout; the cause is logged), `no_progress` 3; usage errors exit 64 without a log. No-progress detection (review findings B1, N20) compares, before and after the fixer run, a SHA-256 over three parts, each command limited by the same pathspec `-- . ':(exclude)docs/evidence/<task-id>/loop-run.log' ':(exclude).agent-loop'` (so the loop's own log never counts as progress, whether it is untracked or already committed): `git status --porcelain=v1 --untracked-files=all`, `git diff HEAD --binary` (tracked content), and the content of every untracked, non-ignored file from `git ls-files --others --exclude-standard -z`, sorted by path. Each untracked entry is hashed individually and never fails the pipeline: a symlink contributes its `readlink` target text (so broken symlinks work), a readable regular file its SHA-256, and anything unreadable the marker `unreadable:<path>`; if `xargs` is used it is `xargs -0 -r`. Therefore editing, adding, or deleting a new untracked file (such as `src/lib/chat/schema.ts` in task 2.1) counts as progress, and a broken or unreadable entry cannot abort the loop. On `INT`/`TERM` a `trap` kills the child process group (fixer or check and their descendants), waits for it to exit, and the script exits 130; no footer is guaranteed then.
- **Cost control:** hard cap of 10 iterations (default 5) → at most 5 fixer runs by default; per-run timeout; `--max-budget-usd` per Claude run; `no_progress` stop; bounded failure excerpt to limit input tokens; checks fail fast on the first failing stage; no production build per iteration. Codex has no known per-run budget flag; it is bounded by iterations and timeout.
- **Log format** (`docs/evidence/<task-id>/loop-run.log`, append-only, UTF-8, one `key=value` record per line, values with spaces double-quoted, times in UTC ISO 8601):

```
=== run start=2026-09-27T10:00:00Z task_id=add-realtime-chat-room-2-1 agent=claude max_iterations=5 agent_timeout_s=900 check_cmd="npm run check:loop" full_check_cmd="npm run check" git_head=<sha> node=v24.x
iteration=0 phase=check exit=1 result=fail duration_s=48
  | <up to 40 lines of the failing output, ANSI stripped>
iteration=1 phase=agent exit=0 duration_s=212 changed_files=src/lib/chat/schema.ts
iteration=1 phase=check exit=0 result=pass duration_s=51
iteration=1 phase=full_check exit=0 result=pass duration_s=95
=== run end=2026-09-27T10:05:11Z stop_reason=checks_passed fixer_runs=1 exit=0
```

  `changed_files` is `git diff --name-only` plus new untracked files, for the checker's information only. Full check and agent outputs go to `.agent-loop/<task-id>/<run-start>/iter-<n>-{check,full_check,agent}.txt` (git-ignored). Environment variables are never logged. The script's final line: `Loop finished: <stop_reason>. Independent checker review is still required.`
- Implementation notes: `set -euo pipefail`, `timeout` from coreutils for the per-run limit, `command -v` for agent availability.

### D8. `SessionStart` hook

- **Accepted (user decision)** — recorded in `docs/architecture.md`: a Claude Code `SessionStart` hook in the project `.claude/settings.json` runs the pinned OpenSpec CLI `list --json` and injects active changes into context; a sample of actual output is recorded as evidence; Codex parity is evaluated, and a missing equivalent is documented as a limitation.
- **Proposal P18 — configuration** (`.claude/settings.json`, committed):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/session-context.sh", "timeout": 15 }
        ]
      }
    ]
  }
}
```

- **Command:** `scripts/session-context.sh` changes to `$CLAUDE_PROJECT_DIR` (falling back to the script's parent directory) and runs `timeout 10 npm run --silent openspec -- list --json` — the pinned local CLI per `docs/workflow.md`; never `npx --yes`, which could download.
- **Output:** on success, stdout (added to context by Claude Code for `SessionStart`):

```
Active OpenSpec changes (from `npm run --silent openspec -- list --json`):
{ "changes": [ ... ], "root": { ... } }
```

- **Failure behavior:** on non-zero exit, timeout, or missing `node_modules`, print `Active OpenSpec changes could not be loaded (<reason>). Run: npm run --silent openspec -- list --json` and exit 0. The script never writes files, never installs, and discards the CLI's stderr from context (a short reason only).
- **Codex parity: unknown (open question Q8).** Codex is not installed in this environment, so whether the current Codex CLI offers an equivalent session-start hook could not be checked. The hook task must check the installed Codex version's documentation/`--help`. If an equivalent exists, configure it only after a verified run; otherwise document in `docs/workflow.md` that Codex has no automatic injection and that Codex agents run `npm run --silent openspec -- list --json` themselves (Open question Q8). Parity must not be claimed without a verified run.

### D9. Documentation updates

`docs/architecture.md` already records the user decisions of 2026-09-26 (updated together with this change). When implemented, `docs/architecture.md` also records the confirmed proposals, `docs/testing.md` gains the exact commands, and `README.md` gains run instructions. Requirements stay in OpenSpec and are not copied into these files.

## Risks / Trade-offs

- [The switch to TypeScript 6.0.3 / ESLint 9.39.5 is based on published peer ranges, not an install] → Task 1.1 performs it and verifies with `npm ci`, `npm ls`, a real `npm run lint`, and `next build`.
- [`codex exec` flags are unverified because Codex is not installed] → Default fixer is `claude -p`; `--agent codex` without Codex stops with `agent_error`, recorded in the log.
- [Dev-mode E2E in `check:loop` may differ from production behavior, be slower per spawned server, or share `.next` output with `next build`] → `npm run check` with a production build stays the final gate; task 1.3 verifies that dev and prod runs do not clobber each other's build output (separate `distDir` if they do) and records timings.
- [Custom server loses some Next.js optimizations and serverless hosting] → Accepted consequence; acceptable for a local single-process app.
- [In-process broadcast is single-instance only] → Accepted limitation; documented; a Socket.IO adapter would be needed for scaling.
- [Engine.io's default `destroyUpgrade` can kill Next dev HMR upgrades] → `destroyUpgrade: false` and forward non-Socket.IO upgrades to Next.
- [`better-sqlite3` native build can fail without a prebuilt binary] → Record the Node version; switch to `node:sqlite` only with user confirmation (Q11).
- [Node version drift: `.nvmrc` 24.21.0 vs. nvm 24.13.1 / temporary `/tmp` 24.21.0 / system 22.22.1] → Every evidence file records `node --version`; npm only warns about the `engines` mismatch unless `engine-strict` is set, so makers select Node 24 explicitly.
- [E2E flakiness from timing (reconnect backoff, server restart)] → per-test isolated server and DB, `workers: 1`, web-first assertions with explicit timeouts, Socket.IO reconnection delay capped (e.g. `reconnectionDelayMax: 2000`).
- [Chromium socket operations blocked in restricted agent sandboxes] → run E2E with approved permissions; record it; the fixer does not run E2E.
- [Fixer may edit tests to make them pass] → preamble forbids it; `changed_files` in the log; checker reviews the diff and `loop-run.log`.
- [Other web pages in the browser could connect to the local chat, including through DNS rebinding] → `Host` allowlist on every request plus `Origin` check at the handshake (D2, Proposal P19), with failure scenarios and tests on both transports; residual risks listed in D2.
- [The `Host` check could break Next.js dev HMR or tools that use another host name] → HMR uses the page's own host, which is allowlisted; other host names must be configured through `HOST`.
- [Cost of agent iterations] → iteration cap, timeout, Claude budget flag, `no_progress` stop.
- [Nickname spoofing — anyone can use any nickname] → Accepted by the no-registration scope; stated in the spec (duplicates allowed).

## Migration Plan

Greenfield; nothing to migrate. Rollback is reverting the change's commits. The SQLite file under `data/` is local runtime state and git-ignored; deleting it resets history.

## Open Questions

Resolved on 2026-09-26 by user decision (the user accepted all recommended defaults and chose `claude -p`): Q1–Q7 and Q9. They are kept here with their resolution; the chat-room spec states the accepted values as requirements.

- **Q1 — Nickname rules. Resolved (user decision, 2026-09-26):** 1–32 characters after trimming; Unicode letters, digits, space, `-`, `_`, `.`; not unique; kept in `localStorage` (`chat.nickname`) and sent with each message; changeable via a "Change nickname" control.
- **Q2 — Message length and whitespace. Resolved (user decision, 2026-09-26):** trim leading/trailing whitespace; reject empty or whitespace-only; max 1000 characters after trimming; preserve inner line breaks (Shift+Enter for newline, Enter sends). Characters are UTF-16 code units (JavaScript `length`), counted the same way in client validation and zod (review finding N3); no HTML `maxlength` truncation (Proposal P20, review finding N15).
- **Q3 — Ordering and timestamps. Resolved (user decision, 2026-09-26):** server-assigned increasing id and ISO UTC timestamp; order by id; display local `HH:MM`, full date/time in a `title` tooltip.
- **Q4 — History on join. Resolved (user decision, 2026-09-26):** latest 100, oldest → newest, newest at the bottom with auto-scroll on load and on new messages when already at the bottom.
- **Q5 — Connection loss and reconnection. Resolved (user decision, 2026-09-26):** status `Connected` / `Reconnecting` / `Disconnected`; send disabled while not connected, typed text kept, no offline queue; automatic reconnection (backoff capped at 2 s); catch-up via `lastSeenId`, replacing the list with the latest 100 if more were missed; send acknowledgement timeout 5 s with a visible error and text kept.
- **Q6 — Safe rendering. Resolved (user decision, 2026-09-26):** plain text only (React text nodes), no Markdown, no auto-linking, `white-space: pre-wrap` for line breaks.
- **Q7 — Toolchain compatibility. Resolved (user decision, 2026-09-26):** TypeScript 6.0.3 and ESLint 9.39.5. Reason: `eslint-config-next` 16.3.6's own peers (`eslint >=9.0.0`, `typescript >=3.3.1`) are satisfied, but the peers of its dependencies are not — `typescript-eslint` 8.70.1 requires `typescript >=4.8.4 <6.1.0`, and `eslint-plugin-react`, `eslint-plugin-import`, and `eslint-plugin-jsx-a11y` allow ESLint `^9` at most (review finding N7). Task 1.1 changes `package.json`/`package-lock.json`.
- **Q8 — Codex `SessionStart` parity. Open, deferrable.** Unknown (Codex not installed here). Recommended: evaluate during task 1.5; document the limitation if no verified equivalent exists.
- **Q9 — Default fixer. Resolved (user decision, 2026-09-26):** `claude -p` by default; `codex exec` selectable, flags unverified; an optional Codex/ChatGPT review pass is extra evidence only when performed, not a gate.
- **Q10 — Retention. Open, deferrable.** Recommended: keep all rows (no pruning); only the latest 100 are read. Does not change specs.
- **Q11 — SQLite driver. Resolved (user decision, 2026-09-26, task 0.1):** `better-sqlite3` 13.0.3 (Proposal P9), a native dependency.
- **Q12 — E2E technique for catch-up while the server stays up. Open, deferrable.** Recommended: try `page.routeWebSocket`; fall back to the Node-level integration test plus restart E2E and record the limitation. Does not change specs.
