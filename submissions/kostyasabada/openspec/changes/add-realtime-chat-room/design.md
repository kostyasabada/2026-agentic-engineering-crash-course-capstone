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
- **Proposal Pn** — suggested by the coordinator or this maker. All proposals P1–P22 are **Accepted (user decision, 2026-09-26, task 0.1)** as written; the numbering is kept so that references remain valid. The user's reply is recorded in `docs/evidence/add-realtime-chat-room-0-1/decisions.md`. Proposal P23 (concrete server module layout, D4) was added later on 2026-09-26 and is **Accepted (user decision, 2026-09-26)** together with the controller boundary row and the detail rules (a)–(e) listed in D4 (resolves Q13); the reverse boundary row `src/server/**` ↛ `src/app/**` (from review finding F4) was accepted by the user separately on 2026-09-26 (translated: "yes, I accept both, then commit"); where P23 replaces parts of P10 or of other accepted proposals, the affected text says so.
- **Open question** — still unanswered; listed with a recommended default in Open Questions. Resolved questions are kept there with their resolution.

## Goals / Non-Goals

**Goals:**

- One Node process serves the Next.js UI and the Socket.IO endpoint on one port, backed by one SQLite file.
- All spec scenarios are covered by automated checks reachable from a single `npm run check`, so tasks can go red → green and a checker can rerun everything. A faster `npm run check:loop` (no production build) serves agent-loop iterations; `npm run check` stays the final gate.
- The chat logic (validation, business rules, storage, Socket.IO event handling) is testable without Next.js or a browser, each server layer on its own (D4).
- The server code is structured for extensibility as feature modules with controller, service, and repository layers, so that later features are added as new modules rather than by growing one file (D4).
- The agent loop and the `SessionStart` hook are small, deterministic shell tools with documented failure modes.

**Non-Goals:**

- No production deployment pipeline, containers, or process manager.
- No generic abstraction layer for swapping transports or databases. The only interface is the chat `MessageRepository` (D4), which exists for layer separation and testing, not for supporting several databases.
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
- **Proposal P5:** `socket.io` and `socket.io-client` **4.8.4**. One `http.Server` passes normal requests to Next's request handler and attaches Socket.IO at the default path `/socket.io/`. Socket.IO is created with `destroyUpgrade: false` so that WebSocket upgrades it does not own (Next.js dev HMR) are not destroyed; non-Socket.IO upgrades are forwarded to Next's upgrade handler. Task 1.2 implemented this in `server.ts` with explicit `request`/`upgrade` dispatchers; under the layered layout (D4, Proposal P23) the `http.Server`, Socket.IO, and the dispatchers move to the composition root `src/server/app.ts`, and `server.ts` becomes a thin entry.
- **Proposal P6:** run `server.ts` with `tsx` **4.23.15** in both modes (`dev`: `NODE_ENV=development`, Next dev; `start`: `NODE_ENV=production` after `next build`). Alternative: compile `server.ts` with `tsc` to `dist/` — rejected for now as extra build plumbing for a local-only app. `tsc --noEmit` still type-checks `server.ts`.
- Environment: `PORT` (default 3000), `HOST` (default `127.0.0.1`), `CHAT_DB_PATH` (default `data/chat.sqlite`). A small config module parses and validates them.
- **Accepted (user decision, 2026-09-26; review finding N9):** restrict the Socket.IO `Origin` so that a foreign site cannot write to the chat. The user accepted this principle; the mechanism below (Proposal P19) was accepted in task 0.1.
- **Proposal P19 — Host and Origin allowlist mechanism** (review findings N12, B2, N17, N18):
  - **Allowlist construction.** At startup a small module (`src/server/http/host-policy.ts`, location per Proposal P23; P19 originally named `src/server/host-policy.ts`) builds the own hosts from `localhost`, `127.0.0.1`, `[::1]`, and the configured `HOST` unless it is a wildcard (`0.0.0.0`, `::`), each combined with `PORT`. Every entry is normalized by parsing it as `new URL("http://" + host + ":" + PORT)` and keeping `.host` (lowercase, default port 80 omitted, IPv6 bracketed); the allowed origins are the matching `.origin` values. Incoming values are normalized the same way before comparison, so `PORT=80` and uppercase host names compare consistently.
  - **Host check for every request.** The request and upgrade dispatchers (in `src/server/app.ts` per Proposal P23; P19 originally named `server.ts`) check the `Host` header of every HTTP request and every upgrade request before passing it to Next.js or Socket.IO. A missing, unparsable, or non-allowlisted `Host` gets HTTP 403 (upgrades: the socket is answered with 403 and destroyed). This covers all engine.io traffic, including polling requests that carry an existing `sid`, which engine.io's `allowRequest` does not re-check, and it covers the pages themselves.
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

