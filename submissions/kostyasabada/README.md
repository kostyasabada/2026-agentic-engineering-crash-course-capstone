# Chat between people

A small educational capstone chat application built using Agentic Engineering practices.

## Current status

Context, OpenSpec, and local development tools are set up. Application code has not been created; application run and test commands are not available yet.

The agreed direction is a chat between people. The initial scope for specification is one room, a nickname without registration, real-time messages, and a history of the latest 100 messages. Detailed behavior will be specified in OpenSpec before implementation.

## Documentation

- `AGENTS.md` — concise rules and a context map.
- `docs/workflow.md` — working with OpenSpec.
- `docs/architecture.md` — project organization and technical decision status.
- `docs/testing.md` — verification approach.
- `docs/evidence/` — factual records of work.

Run all project commands from this directory. Leave course files at the repository root unchanged.

## Local tools

This project requires Node.js 24 and npm 9 or newer. `.nvmrc` pins Node.js 24.21.0. Select that runtime for this project using your existing version manager (for example, `nvm install` and `nvm use` from this directory), or put a project-scoped Node 24 binary first on `PATH` for the commands below. Do not change the system Node installation or a global default. Final setup checks use Node.js 24.21.0 and bundled npm 11.19.0; earlier Node 22 checks are retained only as historical evidence.

```bash
npm ci
npm run openspec -- --version
npm run openspec -- list --json
```

`package.json` pins OpenSpec, TypeScript, ESLint, Vitest, its required Vite peer, and Playwright Test as development dependencies; `package-lock.json` fixes the dependency tree. Vite supports Vitest here; the chosen application framework remains Next.js. Next.js and React will be added after the first OpenSpec design selects their versions and application setup.

To provision the browser for future Playwright tests:

```bash
npm exec -- playwright install chromium
```

Browser downloads require network access and use Playwright's user cache outside the repository. Linux hosts also need Playwright's supported system libraries. Tool installation is separate from an application test suite; see `docs/testing.md` for verification status and `docs/workflow.md` for OpenSpec commands.
