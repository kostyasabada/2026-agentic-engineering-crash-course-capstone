# Project organization

## Accepted decisions

- The entire project lives in `submissions/kostyasabada/`.
- OpenSpec stores requirements and individual changes.
- The user selected Next.js as the application framework.
- `AGENTS.md` contains concise rules and a reading map; details are read as needed.
- Organize code by responsibility and keep related parts together. Reference: https://nextjs.org/docs/app/getting-started/project-structure.
- The user selected `@playwright/test` (dev dependency) for browser end-to-end tests, committed in the project and runnable with a single command so the checker can rerun them independently. The first OpenSpec change's design must specify the Playwright configuration, test location, how the dev server is started for tests, and the exact run command. Agent-driven browser checks are supplementary, not a substitute.
- The user selected an agent loop: the first OpenSpec change adds `scripts/agent-loop.sh`, which runs the project checks; on failure it passes the failure output to a non-interactive agent run (Claude Code `claude -p` or Codex `codex exec`, selectable) and repeats until checks are green or an iteration limit (default 5) is reached. Each run writes a per-iteration log (iteration number, check result, stop reason) to `docs/evidence/<task-id>/loop-run.log`; at least one real task must run through the loop with its log committed. Ownership (user decision): the task's maker launches the loop; the coordinator does not run it, because the loop changes deliverables. `npm run check` is a deterministic command, not an agent; the loop runs it and the checker reruns it independently. Each fix iteration is a fresh non-interactive agent process with scoped input only (task, failure output, owned files); it acts on the maker's side and is not a checker. The default fixer is Claude Code (`claude -p`), with Codex (`codex exec`) selectable (user decision, 2026-09-26, replacing the earlier Codex default because the Codex CLI is not installed on the working machine); the required checker is a separate Claude Code subagent. An additional review pass of Claude-written code by Codex/ChatGPT is optional and is recorded as evidence only when actually performed. The loop is kept simple (3–4 stop reasons) and per-iteration checks do not run `next build`; the full `npm run check` (lint, type check, unit tests, Playwright E2E with a production build) is the loop's final gate and the checker's rerun command (user decision, 2026-09-26). A green loop does not complete a task: the checker reviews the spec, changes, and `loop-run.log`, reruns checks, and gives the verdict per `review-process.md`; findings return to the same maker, who may rerun the loop. The first change's design must specify the script interface and arguments, agent selection and defaults, iteration limit, stop conditions, log format, permissions for launching agent CLIs from the script, and cost control through the iteration limit.
- The user selected a dynamic context hook: the first OpenSpec change adds a Claude Code `SessionStart` hook in the project `.claude/settings.json` that runs the pinned OpenSpec CLI `list --json` (see `workflow.md`) and injects active changes into session context; a sample of its actual output must be recorded as evidence. The first change's design must specify the hook configuration, command, output, failure behavior, and Codex parity; if Codex has no equivalent mechanism, document the limitation rather than claim parity.

- The user selected Socket.IO as the real-time transport, served together with Next.js by a custom Node server (`server.ts`), over SSE, to keep future messenger features (presence, typing, acknowledgements) possible (2026-09-26). Consequences: some automatic Next.js optimizations are unavailable with a custom server, and deployment requires a regular long-running Node process.
- The user accepted SQLite for message storage, as proposed and without objection; history survives a server restart (2026-09-26).
- The user accepted local deployment as a single Node process, as proposed and without objection (2026-09-26). Limitation: in-process Socket.IO broadcast works for one instance only.
- The user selected TypeScript 6.0.3 and ESLint 9.39.5 to replace the pinned TypeScript 7.0.2 and ESLint 10.11.0, because dependencies of the Next.js ESLint configuration (`typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`) do not support the newer versions (2026-09-26). Applied in task 1.1.
- The user accepted the product defaults proposed in the first OpenSpec change (nickname, message limits, ordering, history, reconnection, plain-text rendering) and the principle that the Socket.IO `Origin` is restricted so a foreign site cannot write to the chat, on 2026-09-26; the requirements live in OpenSpec.
- The user accepted all design proposals P1–P22 of the first OpenSpec change and resolved its open question Q11 (SQLite driver: `better-sqlite3` 13.0.3) on 2026-09-26 (task `add-realtime-chat-room-0-1`). They include Next.js 16.3.6 with the App Router, the Host/Origin allowlist mechanism, and the agent loop's four stop reasons. The details live in `openspec/changes/add-realtime-chat-room/design.md`; the user's reply is in `evidence/add-realtime-chat-room-0-1/decisions.md`.
- The user selected a layered server architecture with controllers, services, and repositories, built for extensibility, and an ESLint `no-restricted-imports` rule that prevents `src/app/**` from importing `src/server/**`, added in task 1.3 (2026-09-26). The user then accepted the concrete layout (Proposal P23: feature modules such as `src/server/chat/` with their own controller, service, and repository, a composition root `src/server/app.ts`, a thin `server.ts`, constructor/factory injection), further layer boundaries enforced by ESLint including the controller row and the reverse rule `src/server/**` ↛ `src/app/**` (from a review finding), and the detail rules for `lastSeenId`, `server_error`, id reuse, and `createdAt` (2026-09-26). Accepted trade-off: more structure than a one-room chat needs. Details: `openspec/changes/add-realtime-chat-room/design.md` (D4).