History/catch-up rule on connection: with no `lastSeenId` → `replace` with the latest 100 (oldest first). A `lastSeenId` that is not a non-negative integer (non-integer, negative, fractional, `null`, string) is treated as absent, and so is a `lastSeenId` greater than the current highest message id (for example, the database was reset and the browser still holds an old value); both get `replace` with the latest 100 (accepted user decisions, 2026-09-26, D4). With a valid `lastSeenId` → query up to 101 rows with `id > lastSeenId`; if ≤ 100, send `append` with them; if 101, send `replace` with the latest 100. The client merges by `id` (dedupe) and sorts by `id`. The rule is a business rule of the chat service; the controller only reads `lastSeenId` from the handshake, joins the room, and emits the service's result (D4). Because the SQLite driver is synchronous (D3), the `MessageRepository` interface and the service methods are synchronous too, and the controller joins the room and reads history in the same tick, no message can slip between the history read and the live broadcast; client dedupe covers any overlap anyway. Making the repository asynchronous would require revisiting this argument.

Client send flow: `socket.timeout(5000).emit("message:send", …)`; on ok the input is cleared; on error or timeout the error is shown and the text is kept (spec: "Sender is informed when a send fails"). While disconnected, the send button is disabled; there is no offline queue. Socket.IO's built-in reconnection (exponential backoff, `reconnectionDelayMax: 2000`) is used; the status maps `connect` → `Connected`, `disconnect` followed by manager reconnect attempts → `Reconnecting`, and `disconnect` with reconnection given up or not attempted → `Disconnected`.

Length counting: all limits use JavaScript `string.length` (UTF-16 code units) after `trim()`, in both client validation and the shared zod schema (spec requirement "Character counting"; review findings N3 and N15). **Proposal P20 — no HTML `maxlength`:** the nickname and message inputs have no `maxlength` attribute, because `maxlength` counts the raw untrimmed value and truncates silently. Instead the composer shows a live counter of the trimmed length (`n/1000`), and when a trimmed value exceeds its limit the UI shows the limit message and disables sending or confirming while keeping the full text. The server's zod validation is authoritative.

- **Proposal P8:** use database-based catch-up (`lastSeenId`) rather than Socket.IO "connection state recovery". Connection state recovery keeps packets in server memory only, so it does not survive a server restart and duplicates what SQLite already provides.

### D3. Storage

- **Accepted (user decision, 2026-09-26):** SQLite; history survives a server restart.
- **Accepted (user decision, 2026-09-26):** local, single-process deployment. Limitation: Socket.IO broadcast is in-process, so it works for exactly one server instance; a second instance would neither receive nor broadcast the other's messages (would need a Socket.IO adapter such as Redis — out of scope).
- **Proposal P9 — driver: `better-sqlite3` 13.0.3** (engines `node >= 22`). Reasons: mature and stable API, synchronous calls that make the history/broadcast ordering argument in D2 trivial, prepared statements, and prebuilt binaries for current Node versions; Next.js already treats it as a server-external package, and it is only imported from the custom-server side anyway. Alternative: built-in `node:sqlite` (`DatabaseSync`) — no native dependency, but on Node 24.13.1 (checked on this machine) `require('node:sqlite')` still prints `ExperimentalWarning: SQLite is an experimental feature`, and its API may change. Trade-off accepted by this proposal: `better-sqlite3` is a native addon; if no prebuilt binary matches, installation needs a C++ toolchain.
- Schema: `messages(id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)`. `AUTOINCREMENT` guarantees ids are never reused. Journal mode WAL; `synchronous = NORMAL` is not used — default `FULL` keeps the "stored before broadcast" guarantee simple. Schema creation is idempotent on startup (`CREATE TABLE IF NOT EXISTS`); no migration framework.
- Storage code is split by responsibility (D4, Proposal P23; this replaces the single "message store module" of the earlier design): `src/server/db/sqlite.ts` opens the connection (creating the parent directory if missing), sets WAL, creates the schema idempotently, and closes it; `src/server/chat/message.repository.ts` holds the synchronous `MessageRepository` interface — `insert({ nickname, text, createdAt }) → ChatMessage` (the database assigns `id`), `latest(limit)`, `since(lastSeenId, limit)` — and its implementation `SqliteMessageRepository`, which receives the open connection in its constructor. The chat service assigns `createdAt` from an injected clock (default `() => new Date()`, stored as `toISOString()`: ISO 8601 UTC with milliseconds), not from a database default, so timestamps remain server-assigned UTC (accepted user decision, 2026-09-26, D4). The composition root closes Socket.IO and the database; `server.ts` triggers this on `SIGINT`/`SIGTERM`.
- Retention: see Open question Q10 (recommended: keep all rows; only the latest 100 are ever read).

