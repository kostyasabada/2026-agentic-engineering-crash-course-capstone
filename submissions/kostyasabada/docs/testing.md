# Verification

Automated checks are committed in the project and run with npm scripts from `submissions/kostyasabada/`. Expected behavior is defined in OpenSpec (`openspec/specs/`); this file lists how to verify it.

## Prerequisite

Install Chromium for Playwright once per machine (network access; Playwright's user cache outside the repository; Linux hosts also need Playwright's supported system libraries):

```bash
npm exec -- playwright install chromium
```

Restricted agent sandboxes may block Chromium's socket operations; run E2E tests with approved execution permissions and record that in the task evidence.

## Commands

| Command | What it runs |
|---|---|
| `npm run check` | `lint`, `typecheck`, `test:unit`, then `test:e2e`; stops at the first failing stage. The checker's rerun command and the agent loop's final gate. |
| `npm run check:loop` | `lint`, `typecheck`, `test:unit`, then `test:e2e:dev`; stops at the first failing stage. Faster (no production build); used by each agent loop iteration. |
| `npm run test:unit` | Vitest (`vitest run`, Node environment): `src/**/*.test.ts` and `scripts/**/*.test.ts`. |
| `npm run test:e2e` | `next build`, then Playwright against a production-mode server. Authoritative E2E result. |
| `npm run test:e2e:dev` | Playwright against a development-mode server, without a build. |
| `npm run lint` / `npm run typecheck` | ESLint (including the layer-boundary import rules) / `tsc --noEmit`. |

Every stage runs real checks; none passes with zero tests. The E2E fixture `e2e/fixtures/chat-server.ts` starts its own `node --import tsx server.ts` (the same Node binary as Playwright, in its own process group, so signals reach the server's shutdown handler directly; task 4.3) for each test on a free port with a temporary database path, so no server needs to be running beforehand. Playwright writes `test-results/` and `playwright-report/` (git-ignored). `next build` and `next dev` write separate parts of `.next/`, so `test:e2e` and `test:e2e:dev` can run in either order (task 1.3 evidence).

Dev mode and server restarts: with `npm run dev`, the Next.js HMR client reloads the whole page when it reconnects to a restarted dev server, so a typed but unsent message is lost in dev mode only. The chat itself does not reload: with `npm start` the page reconnects and keeps the typed text. `e2e/connection.spec.ts` therefore withholds the HMR socket's close from the page in dev mode (task 5.3).

Agent-driven browser checks and screenshots (for example, the Codex `playwright` skill or the Claude Code browser) are supplementary manual checks, not a substitute for the automated tests.

## Current coverage

Counts from a run at commit `e5c9a22` (2026-09-30, Node 24.21.0; `npx vitest run --reporter=verbose` and `npx playwright test --list`, recorded in `evidence/add-realtime-chat-room-6-1/checks.txt`). The expected behavior of each case is in the OpenSpec specs; this list only says where it is checked.

Unit and Node integration tests (Vitest, 10 files, 465 tests):

| File | Tests | Covers |
|---|---:|---|
| `src/server/config.test.ts` | 23 | `PORT`/`HOST`/`CHAT_DB_PATH` parsing and invalid values; IPv6 bracketing of the host in URLs. |
| `src/lib/chat/schema.test.ts` | 108 | Shared nickname and message rules: limits, trimming, allowed characters, UTF-16 counting, lone surrogates. |
| `src/server/chat/message.repository.test.ts` | 13 | SQLite repository: `openDatabase`, id order and no reuse, `latest`/`since`, persistence across reopen. |
| `src/server/chat/chat.service.test.ts` | 31 | Chat service with an in-memory repository and injected clock: `postMessage`, `historyFor` `replace`/`append` rules. |
| `src/server/chat/chat.controller.test.ts` | 53 | Socket.IO controller on an ephemeral port: history on connect, broadcast and order, payload rejection, `server_error` on service failure. |
| `src/server/http/host-policy.test.ts` | 116 | Host/Origin allowlist: construction, host normalization, IPv4 shorthand, `isAllowedHost`, `isAllowedOrigin`. |
| `src/server/app.test.ts` | 43 | Composition root with stub Next.js handlers: Host check on requests, Host/Origin at the handshake on both transports, upgrade dispatch, `close()`. |
| `src/app/_chat/merge-messages.test.ts` | 12 | Client message list: merge, dedupe, ordering by id, history `replace`/`append`, `lastSeenId`. |
| `src/app/_chat/send-ack.test.ts` | 19 | Client parsing of send acknowledgements, including malformed ones. |
| `scripts/agent-loop.test.ts` | 47 | Agent loop with fake agents: usage errors, iterations, stop reasons, interrupt, run log, nested Git repository. |

E2E tests (Playwright, Chromium, 8 files, 52 tests):

| File | Tests | Covers |
|---|---:|---|
| `e2e/smoke.spec.ts` | 1 | The custom server serves the chat page and answers the Socket.IO polling handshake. |
| `e2e/startup.spec.ts` | 1 | The server exits with code 1 when its port is in use. |
| `e2e/shutdown.spec.ts` | 3 | Graceful shutdown on `SIGTERM` and `SIGINT` keeps stored messages; prompt shutdown with an unfinished request. |
| `e2e/host-policy.spec.ts` | 2 | The real server refuses a foreign `Host` and closes upgrades nobody owns. |
| `e2e/nickname.spec.ts` | 12 | Nickname entry, validation messages, reload, change, duplicates, unavailable `localStorage`. |
| `e2e/messaging.spec.ts` | 19 | Delivery between independent contexts, order, plain-text rendering, message limits, local `HH:MM` timestamps, nickname attribution and change (including duplicates), rejected and unconfirmed sends, foreign `Origin`. |
| `e2e/connection.spec.ts` | 5 | Connection status, reconnection without reload, catch-up without duplicates, stale `lastSeenId`, server-ended session. |
| `e2e/history.spec.ts` | 9 | Latest 100 of 105 messages, auto-scroll rules (including the own accepted message), empty-room hint, history after restart. |

## Reporting

Record the command, result, date, and a reference to the verified code version. Distinguish OpenSpec structure validation from application behavior tests. For reviews, record findings or explicitly state that no issues were found.

## Setup history

Chromium 153.0.8010.12 and its headless shell were first installed during setup, using an isolated official Node 24.21.0 runtime extracted to `/tmp/node-v24.21.0-linux-x64/` (temporary and machine-local, selected through the command's `PATH`; see `evidence/setup-dev-dependencies/node24-runtime.txt`). That runtime was used for the setup and the tasks up to 2.1; it was removed when `/tmp` was cleaned, so task 3.1 ran with nvm's Node 24.13.1 (recorded in its evidence). On 2026-09-27 the pinned Node 24.21.0 was installed with nvm; it now lives in `~/.nvm/versions/node/v24.21.0/bin`, which is put first on the command's `PATH` (from task 2.2 on). The system `node` is 22.22.1, so the project runtime is still selected explicitly. Chromium passed a static-page launch check with approved execution permissions (the restricted execution sandbox blocked its socket operations); installation and smoke-check results are in `evidence/setup-dev-dependencies/`.
