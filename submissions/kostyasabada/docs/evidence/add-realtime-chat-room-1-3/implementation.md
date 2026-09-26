# Implementation: add-realtime-chat-room-1-3

## Task

Task 1.3 in `openspec/changes/add-realtime-chat-room/tasks.md`. Acceptance criteria:

1. `check` and `check:loop` scripts exactly as in design D5.
2. Both fail fast: a lint error introduced in a temporary file makes both exit non-zero; green runs recorded with durations.
3. Running `test:e2e:dev` after `test:e2e` (and the reverse) does not break either run's build output; a separate `distDir` only if needed.
4. The layer-boundary `no-restricted-imports` rules of design D4 in `eslint.config.mjs`: every row of the boundary table (including `src/app/**` ↛ `src/server/**`, `src/server/**` ↛ `src/app/**`, and the controller row), the concrete pattern forms of D4, overlapping groups repeating every applicable pattern, and `ignores: ["**/*.test.ts"]` on every boundary config object.
5. Red-first against the final combined project config: one failing lint run per restricted target of each row; `npx eslint --print-config <file>` for one file per group; passing runs for the allowed imports (`next/server`, `react-dom/server` from `src/app/**`; `src/lib/chat/schema` from app and server paths; the service's `import type` of the repository; a controller-to-repository import in a `*.test.ts` path).
6. Verify: `npm run check` and `npm run check:loop` exit 0 on the final snapshot, and `npm run lint` exits 0 on the existing code.

## Maker

Claude Code general-purpose subagent (maker), spawned by the coordinator with a scoped handoff and no full conversation history. Nothing staged or committed; the task checkbox is not ticked.

Runtime: Node v24.21.0, npm 11.19.0 (`PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH`), base commit `af400e4`.

## Changes

- `package.json`: added the two scripts verbatim from design D5, after `test:e2e:dev`; no dependency changes:
  - `"check": "npm run lint && npm run typecheck && npm run test:unit && npm run test:e2e"`
  - `"check:loop": "npm run lint && npm run typecheck && npm run test:unit && npm run test:e2e:dev"`
- `eslint.config.mjs`: the D4 helpers `rel(dir)`, `kind(suffix)`, `pkg(name)` with the exact regex strings of D4 (each pattern carries a `message` naming the boundary), a `boundary(files, patterns, paths)` factory that always sets `ignores: ['**/*.test.ts']`, and six boundary config objects placed after the Next.js presets and before `globalIgnores`, each with a one-line comment. Effective option sets (confirmed with `--print-config`, see Checks):

| Files | `patterns` | `paths` |
|---|---|---|
| `src/app/**` | `rel('server')` | — |
| `src/lib/**` | `rel('server')`, `rel('app')` | — |
| `src/server/**` | `rel('app')` (`serverBase`) | — |
| `src/server/**/*.service.ts` | `rel('app')`, `kind('controller')`, `rel('db')` | `socket.io`, `better-sqlite3` |
| `src/server/**/*.repository.ts` | `rel('app')`, `kind('service')`, `kind('controller')` | `socket.io` |
| `src/server/**/*.controller.ts` | `rel('app')`, `kind('repository')`, `rel('db')` | `better-sqlite3` |

  The three file-kind objects come after `src/server/**` and spread `serverBase`, because a later flat-config object replaces the rule options of an earlier one (D4, F2). No placeholder source files were created; the patterns reference paths that do not exist yet.

No `distDir` change: the collision check showed it is not needed (see Checks).

## Deviations

- None from the D4/D5 definitions. Maker choices within them: the boundary messages' wording, and the `boundary()`/`serverBase` helpers (D4 suggests shared arrays such as `[...serverBase, noController, noDb]`).
- After the first `--print-config` run, the `socket.io` and `better-sqlite3` messages were reworded (the first text claimed "only controllers and the composition root may use socket.io" and "only db and repositories may use better-sqlite3", which says more than the table enforces). The first output is kept in `checks.txt` with a note; all red/green runs and the final `--print-config` use the final text.

## Snapshot

`snapshot.txt` in this directory: SHA-256 of `package.json`, `eslint.config.mjs`, this file, and `checks.txt`, base `af400e4`.

## Checks (all in `checks.txt`, with commands, output, and measured exit codes)

- `npm run lint` on the existing code with the new config: exit 0 (first entry after the Node version, and again before the snapshot).
- `npx eslint --print-config` for `src/app/page.tsx`, `src/app/_chat/chat-room.tsx`, `src/lib/chat/schema.ts`, `src/server/config.ts`, `src/server/app.ts`, `src/server/chat/chat.service.ts`, `src/server/chat/message.repository.ts`, `src/server/chat/chat.controller.ts`: each shows exactly the effective set in the table above. For `*.test.ts` paths, `server.ts`, `e2e/**`, and `vitest.config.ts` the rule is `null` (not set), and `eslint-config-next` does not set `no-restricted-imports` itself (print-config and a grep of its `dist`).
- Red runs (helper `lint-import.sh`, stdin with `--stdin-filename`, no file written): 33 violating imports across the six rows, every one reported with `no-restricted-imports`, the expected message, and ESLint exit 1:
  - `src/app/**`: `../server/config`, `../server/chat/chat.service`, `../server/app`, root `../../server` (from `page.tsx`); `../../server/config`, `../../server/db/sqlite`, `../../server` (from `_chat/chat-room.tsx`).
  - `src/lib/**`: `../../server/config`, `../../server/chat/chat.service`, root `../../../server`, `../../app/page`, `../../app/_chat/merge-messages`.
  - `src/server/**`: `../app/page`, `../app/_chat/chat-room`, `./app` (composition root) from `config.ts`; `../app` and `../../app/page` from `http/host-policy.ts`.
  - service: `socket.io`, `better-sqlite3`, `./chat.controller`, `../db/sqlite`, plus the repeated `../app`, `../../app/page`.
  - repository: `./chat.service`, `./chat.controller`, `socket.io`, plus `../app`, `../../app/page`.
  - controller: `better-sqlite3`, `./message.repository`, `../db/sqlite`, plus `../app`, `../../app/page`.
- Green runs (ESLint exit 0): `next/server`, `react-dom/server`, `next/navigation`, `react`, `../lib/chat/schema` from `src/app/page.tsx`; `../../lib/chat/schema`, `./server-status` (no false positive on a `server` prefix), `socket.io-client` from `src/app/_chat/`; the schema from `src/server/config.ts`, the service, the repository, and the controller; the service's `import type` of `./message.repository`; the repository's `better-sqlite3` and `../db/sqlite`; the controller's `socket.io` and `./chat.service`; `src/server/app.ts` importing every layer; `chat.controller.test.ts` importing `./message.repository`, `../db/sqlite`, `better-sqlite3`; `chat.service.test.ts` importing `./chat.controller` and `socket.io`; `app.test.ts` importing `./app`; root `server.ts` importing `./src/server/app`; `e2e/fixtures/` importing the repository and db. A follow-up run without `--no-warn-ignored` showed these stdin paths are really linted (an unused variable is reported), so the passes are not caused by ignored files.
- Fail fast (temporary files in `src/app/`, removed afterwards, `git status` recorded before and after):
  - lint error (`src/app/_boundary-probe.ts` importing `../server/config`): `npm run check` exit 1 (2 s) and `npm run check:loop` exit 1 (1 s); output ends after the lint stage, no `typecheck`/`test:unit`/E2E stage started.
  - additionally a type error (`src/app/_type-probe.ts`): both exit 2 after lint passed and `tsc` failed; no `test:unit` stage started.
- Green: `npm run check` exit 0 in 9 s; `npm run check:loop` exit 0 in 8 s (23 unit tests, 2 E2E tests each).
- Build output collision (fingerprints of `.next/` excluding `dev/` and `cache/` = `next build` output, and of `.next/dev/` excluding `cache/` = `next dev` output, helper `next-fingerprint.sh`):
  - Order 1: `npm run test:e2e` (exit 0) left the dev tree fingerprint unchanged; `npm run test:e2e:dev` (exit 0) left the prod tree fingerprint and `BUILD_ID` unchanged; `npx playwright test` in prod mode without a rebuild then passed (exit 0).
  - Order 2: from an empty `.next` (`rm -rf .next`, generated and git-ignored): `npm run test:e2e:dev` (exit 0) created only the dev tree; `npm run test:e2e` (exit 0) created the prod tree and left the dev fingerprint unchanged; `npm run test:e2e:dev` again passed (exit 0) and left the prod fingerprint unchanged.
  - Result: `next dev` and `next build` write disjoint trees (`.next/dev` vs. the rest of `.next`); neither breaks the other, so no separate `distDir` is used.
- No server processes left and port 3000 free at the end (recorded).
- Whitespace: `git diff --check` for tracked files and `git diff --no-index --check /dev/null <file>` for each new untracked file, with a calibration run (recorded at the end of `checks.txt`).

## Limitations

- Durations are whole seconds from `date +%s` and depend on this machine and on warm caches (`.next/cache`, Turbopack); the first order-2 build started from an empty `.next`.
- The boundary rules match relative specifiers only (D4): an alias or an absolute specifier would bypass them until the alias forms are added. Regexes are case-insensitive by ESLint's default, so `./Server/x` from `src/app/**` is also reported; this is stricter than needed, not weaker. A file named `server.ts` or a folder named `server`/`app`/`db` inside another layer's own tree is also matched by the directory regexes (for example `src/app/_chat/server/x` from `src/app/**`); no such path exists or is planned in D4.
- `next-env.d.ts` (git-ignored) is rewritten by both `next dev` and `next build`; it was not fingerprinted. `tsconfig.json` includes both `.next/types` and `.next/dev/types`, and the green typecheck ran after both modes.
- Two early trial runs of the first draft of `lint-import.sh` were not captured by the log; a note in `checks.txt` describes them, and all cases were rerun and recorded with the final helper.
- The first process check used a `pgrep` pattern that matched the recording shells themselves; it was corrected and rerun (both recorded).