### D4. Module layout and layered server architecture (Proposals P10, P23)

- **Accepted (user decision, 2026-09-26):** the server code uses a layered architecture with controllers, services, and repositories, built for extensibility. Source: the user's message in the coordinator conversation on 2026-09-26 (translated: "yes. and let's build it for extensibility with the proper controllers, services and repositories approach."), relayed by the coordinator to the maker of task `add-realtime-chat-room-layered-arch`. The user accepted the principle; the concrete layout below is Proposal P23.
- **Accepted (user decision, 2026-09-26):** task 1.3 adds an ESLint `no-restricted-imports` rule that prevents `src/app/**` from importing `src/server/**`. Source: the same message's "yes", answering the coordinator's question "add the import-boundary ESLint rule to task 1.3?".
- **Proposal P10 (accepted, task 0.1):** follow the Next.js project-structure guidance (`src/` folder, colocation, private `_` folders); directories are created only when their task needs them. Its `src/app/`, `src/lib/`, `e2e/`, and `scripts/` entries stand unchanged. Its server entries (`src/server/host-policy.ts`, `src/server/chat/message-store.ts`, `src/server/chat/socket-handlers.ts`) are replaced by Proposal P23.
- **Accepted (user decision, 2026-09-26) — Proposal P23, feature-module layout, including the controller boundary row:** after the coordinator explained P23 in detail and recommended the controller boundary row, the user wrote (translated) "yes, I accept both, commit 1.2". "Both" are P23 as described below (feature modules, the `src/server/app.ts` composition root with the dispatchers, a thin `server.ts`, constructor/factory injection) and the controller row of the boundary table (controller ↛ `better-sqlite3`, `*.repository`, `src/server/db/**`); "commit 1.2" referred to the separate commit of task 1.2. This resolves Q13. Layers live inside each feature module, not in global `controllers/`, `services/`, and `repositories/` folders, so a new feature becomes a new module next to `chat/`.

