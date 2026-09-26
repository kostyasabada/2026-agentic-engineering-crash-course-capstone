# Proposal

## Why

The project exists to deliver a small chat between people, but it has no application yet: no product requirements, no code, and no automated checks. This first change defines the minimum usable chat (one room, a nickname without registration, real-time messages, and the latest 100 messages as history) together with the verification and agent tooling that the user already selected, so that every later task can be implemented red-to-green against one deterministic check command.

## What Changes

Goal: a person opens the app in a browser, chooses a nickname, sees the latest messages, and exchanges messages in real time with other people in the same room; history survives a server restart.

Scope:

- A single shared chat room served by a Next.js application running behind a custom Node server that also hosts Socket.IO.
- Nickname entry without registration, validated on client and server.
- Sending and receiving text messages in real time between independent clients.
- Message persistence in SQLite; a newly connected client receives the latest 100 messages, oldest first.
- Validation and rejection of empty, whitespace-only, and oversized messages and of invalid nicknames.
- Pages and real-time connections served only for the application's own local hosts and origins (protection against foreign sites and DNS rebinding).
- A visible connection status, automatic reconnection, and catch-up of messages missed while disconnected.
- Project tooling needed to verify the above: ESLint, TypeScript type check, Vitest unit tests, `@playwright/test` browser end-to-end tests, a single `npm run check` command, and a faster `npm run check:loop` without a production build for agent-loop iterations.
- `scripts/agent-loop.sh`, which runs the checks and hands failures to a non-interactive fixer agent (`claude -p` by default, `codex exec` selectable) up to an iteration limit, with `npm run check` as its final gate, writing `loop-run.log`.
- A Claude Code `SessionStart` hook in `.claude/settings.json` that injects the active OpenSpec changes into session context.

Non-goals:

- No authentication, accounts, passwords, or nickname reservation.
- No multiple rooms, direct messages, or private conversations.
- No presence list, typing indicators, read receipts, or delivery acknowledgements shown to users (the transport choice keeps these possible later).
- No message editing, deletion, reactions, attachments, rich text, or Markdown rendering.
- No moderation, rate limiting beyond basic payload validation, or spam protection.
- No multi-instance or horizontal scaling, and no hosted or serverless deployment; the app runs locally as a single Node process.
- No history pagination or search beyond the latest 100 messages.

## Capabilities

### New Capabilities

- `chat-room`: the single shared room — nickname entry and validation, sending and real-time delivery of messages, validation failures and character counting, persisted history of the latest 100 messages, connection status, reconnection, catch-up, and restriction of pages and real-time connections to the application's own hosts and origins.
- `agent-loop`: the `scripts/agent-loop.sh` developer tool — running the fast and full check commands, invoking a selectable fixer agent on failure, the iteration limit, stop conditions, and the `loop-run.log` record.
- `session-context-hook`: the Claude Code `SessionStart` hook — injecting the pinned OpenSpec `list --json` output into session context and behaving safely when that command fails.

### Modified Capabilities

None. `openspec/specs/` has no existing capabilities.

## Impact

- New application code under `src/` and a custom server entry `server.ts`; new `scripts/agent-loop.sh`; new `.claude/settings.json`.
- New runtime dependencies (Next.js, React, Socket.IO server and client, a SQLite driver, zod) and additional development dependencies (Next ESLint config, type packages, a TypeScript runner for `server.ts`). Exact versions and the SQLite driver (`better-sqlite3` 13.0.3) in `design.md` were accepted by the user on 2026-09-26 (task 0.1).
- The pinned TypeScript 7.0.2 and ESLint 10.11.0 are replaced by TypeScript 6.0.3 and ESLint 9.39.5 (user decision, 2026-09-26) because dependencies of the Next.js ESLint configuration do not support them; the first tooling task changes `package.json` and `package-lock.json`.
- A local SQLite database file under `data/` (git-ignored) becomes runtime state.
- `package.json` gains `dev`, `build`, `start`, `lint`, `typecheck`, `test:unit`, `test:e2e`, `test:e2e:dev`, `check`, and `check:loop` scripts; `README.md` and `docs/testing.md` will gain commands once implemented, and `docs/architecture.md` records the accepted decisions.
- Deployment requires a regular long-running Node process; serverless platforms are not supported by this design.
