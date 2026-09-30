# Review: add-realtime-chat-room-6-1

## Phase A (documentation)

### Round 1

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker; fresh context, scoped handoff from the coordinator.
- Date: 2026-09-30. Node: v24.21.0 (`~/.nvm/versions/node/v24.21.0/bin` first on `PATH`).
- Reviewed snapshot: `snapshot.txt` (phase A), base commit `e5c9a22`, working-tree changes to `README.md`, `docs/architecture.md`, `docs/testing.md`, `docs/workflow.md`, `docs/evidence/README.md`, plus `implementation.md` and `checks.txt`. All seven hash lines verify (`sha256sum -c`, exit 0).
- Read: `AGENTS.md`, `docs/review-process.md`, task 6.1 in `openspec/changes/add-realtime-chat-room/tasks.md`, the maker evidence (`implementation.md`, `checks.txt`, `snapshot.txt`), `git diff e5c9a22` for the five documents, and as sources for the changed statements: `design.md` (D2 residual risks, Risks / Trade-offs including R2-3, Open Questions Q8/Q10/Q12), `README.md` run section, `package.json` scripts, `src/server/app.ts`, `src/server/chat/chat.service.ts`, the file layout under `src/`, `add-realtime-chat-room-2-1/loop-run.log`, `add-realtime-chat-room-2-1/review.md` and `implementation.md` (finding 4), `add-realtime-chat-room-4-2/implementation.md` and `review.md` (open point 6), and the test names from Vitest verbose output and `playwright test --list`.

#### Findings

1. **Low, accuracy: `docs/architecture.md:48` says "today only `server.ts` imports it" (`next`).** `src/app/layout.tsx:1` also imports from `next` (`import type { Metadata } from 'next'`). The intended point (no file under `src/server/` imports `next`) is true, but the sentence as written is false for the repository. Suggested wording: "today no file under `src/server/` imports it; `server.ts` does".
2. **Low, accuracy/completeness: `docs/testing.md:60` (`e2e/messaging.spec.ts`) omits part of the file's scope.** 4 of its 19 tests are nickname attribution tests (valid nickname enables the input and attributes messages; no input while the nickname is empty; a changed nickname applies to later messages only, on every client and after a reload; two clients with the same nickname both send), and one checks the `HH:MM` timestamp display. A reader looking for "changed nickname applies to later messages only" would look in the `nickname.spec.ts` row. Suggested: add "timestamps, nickname attribution and change" to the row.
3. **Low, evidence accuracy: `implementation.md:34` says "`openspec/specs/` does not exist".** It exists and contains only `.gitkeep` (tracked; `openspec/changes/archive/.gitkeep` likewise). The conclusion (the `workflow.md:48` statement "stay empty until ... archived" is still true) holds; only the stated reason is wrong.
4. **Informational, no change required: `docs/architecture.md:26` "the npm scripts, including `check` and `check:loop` (P14, P21), which run the server with `node --import tsx server.ts` (task 4.3)".** `dev` and `start` run the server that way directly; `check` and `check:loop` do so only through the E2E fixture. Defensible as written; optionally clarify.

No other inaccuracies found. Verified as accurate:

