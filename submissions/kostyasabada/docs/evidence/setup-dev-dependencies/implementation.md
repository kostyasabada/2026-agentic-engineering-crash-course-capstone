# Development dependency setup

- Task: `setup-dev-dependencies` (setup work before the first OpenSpec change).
- Maker: Codex subagent `/root/setup_dev_dependencies`.
- Date: 2026-09-26.
- Criteria: install pinned project-local OpenSpec and compatible development tools; preserve generated skills and Claude mappings; document locked setup; verify tool availability and Chromium; do not implement the application, agent loop, hook, or placeholder checks.

## Deliverables

Added a private `package.json` and npm lockfile, with OpenSpec 1.13.2, TypeScript 7.0.2, ESLint 10.11.0, Vitest 5.0.2, Vite 8.3.1, and Playwright Test 1.63.0. Vite is Vitest's explicit required peer and does not replace the accepted Next.js framework. `openspec` is the only npm script. The final project requires Node 24 and npm 9 or newer, with `.nvmrc` pinning Node 24.21.0. The initial checks used the host's Node 22.22.1, but the user's final correction requires project-only migration to Node 24 and supersedes those results. System Node and global runtime settings were not changed.

README, architecture, workflow, and testing documentation distinguish installed executables from absent application configuration and tests. OpenSpec skills remain unchanged; Codex and Claude use the project-local npm script substitution. Root ignore rules already cover `node_modules`, so no redundant ignore file was added. No Next.js/React version, router, transport, or storage was chosen. Existing Claude additions and project ownership rules remain intact.

## Compatibility evidence

`registry.txt` records official npm registry version, engine, and peer metadata for every direct dependency and the current Next.js tooling (consulted only for compatibility, not installed or selected). All selected engine ranges include Node 24.21.0. The consulted Next.js package accepts Playwright `^1.51.1`; its ESLint configuration accepts ESLint `>=9.0.0` and TypeScript `>=3.3.1`. This is setup compatibility evidence, not proof that a future Next.js application or lint configuration works. npm resolved Vitest's required Vite peer with the explicit pinned dependency.

Official documentation also consulted: [ESLint prerequisites](https://eslint.org/docs/latest/use/getting-started) and [Vitest migration requirements](https://vitest.dev/guide/migration/).

## Actual checks

Historical checks on Node 22.22.1 are retained in `install.txt`, `node22-ci.txt`, `node22-checks.txt`, and `node22-browser-smoke-approved.txt`. They passed but are superseded by the final Node 24 checks. The initial sandboxed npm registry query failed with `EAI_AGAIN`; approved network escalation succeeded. The sandboxed browser launch failed with `setsockopt: Operation not permitted` and SIGTRAP (`browser-smoke.txt`); approved browser execution succeeded. These environment failures were not dependency or application test failures.

The official Node 24.21.0 Linux x64 archive was downloaded from `https://nodejs.org/dist/v24.21.0/` into `/tmp` and verified against the SHA-256 entry in official `SHASUMS256.txt` retrieved over HTTPS. Only the per-command `PATH` was changed to use this isolated runtime. `node24-runtime.txt` records the checksum and runtime versions; system Node remains unchanged.

Final checks use `/tmp/node-v24.21.0-linux-x64/bin` first on `PATH`:

- `npm ci`: exit 0; 182 packages added, 183 audited, 0 vulnerabilities. See `ci.txt`.
- All checks exited 0: tool versions, `npm ls --depth=0`, project-local OpenSpec resolution, `npm run --silent openspec -- list --json`, ignore rules, and diff whitespace: see `checks.txt`.
- Chromium and its default headless shell passed with exit 0 under Node 24.21.0: see `browser-smoke-approved.txt`; each opens an in-memory static page, asserts its title and heading, and closes. These are tooling checks, not application E2E tests.

`browser-install.txt` records successful installation of Chromium 153.0.8010.12, its matching headless shell, and FFmpeg into the user cache. No OS packages were installed. Existing specs and active changes contain only directory placeholders.

Exact commands for independent reruns are in `reproduce.md`. Final Node 24.21.0 checks used bundled npm 11.19.0.

## Review scope

`snapshot.txt` contains SHA-256 hashes of all setup deliverables and supporting outputs, relative to the project root. It excludes its own hash and this implementation report, as permitted by the review process. No `node_modules` contents or downloaded browser binaries are included. Separate checker acceptance is pending; this maker report is not a completion verdict.

## Limitations

Application lint, type checking, unit tests, E2E tests, and `npm run check` do not exist and were not run. The first OpenSpec change must specify and implement them, the agent loop, and the dynamic context hook. Runtime skill discovery in a new Codex or Claude session remains unverified. npm's zero-vulnerability report reflects the registry audit at installation time, not a security review.