## Implementation status

Tasks 1.1–5.5 of `add-realtime-chat-room` are implemented; task 6.1 is the final verification from a clean checkout (`evidence/add-realtime-chat-room-6-1/`). Design references in parentheses; requirements are in `openspec/changes/add-realtime-chat-room/specs/`.

- Tooling: pinned dependencies at the accepted versions, including TypeScript 6.0.3, ESLint 9.39.5, and `better-sqlite3` 13.0.3 (D1, P1, P4, P5, P6, P9, P11); `tsconfig.json` (strict), `eslint.config.mjs` with the layer-boundary `no-restricted-imports` rules, `vitest.config.ts`, and `playwright.config.ts` (P2, P12, P13, P15, D4); the npm scripts, including `check` and `check:loop` (P14, P21); `dev` and `start` run the server with `node --import tsx server.ts` directly, and `check` and `check:loop` do so through the E2E fixture (task 4.3); commands and test coverage are in `testing.md`.
- Agent tooling: the agent loop `scripts/agent-loop.sh` (P16, P17, P22; task 2.1 ran through it) and the `SessionStart` hook `scripts/session-context.sh` registered in `.claude/settings.json` (P18); usage is in `workflow.md`.
- Shared schema `src/lib/chat/schema.ts`: nickname and message rules used by the client and the server, including lone-surrogate rejection (D2, tasks 2.1–2.2).
- Server layers (D3, D4, P23): `src/server/db/sqlite.ts` and `src/server/chat/message.repository.ts` (SQLite storage), `src/server/chat/chat.service.ts` (storing messages with a server-assigned `createdAt`, history rules), `src/server/chat/chat.controller.ts` (Socket.IO events, payload validation with the shared schema, acknowledgements), and `src/server/http/host-policy.ts` (Host/Origin allowlist, P19).
- Composition root `src/server/app.ts` (`createApp`: HTTP server, Socket.IO with `destroyUpgrade: false`, request and upgrade dispatchers with the Host check, Origin check at the handshake, `close()`), and the thin entry `server.ts` (environment parsing in `src/server/config.ts`, Next.js App Router, listen, graceful shutdown on `SIGINT`/`SIGTERM`) (D2, D4, P3, P5, P6).
- Chat UI in `src/app/_chat/`: nickname form, message list, composer, connection status, and the `use-chat-socket.ts` hook with `merge-messages.ts` and `send-ack.ts` (tasks 5.1–5.5).

## Limitations

- In-process Socket.IO broadcast works for one server instance only; a custom server loses some automatic Next.js optimizations and needs a long-running Node process.
- A supervisor that signals only npm's PID (for example `npm start` as a container's PID 1) does not reach the server; signal the process group or run `node --import tsx server.ts` directly (task 4.3; `README.md`).
- In dev mode (`npm run dev`), the Next.js HMR client reloads the page when the dev server restarts, so a typed but unsent message is lost in dev mode only (task 5.3; `testing.md`).
- Host/Origin residual risks accepted for a local unauthenticated demo: local non-browser processes can connect with an allowlisted `Host`, other machines are refused unless `HOST` names that address, and only plain HTTP is served (design D2).
- After a database reset, a stale client `lastSeenId` is detected only while the new highest id stays below it (design, Risks / Trade-offs, review finding R2-3).
- `better-sqlite3` is a native addon and may need a C++ toolchain where no prebuilt binary matches.
- The layered layout adds more structure than a one-room chat needs (accepted trade-off).
- The Codex fixer (`codex exec`) and Codex session context are unverified because Codex is not installed here (`workflow.md`).

## Open items

Deferred follow-ups, not scheduled as tasks of the change:

- No ESLint rule prevents `src/server/app.ts` from importing `next`; today no file under `src/server/` imports it; `server.ts` does (task 4.2, maker open point 6, deferred to a separate task).
- The agent loop's `changed_files` log field lists every untracked non-ignored file, not only files created or changed by the fixer run (task 2.1 review finding 4, deferred by user decision).

## Open decisions

The first OpenSpec change's remaining open questions are deferrable and listed in its design: Q8 Codex `SessionStart` parity (evaluated in task 1.5; no automatic injection configured, limitation documented in `workflow.md`), Q10 retention, and Q12 E2E technique for catch-up.

## Context management

Directory structure alone does not reduce reading: the agent selects files based on the task. For example, fixing history involves reading history requirements, storage code, and related tests, followed by any necessary dependencies.

Do not create empty code modules in advance. Add code directories during implementation. Do not copy the entire Next.js documentation into the project.