```
server.ts                                  thin entry: config, Next.js app, createApp(), listen, SIGINT/SIGTERM; the only server file that imports `next`
src/app/layout.tsx                         Server Component shell
src/app/page.tsx                           Server Component; renders <ChatRoom />
src/app/globals.css
src/app/_chat/chat-room.tsx                'use client' root of the interactive subtree
src/app/_chat/nickname-form.tsx            'use client'
src/app/_chat/message-list.tsx             'use client'; renders text via React text nodes only
src/app/_chat/composer.tsx                 'use client'
src/app/_chat/connection-status.tsx        'use client'
src/app/_chat/use-chat-socket.ts           client hook: socket lifecycle, merge/dedupe, lastSeenId
src/app/_chat/merge-messages.ts            pure merge/sort helper (+ .test.ts)
src/lib/chat/schema.ts                     shared zod schemas, limits, ChatMessage type (+ .test.ts)
src/server/config.ts                       env parsing (+ .test.ts; exists since task 1.2)
src/server/app.ts                          composition root and HTTP/Socket.IO wiring (+ .test.ts)
src/server/http/host-policy.ts             Host/Origin allowlist and normalization (+ .test.ts)
src/server/db/sqlite.ts                    connection, directory creation, WAL, idempotent schema, close (tested via the repository tests)
src/server/chat/chat.controller.ts         Socket.IO event handlers for chat (+ .test.ts)
src/server/chat/chat.service.ts            chat business rules (+ .test.ts)
src/server/chat/message.repository.ts      MessageRepository interface + SqliteMessageRepository (+ .test.ts)
e2e/                                       Playwright specs and fixtures
scripts/agent-loop.sh                      agent loop
scripts/session-context.sh                 SessionStart hook command
```

  - **Controller** (`chat.controller.ts`): registers the Socket.IO `connection` handler and the `message:send` handler on a given `Server`. It reads `lastSeenId` from the handshake `auth` (a non-negative integer; anything else is treated as absent, rule (a) below), joins the room, emits `history` from the service, validates `message:send` payloads with the shared zod schema (D4, P11), maps validation failures to the ack error codes of the contract (D2), calls the service, broadcasts `message:new`, and acks. If the service throws, it catches the error, acks `{ ok: false, error: { code: "server_error", message } }` (the D2 contract), broadcasts nothing, and keeps the server running (rule (c)). It knows Socket.IO and the schema, not SQLite or the repository.
  - **Service** (`chat.service.ts`): `createChatService(repository, { now })` returns an object with `postMessage(input)` (input already validated and trimmed by the schema; assigns the server `createdAt`; returns the stored `ChatMessage`) and `historyFor(lastSeenId?)` (the history/catch-up rule of D2: latest 100, or `append`/`replace` by `lastSeenId`; a `lastSeenId` greater than the current highest id, found with `latest(1)`, is treated as absent, rule (b)). It imports neither `socket.io` nor `better-sqlite3`; it depends only on the `MessageRepository` interface, imported with `import type` so that the SQLite implementation in the same file is not loaded at runtime by the service.
  - **Repository** (`message.repository.ts`): the synchronous `MessageRepository` interface (D3) and `SqliteMessageRepository`, which receives the open `better-sqlite3` connection from `db/sqlite.ts` through its constructor and runs prepared statements. It imports neither the service, the controller, nor `socket.io`.
  - **Database** (`db/sqlite.ts`): `openDatabase(path)` and closing; shared by future repositories.
  - **Composition root** (`app.ts`): `createApp({ config, next: { handleRequest, handleUpgrade } })` wires config → `openDatabase` → `SqliteMessageRepository` → `createChatService` → Socket.IO server (`destroyUpgrade: false`, `serveClient: false`, `allowRequest` using the host policy) → `registerChatController(io, service)`, creates the `http.Server`, installs the `request` and `upgrade` dispatchers, and returns `{ httpServer, io, close() }`. The dispatchers written in task 1.2 (removal of engine.io's own listeners, routing by the `/socket.io/` prefix) move here unchanged, and they stay the single insertion points for the per-request and per-upgrade Host check (P19). `app.ts` does not import `next`; the Next.js handlers are injected, so Node tests can start the whole server stack with stub handlers and without a Next.js build.
  - **Entry** (`server.ts`): parses config, creates and prepares the Next.js app, calls `createApp`, listens (keeping the task 1.2 listen-error handling), and calls `close()` on `SIGINT`/`SIGTERM`.
  - **Detail rules — Accepted (user decision, 2026-09-26):** after the coordinator explained these maker additions and one coordinator addendum (b) in detail, the user wrote (translated) "ok, that works":
    - (a) a `lastSeenId` that is not a non-negative integer (non-integer, negative, fractional, `null`, string) is treated as absent → latest 100 (controller);
    - (b) addendum: a `lastSeenId` greater than the current highest message id (the database was reset, a stale browser value) is also treated as absent → latest 100 (service); this is observable and has a chat-room spec scenario and a requirement sentence (user decision, 2026-09-26, translated: "yes, I accept both, then commit");
    - (c) the controller catches service errors, acks `server_error`, broadcasts nothing, and the server keeps running (controller test with a stubbed failing service);
    - (d) ids are never reused: the table uses `AUTOINCREMENT`; the repository test inserts, deletes the newest row, inserts again, and gets a greater id;
    - (e) `createdAt` is assigned by the service from an injected clock (ISO 8601 UTC with milliseconds), not by a database default.
  - **Dependency direction:** controller → service → repository interface; `app.ts` is the only place that knows every layer; `src/app/**` (browser) and `src/server/**` share only `src/lib/**`, enforced in both directions by the boundary rules below (the `src/server/**` ↛ `src/app/**` direction originates from review finding F4 and is an accepted user decision, 2026-09-26: the coordinator asked whether to accept this reverse rule and a spec sentence, and the user answered, translated, "yes, I accept both, then commit"). Wiring uses plain constructor/factory injection in `app.ts`: no DI container, no base classes, and no generic repository abstraction beyond what chat needs.
  - **Tests per layer:** the service with a small in-memory `MessageRepository` fake defined in its test file (no Socket.IO, no SQLite); the repository against a temporary SQLite file; the controller with a real Socket.IO server on an ephemeral port and `socket.io-client`, using the real service over a `SqliteMessageRepository` on a temporary file, and a stubbed service where a failure must be forced (`server_error`); `app.ts` with raw HTTP requests and stub Next.js handlers; the full application through Playwright E2E (D6).
  - **Layer boundaries enforced by ESLint** (task 1.3), with `no-restricted-imports` scoped per file group (`files`) in `eslint.config.mjs`. The rules may reference files that do not exist yet. Intent:

| Files (production only) | Must not import |
|---|---|
| `src/app/**` | `src/server/**` (accepted user decision above) |
| `src/lib/**` | `src/server/**`, `src/app/**` |
| `src/server/**` | `src/app/**` (from review finding F4; accepted user decision, 2026-09-26; also blocks the composition root `src/server/app.ts` from inside `src/server/`; only `server.ts` and `app.test.ts` import it) |
| `src/server/**/*.service.ts` | `socket.io`, `better-sqlite3`, `*.controller`, `src/server/db/**` |
| `src/server/**/*.repository.ts` | `*.service`, `*.controller`, `socket.io` |
| `src/server/**/*.controller.ts` | `better-sqlite3`, `*.repository`, `src/server/db/**` (accepted user decision above) |

Pattern mechanics (resolution of review findings F1–F4 of this task's round 1; implementation details of the accepted boundary rows, not separate user decisions):

- **Specifiers, not paths (F1).** `no-restricted-imports` matches the import string. `tsconfig.json` defines no `paths` alias, so imports between these folders are relative. A literal `group: ["src/server/**"]` does not match `../server/...`, and `**/server/**` wrongly matches the packages `next/server` and `react-dom/server`. Directory targets therefore use regexes anchored to relative specifiers, file-kind targets match the file-name suffix, and packages are listed by exact name in `paths`. If a path alias is ever added, the alias forms must be added to the same patterns. Concrete forms (JavaScript string literals, as in the checker's probe on ESLint 9.39.5):

```js
const rel = (dir) => ({ regex: `^\\.{1,2}/(?:.*/)?${dir}(?:/|$)` }) // ./x/<dir>, ../<dir>/y, ../../<dir>
const kind = (suffix) => ({ regex: `(?:^|/)[^/]+\\.${suffix}(?:\\.ts)?$` }) // ./chat.controller
// server regex: '^\\.{1,2}/(?:.*/)?server(?:/|$)'; app and db analogous
const noServer = rel('server'), noApp = rel('app'), noDb = rel('db')
const noController = kind('controller'), noService = kind('service'), noRepository = kind('repository')
const pkg = (name) => ({ name }) // exact package name in `paths`, e.g. 'socket.io', 'better-sqlite3'
```

  Each pattern carries a `message` naming the boundary. The `rel('server')` form also matches the root `server.ts` from `src/app/**` (`../../server`), which is intended.
- **One effective option set per file (F2).** In flat config, a later config object that sets `no-restricted-imports` for a file replaces the earlier options for that rule; it does not merge them. The groups `src/server/**` and `src/server/**/*.{service,repository,controller}.ts` overlap, so each narrower group repeats every applicable pattern of the broader one (built from shared arrays, e.g. `[...serverBase, noController, noDb]`) and comes after it. Effective sets:
  - `src/app/**`: `noServer`.
  - `src/lib/**`: `noServer`, `noApp`.
  - `src/server/**`: `noApp`.
  - `*.service.ts`: `noApp`, `noController`, `noDb`; `paths` `socket.io`, `better-sqlite3`.
  - `*.repository.ts`: `noApp`, `noService`, `noController`; `paths` `socket.io`.
  - `*.controller.ts`: `noApp`, `noRepository`, `noDb`; `paths` `better-sqlite3`.
  Task 1.3 checks the effective options with `npx eslint --print-config <file>` for one file per group (this also shows whether `eslint-config-next` sets the rule itself) and runs every red check against the final combined project config, not a scratch config.
- **Production files only (F3).** Every boundary config object has `ignores: ["**/*.test.ts"]`, so tests are not covered: controller tests legitimately use `SqliteMessageRepository` and `openDatabase`, and `app.test.ts` imports `./app`. `e2e/**` and `scripts/**` are outside the boundary groups (the E2E seeding uses the repository directly).
- **Red and green proof.** Task 1.3 proves every restricted target of every row fires with a deliberately violating import (through `npx eslint --stdin --stdin-filename <path>` with the project config, or a temporary file that is removed afterwards) and that allowed imports are not reported: `next/server` and `react-dom/server` from `src/app/**`, `src/lib/chat/schema` from app and server files, the service's `import type` of the repository interface, and a violating import in a `*.test.ts` path.

- **Proposal P11:** `zod` **4.6.5** for the shared schema used by both client and server (single source of the limits in the chat-room spec).
- XSS: messages and nicknames are rendered only as React text children. `dangerouslySetInnerHTML`, Markdown, and auto-linking are not used; an ESLint rule (`react/no-danger`) enforces the first.

### D5. Lint, type check, unit tests, and `npm run check`

- **Accepted (user decision):** a single check command `npm run check` (lint, type check, unit tests, Playwright E2E) that the checker reruns and that is the loop's final gate.
- **Accepted (user decision, 2026-09-26; review finding N8):** remove `next build` from each loop iteration; the full `npm run check` stays the final gate.
- **Proposal P21 — `check:loop` with dev-mode E2E:** iterations run `npm run check:loop` (lint, type check, unit tests, E2E against a dev-mode server), and the full `npm run check` runs once when `check:loop` is green. Alternative considered: skipping E2E in iterations entirely — rejected because most chat behavior is only covered by E2E.
- **Proposal P12:** ESLint flat config (`eslint.config.mjs`) extending `eslint-config-next` 16.3.6 (`core-web-vitals` + `typescript`), on ESLint 9.39.5 and TypeScript 6.0.3 (accepted in D1).
- **Proposal P13:** Vitest 5.0.2 (already pinned) for unit and Node-level integration tests, colocated as `src/**/*.test.ts`, plus `scripts/agent-loop.test.ts` for the loop. Environment `node`; no jsdom in this change (UI behavior is covered by E2E). Each server layer has its own tests (D4): service tests use an in-memory repository fake; repository tests use a temporary SQLite file; controller tests start Socket.IO on an ephemeral port with a temporary SQLite file and connect with `socket.io-client`; `app.ts` tests send raw HTTP requests to the composed server with stub Next.js handlers — no Next.js involved in any of them.
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
- **Seeding:** the 100-message test seeds 105 rows by opening the fixture's DB file with `openDatabase` and inserting through `SqliteMessageRepository` (D4) before starting the server.
- **Modified-client scenarios** (server-side rejection of oversized text or invalid nickname) use `socket.io-client` from the test process against the fixture server.
- **Connection loss:** stop the fixture server → assert the status and disabled send; start it → assert reconnection. **Catch-up while the server stays up** (client B disconnected, A sends): planned with `page.routeWebSocket` on B's page to close and later allow its WebSocket; if that proves unreliable with Socket.IO's transport upgrade, the scenario is covered by a Node-level integration test in `src/server/chat/chat.controller.test.ts` plus the E2E restart test, and the limitation is recorded in that task's evidence (Open question Q12).
- **Host and Origin checks:** Node-level tests (in `src/server/app.test.ts`, against the composed server with stub Next.js handlers) use raw HTTP requests with explicit headers (Node `http.request` for the polling handshake `GET /socket.io/?EIO=4&transport=polling` and for `GET /`, and an HTTP upgrade request for `transport=websocket`), because browser clients cannot set `Host`. Refused: no `Origin` with `Host: evil.example:<PORT>` (the realistic rebinding case) on both transports and for `GET /`; allowed `Host` with `Origin: http://evil.example`, `Origin: null`, or an unparsable value. Accepted: no `Origin` with `Host: 127.0.0.1:<PORT>`; `Host: LOCALHOST:<PORT>`; `Origin: http://localhost:<PORT>`. The browser E2E connection (fixture base URL `http://127.0.0.1:<PORT>`) succeeds.
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

- **Command:** `scripts/session-context.sh` changes to `$CLAUDE_PROJECT_DIR` (falling back to the project root, the parent of `scripts/`) and runs `OPENSPEC_TELEMETRY=0 timeout 10 ./node_modules/.bin/openspec list --json` — the project-pinned CLI binary directly; never `npx --yes`, which could download.
  - **User decision (2026-09-26, task 1.5 round 2):** "1 — напряму через node_modules" ("1 — directly via node_modules"). The command was changed from `timeout 10 npm run --silent openspec -- list --json` because every `npm run` writes and rotates debug logs under `~/.npm/_logs`, which conflicts with the no-side-effects requirement. `OPENSPEC_TELEMETRY=0` is OpenSpec's documented telemetry opt-out: without it, the CLI creates its global config file (`openspec/config.json` with an anonymous id) when none exists, as observed in task 1.5.
- **Output:** on success, stdout (added to context by Claude Code for `SessionStart`):

```
Active OpenSpec changes (from `./node_modules/.bin/openspec list --json`):
{ "changes": [ ... ], "root": { ... } }
```

- **Failure behavior:** on non-zero exit, timeout, empty output, missing `node_modules/.bin/openspec`, or `node` not on `PATH`, print `Active OpenSpec changes could not be loaded (<reason>). Run: npm run --silent openspec -- list --json` and exit 0 (the notice names the npm script because a person runs it manually). The script never writes files, never installs, and discards the CLI's stderr from context (a short reason only).
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
- [Over-engineering for a one-room chat: controller, service, repository, database, and composition-root modules add files, indirection, and tests for a small feature set] → Accepted trade-off (user decision, 2026-09-26): the user prioritized extensibility. Kept lean by D4: feature modules instead of global layer folders, plain factory/constructor injection, no DI container, no base classes, no generic repository.
- [Import-boundary rules can be bypassed or silently stop matching, because `no-restricted-imports` checks import specifiers rather than resolved paths, and a later flat-config object replaces earlier options for the same file] → Relative-anchored regexes and exact package names (D4); overlapping groups repeat all applicable patterns; task 1.3 records `--print-config` output, a failing lint run for each restricted target, and a passing run for allowed imports (including `next/server`) against the final project config; a path alias, if ever added, must be added to the patterns.
- [Moving the task 1.2 dispatchers from `server.ts` to `src/server/app.ts` could change routing between Next.js and engine.io] → The dispatcher code moves unchanged; the existing E2E smoke and startup tests and the new `app.test.ts` must stay green (task 4.2).
- [Risk note from review finding R2-3, not a user decision: after a database reset, rule (b) detects a stale `lastSeenId` only while the new highest id stays below it; once enough new messages exist, a stale client receives `append` and adds new messages to its old list] → Accepted limitation for a local single-instance demo. Mitigation: none now; a server instance or database epoch id in the handshake could be added later.
- [A synchronous `MessageRepository` interface ties the service to synchronous storage] → Accepted: it keeps the history/broadcast ordering argument (D2) simple; an asynchronous repository would require revisiting that argument.

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
- **Q13 — Concrete layered layout. Resolved (user decision, 2026-09-26):** Proposal P23 and the controller boundary row are accepted ("yes, I accept both, commit 1.2", translated), and the detail rules (a)–(e) in D4 are accepted ("ok, that works", translated). Rule (b) added one chat-room spec scenario and, as a further user decision (2026-09-26, translated: "yes, I accept both, then commit"), one sentence in the requirement "Connection status and reconnection"; task 1.3 is no longer blocked.
