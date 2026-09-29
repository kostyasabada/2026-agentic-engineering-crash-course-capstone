# Chat between people

A small educational capstone chat application built using Agentic Engineering practices.

## Current status

The first OpenSpec change, `add-realtime-chat-room` (one room, a nickname without registration, real-time messages, and a history of the latest 100 messages), is being implemented. Its tooling tasks are in place: pinned dependencies, lint, type check, unit and E2E test commands, the custom Node server (`server.ts`) that serves a placeholder Next.js page and answers the Socket.IO handshake, the agent loop script, and the Claude Code `SessionStart` hook. The chat features themselves (nickname, messages, storage, history) are not implemented yet. Requirements and remaining tasks live in `openspec/changes/add-realtime-chat-room/`; `npm run --silent openspec -- list --json` shows progress.

## Documentation

- `AGENTS.md` — concise rules and a context map.
- `docs/workflow.md` — working with OpenSpec, the agent loop, and the session context hook.
- `docs/architecture.md` — project organization and technical decisions.
- `docs/testing.md` — check and test commands.
- `docs/evidence/` — factual records of work.

Run all project commands from this directory. Leave course files at the repository root unchanged.

## Local tools

This project requires Node.js 24 and npm 9 or newer. `.nvmrc` pins Node.js 24.21.0. Select that runtime for this project using your existing version manager (for example, `nvm install` and `nvm use` from this directory), or put a project-scoped Node 24 binary first on `PATH` for the commands below. Do not change the system Node installation or a global default. Final setup checks use Node.js 24.21.0 and bundled npm 11.19.0; earlier Node 22 checks are retained only as historical evidence.

```bash
npm ci
npm run openspec -- --version
npm run openspec -- list --json
```

`package.json` pins every dependency to an exact version and `package-lock.json` fixes the dependency tree: Next.js, React, Socket.IO, `better-sqlite3`, zod, and tsx for the application; OpenSpec, TypeScript, ESLint, Vitest (with its required Vite peer), and Playwright Test for development. `better-sqlite3` is a native addon; if no prebuilt binary matches the platform, `npm ci` needs a C++ toolchain. Browser tests also need Chromium once per machine; see `docs/testing.md`.

## Running the application

Development server (on-demand compilation, no build step):

```bash
npm run dev
```

Production build and server:

```bash
npm run build
npm start
```

Both run `node --import tsx server.ts` (a single Node process with the tsx TypeScript loader) and print `> Ready on http://127.0.0.1:3000 (development)` or `(production)`; open that address in a browser and stop the server with Ctrl+C, which reaches the server's graceful shutdown (`> Received SIGINT, shutting down`, `> Server closed`); npm then reports the interrupt (exit status 130) even though the server itself exited with 0. Ctrl+C in a terminal signals the whole process group, so the server shuts down gracefully; a supervisor that signals only npm's PID (for example `npm start` as a container's PID 1) does not reach the server, which keeps running, so signal the whole process group or run `NODE_ENV=production node --import tsx server.ts` directly under the supervisor. `npm start` needs a prior `npm run build`. The server reads `PORT` (default `3000`) and `HOST` (default `127.0.0.1`) from the environment and exits with an error for an invalid value or a port that is already in use. The server stores chat messages in the SQLite file `CHAT_DB_PATH` (default `data/chat.sqlite`, relative to the working directory and git-ignored; the parent directory is created if missing).
