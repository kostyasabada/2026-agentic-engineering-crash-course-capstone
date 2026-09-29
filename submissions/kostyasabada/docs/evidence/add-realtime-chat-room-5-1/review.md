# Task add-realtime-chat-room-5-1 — checker review

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker.
- Round: 1
- Date: 2026-09-28
- Runtime: Node v24.21.0, npm 11.19.0.
- Base commit: `67ed23e` (`git log --oneline -1`: "feat: add app composition root, host/origin enforcement, graceful shutdown (task 4.2)"). Nothing staged (`git diff --cached --name-only | wc -l` = 0).
- Reviewed snapshot: `snapshot.txt` revision 1 (6 deliverables, 4 supplementary screenshots, `implementation.md`). `checks.txt` reviewed at SHA-256 `7b60692dcb82ba64645b060bf263d9223d58f9dd6df244587dbb6dd333dbf407` (matches the maker's stated final hash). This `review.md` is not part of the snapshot.
- Nothing repaired, staged, committed, or ticked by the checker.

## Read

`AGENTS.md`, `docs/review-process.md`, task 5.1 (and 5.2 for the handoff) in `tasks.md`, `design.md` D1, D4, D6, P20, Q1, the requirement "Nickname entry without registration" and "Character counting" in `specs/chat-room/spec.md`, `src/lib/chat/schema.ts`, all six deliverables in full, `e2e/fixtures/chat-server.ts` (spawn), `e2e/shutdown.spec.ts` (signal tests), `server.ts` (signal handling), `package.json` scripts, `node_modules/tsx/dist/cli.mjs` (tsx 4.23.15, signal relay), the maker's `implementation.md`, `snapshot.txt`, `checks.txt`, and the four PNG screenshots (viewed; they match their descriptions).

## Assessment

### Coverage of task 5.1 (E2E, roles/labels)

Every case of task 5.1 that is observable without a message composer has a meaningful test in `e2e/nickname.spec.ts`, using labels (`getByLabel('Nickname')`), roles (`heading`, `button`, `region`, `form` → `alert`) and visible text:

- valid trimmed nickname accepted and stored trimmed, no `maxlength` (`nickname.spec.ts:46`);
- empty and whitespace-only rejected with message, `aria-invalid`, accessible description (`:56`);
- too long rejected, full text kept, limit message, counter, button disabled, Enter blocked (`:70`); surrounding whitespace not counted, astral letters counted as two units (`:85`);
- disallowed characters (`<script>`, `bob@home`, `a²`, leading U+0301) rejected with the allowed-characters message, text kept (`:100`); combining marks accepted (`:113`);
- remembered after reload (`:119`); changed nickname stored and survives reload (`:128`); invalid change rejected, previous nickname kept in storage, after Cancel and after reload (`:144`); duplicates across two independent contexts (`:167`); invalid stored value ignored (`:186`); localStorage throwing (`:193`).

The console-error check (`afterEach`, `:42`) is effective: the maker's mutation 3b (direct `localStorage` read during render) was killed by `pageerror: Hydration failed` in all 12 tests. Both modes passed with `--repeat-each=3` in my runs (below).

### Correctness

- Shared schema reused: both components import `nicknameSchema` / `NICKNAME_MAX_LENGTH` from `src/lib/chat/schema.ts`; no rule or message text is duplicated in `src/app` (the spec file holds the message strings only as test oracles). The stored value is `result.data` (trimmed) (`nickname-form.tsx`, `handleSubmit`).
- P20: no `maxlength` (grep and E2E), counter of the trimmed length (`value.trim().length`, same trim as zod), limit message shown immediately when over limit and the submit button disabled (`nickname-form.tsx:36`, `:58`), full text kept. Other errors after a confirm attempt, then live.
- SSR safety: `useSyncExternalStore` with server snapshot `undefined` (`chat-room.tsx:53`, `:57`) renders `Loading…` on the server and during hydration; no `window` access during server render; every `localStorage` call is in `try/catch`; invalid stored values are parsed away through the schema. No hydration errors in any run.
- Accessibility: `<label for>`, `aria-invalid` and `aria-describedby` (error + counter) (`nickname-form.tsx:55-56`), error container `role="alert"` (`:71`), forms named via `aria-label` so the tests scope alerts to `getByRole('form')` away from Next's `__next-route-announcer__`.
- Component split per D1/P3: `page.tsx` and `layout.tsx` are Server Components; `'use client'` only in `_chat/chat-room.tsx` and `_chat/nickname-form.tsx`. `src/app/**` imports only React, Next types, `./globals.css`, `./_chat/*` and `../../lib/chat/schema`; `npm run lint` (with the D4 `no-restricted-imports` boundary) exits 0.

### Scope: "later messages only" and duplicate delivery

Task 5.1's text lists "changed nickname applies to later messages only" and "duplicates allowed across two contexts". The attribution of messages (spec scenarios "Nickname is changed", "Duplicate nicknames are allowed", and the "message input enabled/unavailable" and "attributed to `Alice_1`" clauses of "Valid nickname is accepted" / "Empty or whitespace-only nickname is rejected") cannot be observed before the composer of task 5.2 exists. Deferring those parts is acceptable, because the observable parts are covered and the deferral is stated openly in `implementation.md` and in test comments (`nickname.spec.ts:129-130`, `:168`). Because task 5.2's text does not list these scenarios, the coordinator must carry them into the 5.2 handoff (see "5.2 handoff additions") and should mention the deferral when reporting 5.1 as complete.

### Evidence honesty

- Red run genuine: first attempt recorded with exit 141 (SIGPIPE from `head -60`, 10 failures visible, kept); repeated run: 12 failed, each waiting for the heading "Choose a nickname". The red run was recorded against a spec revision two lines shorter (the alert-scoping comment and locator were changed after green attempt 1); the test names and assertions of the failing step are the same, so red-first is valid.
- Green attempt 1 (5 failed, strict-mode violation from the route announcer) and its fix are recorded; attempt 2 12 passed.
- Mutation 3 (server snapshot `null`) survival recorded honestly with a correct explanation (React renders the server snapshot during hydration, then the client snapshot; no mismatch). Mutation 3b is the meaningful SSR mutation and was killed.
- Screenshots are labelled supplementary; the numbers in `implementation.md` match `checks.txt` (shutdown probe: 2/30 and 3/60 with the task, 0/30 and 1/60 at base).

## Findings

| # | Severity | Location | Finding |
|---|---|---|---|
| F1 | low (non-blocking) | `src/app/_chat/nickname-form.tsx:36`; `e2e/nickname.spec.ts` | The documented behavior "non-limit errors appear only after a confirm attempt" is not tested: my mutation `(attempted \|\| overLimit)` → `true` (errors shown while typing) survived (12 passed). The spec only requires a message after confirming, so showing it earlier is not a spec violation; an optional assertion (no alert after typing `bob@home` before Join) would pin the chosen UX. |
| F2 | info | task 5.1 text vs `e2e/nickname.spec.ts:128`, `:167` | Message attribution after a nickname change, delivery of messages from two `Sam`s, and the message-input clauses are deferred to 5.2 (acceptable, see Scope). Must be added to the 5.2 handoff. |
| F3 | info | `e2e/nickname.spec.ts:180` | The second context's console errors are asserted before `other.close()`, so an error emitted after that point would be missed. Negligible for this spec. |
| F4 | info | `docs/evidence/add-realtime-chat-room-5-1/snapshot.txt` | `sha256sum -c snapshot.txt` (uutils coreutils 0.8.0) verifies all 11 entries OK and then panics on the non-entry parenthetical line; filtering with `grep -E '^[0-9a-f]{64}  '` gives exit 0. Tooling quirk, not a content error. |
| F5 | medium, outside 5.1's scope (pre-existing, task 4.2) | `e2e/fixtures/chat-server.ts:57`, `e2e/shutdown.spec.ts:101`, `package.json` `dev`/`start` | `shutdown.spec.ts` is intermittently red in dev mode. Confirmed; see the flakiness probe. Not caused by 5.1 code; not a reason to block 5.1. |

No blocking defect in 5.1's own scope.

## Flakiness probe (maker's open issue 1)

Source check, `node_modules/tsx/dist/cli.mjs` (tsx 4.23.15), function `relaySignals`: on SIGINT/SIGTERM the tsx CLI runs `relaySignalToChild`, which waits in `waitForSignalFromChild` (`setTimeout(()=>o(void 0),30)`, the only occurrence) for the child to report the signal over IPC. If the report does not arrive within 30 ms it re-sends the signal to the child and waits another 30 ms; if it still has not arrived it registers `process.exit(128+signal)` on the child's exit and sends `SIGKILL` to the child. The observed exit codes 130 (SIGINT) and 143 (SIGTERM) match this branch. The dev server's busy event loop makes a >30 ms delay likely; the mechanism is independent of the page code of task 5.1 (the shutdown tests do not render the page).

Runs (dev mode, this task's files present):

- `E2E_SERVER_MODE=dev npx playwright test e2e/shutdown.spec.ts --repeat-each=20`: **4 failed, 56 passed** (exit 1): SIGTERM twice (`"code": 143`), SIGINT twice (`"code": 130`).
- `npm run test:e2e:dev` once: **1 failed** (`shutdown.spec.ts:101` SIGINT), 18 passed (exit 1).
- Prod mode (`npm run check`): 19 passed.

Assessment:

- Pre-existing: yes by mechanism (tsx CLI wrapper from task 4.2's fixture and scripts), and the maker recorded a failure with `src/app` at the base (1 of 90). I did not rerun the base probe myself (limitation). The higher rate with the task (maker 5/90, mine 4/60) is a small sample and plausibly load-related; it is not a 5.1 defect.
- It makes `npm run check:loop` (dev E2E, used by `scripts/agent-loop.sh`) unreliable: roughly one failure every 10–20 full runs, which would feed a fixer a spurious failure unrelated to its task.
- It is also a real robustness issue, not only a test issue: with `npm run dev` / `npm start` (both `tsx server.ts`), Ctrl+C or a group SIGTERM can cut the graceful shutdown short by a re-sent signal or SIGKILL.
- Recommended fix: start the server without the tsx CLI wrapper, i.e. `node --import tsx server.ts` in `spawnServerProcess` (`e2e/fixtures/chat-server.ts:57`, spawn `process.execPath` with `['--import', 'tsx', 'server.ts']`) and in the `dev`/`start` npm scripts, so the signal goes straight to the server's own handler. Asserting only the server child's exit in the test would hide the SIGKILL hazard and is not recommended. Design D6 and `docs/testing.md` say the fixture spawns `tsx server.ts`, so the change needs a small spec/design update first.
- Recommendation: a separate small task (a 4.2 follow-up, e.g. 4.3, with its own maker and checker and the user's agreement since it changes D6 wording and npm scripts) before task 5.2 starts, because 5.2's maker will rely on `check:loop`.

## 5.2 handoff additions

The coordinator should add to task 5.2's handoff (as tests in `e2e/messaging.spec.ts` or `e2e/nickname.spec.ts`):

1. Spec "Nickname is changed": context A joins as `Alice`, sends `first`, changes the nickname to `Alicia`, sends `second`; both A and an independent context B show `first` attributed to `Alice` and `second` attributed to `Alicia`; after reloading A the current nickname is `Alicia` and `first` is still attributed to `Alice`. The composer must read the nickname at send time, not capture it once.
2. Spec "Duplicate nicknames are allowed": two independent contexts both join as `Sam` and each sends a message; both messages are accepted and shown in both contexts, each attributed to `Sam`.
3. Spec "Valid nickname is accepted": after joining with `  Alice_1  `, the message input is enabled and a sent message is attributed to `Alice_1` (trimmed) on another client.
4. Spec "Empty or whitespace-only nickname is rejected": while the nickname form shows the error, no message input is available (absent or disabled).
5. Keep the conventions of 5.1: composer inside the region "Chat"; the per-test console-error check; alerts scoped to their container (Next's route announcer also has `role="alert"`).

## Independent checks (all run by the checker, Node v24.21.0)

| Check | Result |
|---|---|
| Snapshot entries (`grep -E '^[0-9a-f]{64}  ' snapshot.txt \| sha256sum -c`, repo root) | 11 OK, exit 0 (unfiltered `-c` panics after the 11 OK lines, F4) |
| `sha256sum checks.txt` | `7b60692d…f407`, matches the stated final hash |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 8 files, 434 tests passed, exit 0 |
| `npm run build` then `npx playwright test e2e/nickname.spec.ts --repeat-each=3` (prod) | 36 passed, exit 0 |
| `E2E_SERVER_MODE=dev npx playwright test e2e/nickname.spec.ts --repeat-each=3` | 36 passed, exit 0 |
| `npm run check` | exit 0 in 45 s (lint, typecheck, 434 unit, build, 19 E2E passed) |
| `npm run test:e2e:dev` (once) | 1 failed (`shutdown.spec.ts` SIGINT), 18 passed, exit 1 (F5) |
| Shutdown probe, dev, `--repeat-each=20` | 4 failed, 56 passed, exit 1 (F5) |
| `git diff --check` | exit 0 |
| `git diff --no-index --check /dev/null <file>` (calibrated: clean 1, whitespace error 3) | exit 1 (clean) for `e2e/nickname.spec.ts`, `src/app/_chat/chat-room.tsx`, `src/app/_chat/nickname-form.tsx`, `src/app/globals.css`, `implementation.md`, `snapshot.txt`, `checks.txt`; no CR in any changed code file |
| `git status --short` | ` M src/app/layout.tsx`, ` M src/app/page.tsx`, `?? docs/evidence/add-realtime-chat-room-5-1/`, `?? e2e/nickname.spec.ts`, `?? src/app/_chat/`, `?? src/app/globals.css` (plus this `review.md` once written) |
| Processes / port | after all runs: no process matching `server.ts\|next\|playwright\|vitest` (own shells excluded), port 3000 free, no `/tmp/chat-e2e-*` or `/tmp/chat-shots-*` directory |

### Checker mutations (dev mode, `nickname.spec.ts`, each restored and verified by SHA-256)

| # | File | Mutation | Result | Restore |
|---|---|---|---|---|
| C1 | `nickname-form.tsx` | over-limit message only after confirm (`(attempted \|\| overLimit)` → `attempted`) | killed: 2 failed (`:70`, `:85`) | `ac07a078…` matches |
| C2 | `chat-room.tsx` | invalid stored value used (`: null` → `: stored`) | killed: 1 failed (`:186`) | `5ffbc0c8…` matches |
| C3 | `nickname-form.tsx` | counter counts the raw value (`value.trim().length` → `value.length`) | killed: 1 failed (`:85`) | `ac07a078…` matches |
| C4 | `nickname-form.tsx` | `aria-invalid={false}` | killed: 1 failed (`:56`) | `ac07a078…` matches |
| C5 | `nickname-form.tsx` | errors shown while typing (`(attempted \|\| overLimit)` → `true`) | **survived** (12 passed), F1 | `ac07a078…` matches |
| C6 | `chat-room.tsx` | `try/catch` around `localStorage.setItem` removed | killed: 1 failed (`:193`) | `5ffbc0c8…` matches |

Temporary files (`ck-mutate.sh`, backups, calibration files, logs) were in the session scratchpad only; the calibration directory and backups were removed.

## Limitations

- The shutdown flakiness at the base commit was not re-measured by the checker; the "pre-existing" conclusion rests on the tsx source and the maker's recorded base runs.
- Only Chromium (the project's single Playwright project) was exercised; no manual screen-reader check of the `role="alert"` announcement.
- Spec scenarios needing the composer (F2) are not verified in this task.

## Verdict

**accepted** (round 1). The deliverables of task 5.1 meet its criteria within what is observable before the composer; F1, F3, F4 are non-blocking; F2 must be carried into the 5.2 handoff; F5 is a pre-existing task 4.2 issue that should be fixed in a separate task before 5.2.