- Coverage counts: 10 Vitest files, 465 tests, per-file counts 23/108/13/31/53/116/43/12/19/47, 0 failed or skipped; 8 Playwright files, 52 tests, per-file counts 1/1/3/2/12/19/5/9. All match my own runs. The other one-line descriptions match the describe blocks and test titles (for example `hostForUrl` IPv6 bracketing, `lastSeenIdOf`, the nested Git repository test, the smoke handshake assertion).
- Implementation status: tasks 0.1–5.5 are ticked and 6.1 is open (`openspec list --json`: 19/20); every named file exists; `app.ts` has `destroyUpgrade: false`, `serveClient: false`, the Host check on request and upgrade, and the Origin check in `allowRequest`; the service sets `createdAt` from its clock; `dev`/`start` use `node --import tsx server.ts`.
- Limitations: supervisor/PID note matches `README.md:46`; dev-mode HMR note matches `docs/testing.md:28`; Host/Origin residual risks match design D2 (line 61); the stale `lastSeenId` note matches design Risks (R2-3, line 311).
- Open items: task 4.2 numbers the ESLint follow-up "open point 6" (`add-realtime-chat-room-4-2/implementation.md:145,158`; `review.md:199`), so the handoff's "open issue 4" was correctly not used; task 2.1 review finding 4 (`review.md:17,73`) is `changed_files`, deferred by user decision (`implementation.md:82`).
- Open decisions: Q8, Q10, Q12 are still marked open in design.md (lines 329, 331, 333); unchanged section stays accurate.
- `docs/workflow.md:62`: `loop-run.log` footer reads `stop_reason=checks_passed fixer_runs=1 exit=0`.
- `README.md`: status paragraph accurate; it names task 6.1 as the remaining verification; `npm run --silent openspec -- list --json` works (exit 0); run commands unchanged and match `package.json`.
- `docs/evidence/README.md`: the two tense changes keep the historical meaning ("at that time") and do not claim anything new.
- No content lost: the removed architecture bullets are merged into the new ones (the dropped "server.ts is reduced to a thin entry" is now stated as done); the replaced "planned coverage" list is superseded by the tables. Numstat 2/2, 18/8, 2/2, 31/11, 1/1 (54/24). No OpenSpec requirements are copied: the tables say where behavior is checked and point to the specs.
- Proportionality: edits are limited to stale statements plus the requested coverage section.

#### Stale-phrase sweep (independent)

`grep -niE "not yet|planned|does not exist|will be|no application|placeholder" README.md AGENTS.md CLAUDE.md docs/*.md docs/evidence/README.md`: one hit, `docs/evidence/README.md:83` "not yet a user decision at the time of round 1", an explicitly dated historical record; acceptable. A wider sweep (`yet\b|later task|not implemented|being implemented|until|...`) found only still-true statements (`workflow.md:48` specs/archive empty until archiving; `workflow.md:70` Codex not installed, confirmed with `command -v codex` exit 1; `review-process.md:28`, `architecture.md:11`, `evidence/README.md:45` describe rules or decisions).

#### Independent checks (run from `submissions/kostyasabada/`)

| Command | Result |
|---|---|
| `node --version` | v24.21.0 |
| `git log --oneline -1` | `e5c9a22 feat: scroll to own accepted message (task 5.5)` |
| `grep -E '^[0-9a-f]{64}  ' snapshot.txt \| sha256sum -c` (from the repository root) | 7 OK, exit 0 |
| `npx vitest run --reporter=verbose` | exit 0; 10 files, 465 passed; per-file counts as above; 0 failed/skipped lines |
| `npx playwright test --list` | exit 0; `Total: 52 tests in 8 files`; per-file counts as above (listing only) |
| `OPENSPEC_TELEMETRY=0 ./node_modules/.bin/openspec validate add-realtime-chat-room --strict` | `Change 'add-realtime-chat-room' is valid`, exit 0 |
| `OPENSPEC_TELEMETRY=0 ./node_modules/.bin/openspec validate --all --strict` | 1 passed, 0 failed, exit 0 |
| `npm run lint` | exit 0 |
| `npm run --silent openspec -- list --json` | exit 0; 19/20 tasks, in progress |
| Path sanity: every backticked path-like token in the added lines of `git diff e5c9a22 -U0`, tested against the submission root, `docs/`, and `src/app/_chat/` | all resolve except `../architecture.md` and `../../openspec/config.yaml`, which are relative to `docs/evidence/` (the lines are in `docs/evidence/README.md`) and exist there; the maker's 19 unresolved tokens were reviewed and are correctly classified |
| `git status --short` | the five modified documents and `?? docs/evidence/add-realtime-chat-room-6-1/`; nothing staged |
| `git diff --check \| sed 's/ /[SPACE]/g; s/\r/[CR]/g'` | no output, exit 0 |
| `git diff --no-index --check /dev/null <file>` for `checks.txt`, `implementation.md`, `snapshot.txt` | no output, exit 1 each (1 = differs from /dev/null, no whitespace error); each ends with a single newline |
| `ss -ltn \| grep -c ':3000 '`; `pgrep -a '^(node\|next-server)' \| grep -E 'server.ts\|playwright\|vitest\|next build'` | 0 listeners; grep exit 1 (no matching process) |

#### Limitations

