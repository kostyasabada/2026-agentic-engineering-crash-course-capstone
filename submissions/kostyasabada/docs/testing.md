# Verification

Automated checks are committed in the project and run with npm scripts from `submissions/kostyasabada/`. Expected behavior is defined in OpenSpec (`openspec/changes/add-realtime-chat-room/specs/`); this file lists how to verify it.

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

Agent-driven browser checks and screenshots (for example, the Codex `playwright` skill or the Claude Code browser) are supplementary manual checks, not a substitute for the automated tests.

## Current and planned coverage

Current tests: server configuration parsing (`src/server/config.test.ts`), the agent loop (`scripts/agent-loop.test.ts`), and two E2E tests (`e2e/smoke.spec.ts`: the page and the Socket.IO handshake are served by the custom server; `e2e/startup.spec.ts`: the server exits with code 1 when its port is in use).

Planned with the chat features (tasks 2–5 of the change add the tests):

- A message sent by one user is received by another independent client.
- History survives a server restart.
- Empty and oversized messages are rejected according to the specification.
- Connection loss is visible to the user; reconnection is checked separately.
- A new client receives the agreed number of recent messages in the correct order.

## Reporting

Record the command, result, date, and a reference to the verified code version. Distinguish OpenSpec structure validation from application behavior tests. For reviews, record findings or explicitly state that no issues were found.

## Setup history

Chromium 153.0.8010.12 and its headless shell were first installed during setup, using an isolated official Node 24.21.0 runtime extracted to `/tmp/node-v24.21.0-linux-x64/` (temporary and machine-local, selected through the command's `PATH`; see `evidence/setup-dev-dependencies/node24-runtime.txt`). That runtime was used for the setup and the tasks up to 2.1; it was removed when `/tmp` was cleaned, so task 3.1 ran with nvm's Node 24.13.1 (recorded in its evidence). On 2026-09-27 the pinned Node 24.21.0 was installed with nvm; it now lives in `~/.nvm/versions/node/v24.21.0/bin`, which is put first on the command's `PATH` (from task 2.2 on). The system `node` is 22.22.1, so the project runtime is still selected explicitly. Chromium passed a static-page launch check with approved execution permissions (the restricted execution sandbox blocked its socket operations); installation and smoke-check results are in `evidence/setup-dev-dependencies/`.