- Phase A only: no `npm ci`, `npm run check`, or E2E execution (phase B). Playwright counts come from `--list`, not a run.
- Markdown table rendering was not checked in a viewer.
- Coverage descriptions were compared with test titles and describe blocks, not with every assertion.

#### Verdict

**changes requested** (round 1). Findings 1–3 are low and small wording fixes; finding 4 is informational. Everything else in the snapshot is accurate.

## Phase A — Round 2

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker; same checker as round 1.
- Date: 2026-09-30. Node: v24.21.0.
- Reviewed snapshot: `snapshot.txt` "phase A revision 2" (generated 2026-09-30T13:02:27Z), base commit `e5c9a22`. All seven hash lines verify (`sha256sum -c`, exit 0).

### Resolution of round 1 findings

1. Finding 1 (`docs/architecture.md:48`): **resolved.** The line now reads "today no file under `src/server/` imports it; `server.ts` does". `grep -rlE "from ['\"]next|require\(['\"]next" src/server` finds 0 files; the only `next` imports are `server.ts:1` and `src/app/layout.tsx:1`.
2. Finding 2 (`docs/testing.md:60`): **resolved.** The row now names local `HH:MM` timestamps and nickname attribution and change (including duplicates). This matches the test titles at `e2e/messaging.spec.ts:348,578,592,606,629`; the file still has 19 `test(` calls, so the count of 19 is unchanged.
3. Finding 3 (`implementation.md:34`): **resolved** by an appended correction in its "Round 2" section; the round 1 text stays as it was (append-only). `git ls-files openspec/specs openspec/changes/archive` lists only the two `.gitkeep` files, and `ls -A` shows nothing else, as the correction states.
4. Info note 4 (`docs/architecture.md:26`): **addressed.** It now says that `dev` and `start` run `node --import tsx server.ts` directly, and that `check` and `check:loop` do so through the E2E fixture. This matches `package.json` and `e2e/fixtures/chat-server.ts`.

No new findings.

### Independent checks (round 2)

| Check | Result |
|---|---|
| `sha256sum -c` of the revision 2 hash lines | 7 OK, exit 0 |
| Unchanged since round 1: `README.md`, `docs/workflow.md`, `docs/evidence/README.md` | current hashes equal the round 1 snapshot (`5e4b6d3d...`, `b5e85109...`, `929b3dc1...`) |
| Round 2 edits only on the stated lines | the maker's round 1 copies in the scratchpad hash-match the round 1 snapshot (`7a9ddc76...`, `d497193b...`); `diff` against the current files shows only `26c26` and `48c48` (architecture) and `60c60` (testing) |
| `git diff e5c9a22 --numstat` | 2/2, 18/8, 2/2, 31/11, 1/1 (5 files, +54/−24), unchanged |
| Append-only evidence | for each file, the first N lines hash to its round 1 snapshot hash: `implementation.md` lines 1–46 of 56 (`4f1526d1...`), `checks.txt` lines 1–223 of 296 (`871a965a...`), so both round 1 prefixes are byte-identical |
| `openspec validate add-realtime-chat-room --strict`; `validate --all --strict` | valid, exit 0; 1 passed, 0 failed, exit 0 |
| `npm run lint` | exit 0 |
| `git diff --check \| sed 's/ /[SPACE]/g; s/\r/[CR]/g'` | no output, exit 0 |
| `git diff --no-index --check /dev/null <file>` for `implementation.md`, `checks.txt`, `snapshot.txt`, and this `review.md` after the append | no output, exit 1 each (no whitespace error) |
| `git status --short`; `git log --oneline -1` | five modified documents plus `?? docs/evidence/add-realtime-chat-room-6-1/`, nothing staged; `e5c9a22` |
| Leftover processes | no listener on :3000; no server, Playwright, or Vitest process |

I did not rerun the Vitest and Playwright counts in round 2. No test file changed: HEAD is still `e5c9a22`, and only documentation and evidence files differ from it.

### Limitations

Same as round 1: `npm run check` and the E2E tests are not run in phase A (phase B runs them). Markdown rendering was not checked in a viewer.

### Verdict

**accepted** for phase A revision 2 (round 2). Phase B (clean-checkout verification) is still required before task 6.1 can be completed.
