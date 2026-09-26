# Review: add-realtime-chat-room-layered-arch

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker.
- Round: 1.
- Date: 2026-09-26.
- Reviewed snapshot: `snapshot.txt` in this directory (base commit `36275d4`; six working-tree files with SHA-256 hashes; `sha256sum -c` passed for all six, see Independent checks). Task 1.2 code files are not in scope; only `server.ts` was read, to judge the plan's fit.
- Inputs read: `AGENTS.md`, `docs/review-process.md`, `implementation.md`, `checks.txt`, `snapshot.txt`, `git diff 36275d4` of `design.md`, `tasks.md`, `docs/architecture.md`, `docs/evidence/README.md`, and `tsconfig.json`, `eslint.config.mjs`, `server.ts` (working tree, for context).

## Summary

The change records the two user decisions of 2026-09-26 accurately, with date and source, and keeps the concrete layout as Proposal P23, pending confirmation through Q13, which blocks task 1.3. Old module names appear only in traceability notes that say they were replaced (design.md:55, :87, :94). D2–D6, Risks, and tasks 1.3/3.1/3.2/4.1/4.2 agree with each other. Ticked tasks 0.1 and 1.1 are unchanged and not renumbered. The only other tick (1.2) is the coordinator's separate task 1.2 change. Specs and proposal are unchanged, and they need no change: the spec requirement "Server-assigned ordering and timestamps" (spec.md:112) is still met with `createdAt` assigned by the service. The layering is sound and proportionate. Findings are non-blocking. The most useful ones are about ESLint pattern mechanics, which I verified with probes.

## Findings

| # | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|
| F1 | Medium (non-blocking; plan caveat at design.md:140 already exists) | design.md:134–138 | The boundary table writes targets as repository paths (`src/server/**`, `src/app/**`, `src/server/db/**`). `no-restricted-imports` matches the import string. I probed this on ESLint 9.39.5 with a scratch config (not in the project). The literal `group: ['src/server/**']` does **not** report `../server/chat/chat.service` or `../../server/chat/chat.service` from `src/app/**` (exit 0). The globstar form `**/server/**` does catch them, but it also falsely reports `next/server` and `react-dom/server` (exit 1). `next/server` is a normal Next.js import. The planned passing run for allowed imports (tasks.md:13) would not reveal this false positive. A relative-anchored regex worked in the probe: `{ regex: '^\\.{1,2}/(?:.*/)?server(?:/\|$)' }` reported both relative forms and `../server`, and allowed `next/server` and `../lib/chat/schema`. `*.controller`, `*.repository`, `better-sqlite3`, and `**/db/**` (or `**/db/*`) did catch `./chat.controller`, `./message.repository`, and `../db/sqlite` as intended. | In D4, or in the task 1.3 handoff, state that the table is intent. Anchor directory targets to relative specifiers, for example the regex above, with an analogous one for `app`. Add `next/server` (and a package subpath such as `react-dom/server`) to the task 1.3 "passing run for allowed imports". |
| F2 | Medium (non-blocking) | design.md:130–140, tasks.md:13 | In flat config, a later config object that sets `no-restricted-imports` for the same file **replaces** the earlier options; it does not merge them. Probe: with a `src/server/**` group forbidding `**/app/**` followed by a `src/server/**/*.service.ts` group, `import '../../app/page'` in a service was **not** reported (exit 0). The current five groups do not overlap, so today's table works. Any future broader group, such as the dependency-direction claim that server must not import app (design.md:128), would silently disable the narrower rows, or be disabled by them. | Note this in D4 or in task 1.3: overlapping file groups must repeat all patterns (for example a shared array spread into each group). The per-row red runs of task 1.3 must be run against the final combined config. |
| F3 | Low | design.md:140 (sentence on test files), tasks.md:29 | "Test files (`*.test.ts`) are covered by the same rules as the files next to them" does not follow from the globs: `src/server/**/*.controller.ts` does not match `chat.controller.test.ts` (probe: `import './message.repository'` in that test path was not reported, exit 0). If test files were covered, the controller tests required by task 4.1 would violate the controller row, because they use the real `SqliteMessageRepository` and `openDatabase`. The design allows exceptions, but the sentence as written is inaccurate. | Say explicitly that the layer rows apply to production files only (tests excluded by the globs), or list the controller-test exception. |
| F4 | Low | design.md:128 | "`src/app/**` (browser) and `src/server/**` share only `src/lib/**`" describes two directions, but the table enforces only app ↛ server and lib ↛ server/app; server ↛ app is not enforced. | Either add a `src/server/**` ↛ app row (mind F2) or reword to what is enforced. |
| F5 | Low (labelling/flagging) | design.md:122, :138, :87; tasks.md:24, :29; design.md:299 | The maker additions beyond the handoff are inside P23, so they are labelled as proposals, not as user decisions: the controller boundary row (design.md:138), an invalid `lastSeenId` treated as absent (design.md:122, tasks.md:29), the `server_error` ack test (tasks.md:29; the error code itself already existed in the D2 contract at design.md:69), ids never reused after deleting the newest row (tasks.md:24), and `createdAt` moved to the service (design.md:87). Only the controller row is called out as a maker addition, and only in `implementation.md`. Q13 (design.md:299) asks the user to confirm "the boundary table in D4" but does not list these items. The user can therefore confirm them without noticing them. | When the coordinator asks Q13, list these five items explicitly (or have Q13 enumerate them). Nothing in the design mislabels them as user decisions. |
| F6 | Info | design.md:123 | The service imports the repository interface with `import type` from `message.repository.ts`, which also contains `SqliteMessageRepository`. This is erased at compile time and allowed by the service row, so it is fine. A separate interface file would be the fallback if `verbatimModuleSyntax` or a stricter rule is ever enabled. | None required. |

## Soundness notes (no finding)

- Dependency direction (controller → service → repository interface; `app.ts` as the only composition root; plain factory injection, no DI container or base classes) fits the user's principle and stays lean. Feature modules instead of global layer folders keep the file count small.
- Each layer is independently testable as planned: service with an in-memory fake and injected clock (3.2), repository on a temporary SQLite file (3.1), controller over real Socket.IO with the real service plus a failing stub (4.1), `app.ts` with stub Next.js handlers and raw HTTP (4.2), and E2E. Red-first and named checks (`npm run test:unit` red run, `npm run check`, lint rules) are kept in every task.
- Moving the task 1.2 dispatchers into `app.ts` with injected `handleRequest`/`handleUpgrade` fits `server.ts` as it exists: its two dispatchers are already marked as the single insertion points, and `app.ts` not importing `next` makes Host/Origin tests possible without a build. The E2E smoke tests are kept as a regression guard (tasks.md 4.2).
- The ordering argument still holds: with a synchronous repository and service, the controller joins the room and reads history in one tick, and `postMessage` stores before the controller broadcasts. The Risks section records that an asynchronous repository would reopen this.
- Proportionality: more structure than a one-room chat needs, but it is recorded as an accepted trade-off that the user prioritized. No over-engineering beyond that was found; `db/sqlite.ts` as a separate module is justified by E2E seeding and future repositories.

## Independent checks (run by the checker, Node v24.21.0, 2026-09-26)

- `sha256sum -c` on the six snapshot entries (from repository root): all `OK`, exit 0.
- `npm run --silent openspec -- validate add-realtime-chat-room --strict`: "Change 'add-realtime-chat-room' is valid", exit 0.
- `npm run --silent openspec -- validate --all --strict`: 1 passed, 0 failed, exit 0.
- `npm run --silent openspec -- status --change add-realtime-chat-room --json`: `isPlanningComplete` true; proposal, specs, design, tasks `done`; exit 0.
- `grep -rn 'message-store\|socket-handlers\|src/server/host-policy\|message store'` over `openspec/`, `docs/architecture.md`, `docs/testing.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/workflow.md`: three hits, all traceability notes at design.md:55, :87, :94. No stale references.
- `git diff --stat 36275d4 -- specs proposal.md`: empty (unchanged).
- `git diff --check`: exit 0.
- `git status --short`: matches the maker's recorded list (4 modified planning/doc files plus `package.json`, and the untracked task 1.2 files and evidence directories).
- `git log --oneline -1`: `36275d4 chore: switch to TypeScript 6 and ESLint 9, install app dependencies (task 1.1)`.
- ESLint probes (for F1–F3): `npx eslint -c <scratchpad config> --stdin --stdin-filename <path>` with only the TypeScript parser and `no-restricted-imports` groups. The scratch configs are in the session scratchpad, outside the project; no project file was modified. Results are quoted in the findings.

## Limitations

- The ESLint probes used standalone scratch configs, not the project's `eslint.config.mjs` combined with `eslint-config-next`. I did not check whether `eslint-config-next` sets `no-restricted-imports` itself: its package is compiled under `dist/`, and a grep for the rule name found nothing.
- The user's original messages were not seen; the quotes are as relayed by the coordinator.
- No application code, lint, or tests were run for the project (planning-only change).

## Verdict

**accepted** (round 1). F1–F5 are non-blocking. F1–F3 should be folded into D4 or the task 1.3 handoff when Q13 is resolved (Q13 already requires updating D4 and tasks before task 1.3). F5 should be relayed to the user with Q13.

## Round 2

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker (same checker as round 1).
- Date: 2026-09-26.
- Reviewed snapshot: `snapshot.txt` revision 2 (base commit `3b12640`; seven files: `design.md`, `tasks.md`, `specs/chat-room/spec.md`, `docs/architecture.md`, `docs/evidence/README.md`, `implementation.md`, `checks.txt`). `sha256sum -c` passed for all seven. This `review.md` is not part of the snapshot.
- Inputs read: the Round 2 sections of `implementation.md` and `checks.txt`, `snapshot.txt`, and `git diff 3b12640` of the five planning/doc files. `git show --stat 3b12640` confirms that task 1.2's commit touched only the 1.2 tick among this task's files.
- User decisions, as relayed by the coordinator: "так, приймаю обидва, коміть 1.2" accepts P23 and the controller row; "ок підходить" accepts rules (a)–(e). For (c), the coordinator's shorthand refers to the existing D2 ack shape.

### Resolution of round-1 findings

| # | Status | Evidence |
|---|---|---|
| F1 | Resolved | D4 now presents the table as intent, explains that the rule matches specifiers, not paths, and gives concrete `rel()`/`kind()`/`pkg()` forms (design.md:138–160). Task 1.3 adds `next/server` and `react-dom/server` to the allowed-imports run. Re-probed against a scratchpad copy of the **real** `eslint.config.mjs` (with `eslint-config-next`, import specifiers made absolute) plus the six D4 boundary objects exactly as specified. All 21 intended violations failed with the expected message, covering every restricted target of every row. All 10 allowed cases passed: `next/server`, `react-dom/server`, `../lib/chat/schema` from app, schema plus `import type` of `./chat.service` from the controller, the service's `import type` of the repository, controller test importing repository and db, `src/server/app.ts` importing all layers, `app.test.ts` importing `./app`, root `server.ts` importing `./src/server/app`, and `./chat.service.helpers` from a service. Linting the whole existing project with this config exited 0. |
| F2 | Resolved | D4 documents that a later object replaces earlier options and lists the effective set per group; narrower groups repeat `noApp` and come later. `--print-config` on the scratch copy showed the service's merged option set as specified. `--print-config` on the real project config shows that `eslint-config-next` does not set `no-restricted-imports` (value `None` for an e2e file). Task 1.3 requires `--print-config` per group and red runs against the final project config. |
| F3 | Resolved | Every boundary object carries `ignores: ["**/*.test.ts"]`. The probe confirmed that a controller test importing the repository and db is not reported. Task 1.3 includes this passing case. |
| F4 | Resolved | Reverse row `src/server/**` ↛ `src/app/**` added (design.md:142); the dependency-direction sentence now says "both directions" (design.md:134). The regex also blocks `./app` and `../app` inside `src/server/` (probe: red). It does not block legitimate imports: root `server.ts` is outside the group, `app.test.ts` is ignored, and `app.ts`'s own imports (`./chat/*`, `./db/sqlite`, `./http/host-policy`, `./config`) do not match. Nothing under `src/server/` needs to import `app.ts` in the plan. |
| F5 | Resolved | P23, the controller row, and rules (a)–(e) are labelled **Accepted (user decision, 2026-09-26)** with translated quotes: design.md:16 (Labels paragraph), :73 (D2), :87 (D3), :95 and the D4 detail-rules bullet, and :329 (Q13 resolved). They are also recorded in `architecture.md` and `evidence/README.md`. Round-1 text is kept as history ("not yet a user decision at the time of round 1"). |
| F6 | No change needed | — |

### Other verification

- New spec scenario (spec.md:178) is consistent with D2 (design.md:73) and with service rule (b): `lastSeenId` greater than the highest id → `replace` with the latest up to 100; an empty store → `replace []`. `openspec validate --strict` passes. See R2-2 on the requirement text.
- Test placement for (a)–(e):
  - (a) invalid `lastSeenId`: controller task 4.1, including non-integer, negative, fractional, `null`, and string values.
  - (b) `lastSeenId` greater than the highest id: service task 3.2 (with the empty-store case), controller task 4.1, and E2E task 5.3 with a recorded Node-level fallback.
  - (c) `server_error`: controller task 4.1, with a stubbed throwing service, the D2 ack shape, no broadcast, and the server still serving afterwards.
  - (d) ids never reused: repository task 3.1 (insert, delete newest, insert).
  - (e) `createdAt` from the injected clock: service task 3.2.
  Red-first and named checks are kept in each task.
- Coherence:
  - Q13 is resolved, and task 1.3's precondition is removed.
  - `architecture.md` Open decisions no longer mentions Q13.
  - No "pending user confirmation" or "blocks task 1.3" text remains (grep exit 1).
  - Old module names appear only in traceability notes (design.md:55, :87, :94, :95).
  - Ticked tasks 1.1 and 1.2 are unchanged; nothing newly ticked.
  - The proposal is unchanged.
- Rule (b) uses `latest(1)` inside the synchronous `historyFor`, so the single-tick ordering argument of D2 still holds.

### New findings (round 2)

| # | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|
| R2-1 | Low | design.md:142, :134; design.md:16 | The reverse row `src/server/**` ↛ `src/app/**` (from round-1 F4) and the pattern mechanics appear after the user-accepted P23 bullet, but they are not labelled. The Labels paragraph lists only P23, the controller row, and (a)–(e) as user-accepted. The review cannot tell whether the user saw the reverse row before "yes, I accept both". It is a lint-only rule that follows from P23's dependency direction, so it adds no feature scope. | Label the reverse row and the pattern mechanics as a proposal from review finding F4 (or state that the coordinator presented it), or mention it to the user in the next report. Non-blocking. |
| R2-2 | Low | spec.md:158–160 vs. :178 | The requirement text covers missed messages and "more than 100 missed", but not a last-seen id newer than the server's history. The new scenario therefore tests behavior the SHALL text does not state. It is not strictly the "latest 100 instead" clause: nothing was missed, the list is still replaced. | Optionally add one sentence to the requirement, e.g. "If the client's last seen message is newer than the server's newest message, the client SHALL show the server's latest messages, up to 100, instead." Non-blocking. The coordinator chose not to change the requirement text. |
| R2-3 | Info | design.md:73 | Rule (b) detects a reset database only while its highest id is still below the client's `lastSeenId`. After a reset followed by enough new messages, a stale client gets `append` over old content. This is an inherent limit of id-based catch-up without a database epoch, and it is acceptable for a local demo. | Optionally note it in Risks. No action required. |

### Independent checks (round 2, Node v24.21.0, 2026-09-26)

- `sha256sum -c` of the seven snapshot entries (from repository root): all `OK`, exit 0.
- `npm run --silent openspec -- validate add-realtime-chat-room --strict`: valid, exit 0.
- `npm run --silent openspec -- validate --all --strict`: 1 passed, 0 failed, exit 0.
- `npm run --silent openspec -- status --change add-realtime-chat-room --json`: `isPlanningComplete` true; all four artifacts `done`; exit 0.
- Grep for `message-store|socket-handlers|src/server/host-policy|message store|Q13` over `openspec/`, `docs/architecture.md`, `docs/testing.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/workflow.md`: only traceability notes and the resolved Q13. Grep for `pending user confirmation|Precondition|blocks task 1.3`: exit 1 (none).
- `git diff --stat 3b12640 -- proposal.md specs`: only `specs/chat-room/spec.md`, +4 lines (one scenario).
- `git diff --check`: exit 0.
- `git status --short`: 5 modified files (architecture, evidence README, design, spec, tasks) and untracked `docs/evidence/add-realtime-chat-room-layered-arch/`. This matches the maker's record.
- `git log --oneline -1`: `3b12640 feat: add toolchain configs, custom server, and smoke E2E (task 1.2)`.
- ESLint probes: `npx eslint -c <scratchpad copy of eslint.config.mjs + D4 boundary objects> --stdin --stdin-filename <path>` (31 cases, results above), `--print-config` for a service file (scratch) and an e2e file (real config), and a whole-project lint with the scratch config (exit 0). No project file was modified.

### Limitations (round 2)

- The probe config is my own rendering of D4's forms. Task 1.3's real `eslint.config.mjs` may differ and must be proven again there, as the task already requires.
- The user's messages were seen only as relayed by the coordinator, not in the original conversation.
- No application tests were run (planning-only change).

### Verdict (round 2)

**accepted.** F1–F5 are resolved; R2-1 and R2-2 are Low and R2-3 is Info, all non-blocking.

## Round 3

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker (same checker as rounds 1–2).
- Date: 2026-09-26.
- Reviewed snapshot: `snapshot.txt` revision 3 (base commit `3b12640`; same seven files as revision 2). `sha256sum -c` passed for all seven. `tasks.md` has the same hash as revision 2 (`75b249d2…`), so it was unchanged in this round. This `review.md` is not part of the snapshot.
- Inputs read: the Round 3 sections of `implementation.md` and `checks.txt`, `snapshot.txt`, the `git diff 3b12640` of `spec.md`, `docs/architecture.md`, and `docs/evidence/README.md`, and the changed passages of `design.md` (lines 16, 130, 134, 142, 147, 307, 330).
- User decision, as relayed by the coordinator: "так, приймаю обидва, потім коміть" ("yes, I accept both, then commit") accepts (1) the reverse boundary rule and (2) the R2-2 requirement sentence. R2-3 was to become a risk note only.

### Resolution of round-2 findings

| # | Status | Evidence |
|---|---|---|
| R2-1 | Resolved | The reverse rule is labelled "from review finding F4" plus accepted user decision 2026-09-26 with the quote. This appears in design.md:16 (Labels paragraph), :134 (dependency direction), and :142 (table row), and in `architecture.md` ("from a review finding") and the evidence README. The pattern mechanics heading (design.md:147) now says "implementation details of the accepted boundary rows, not separate user decisions". |
| R2-2 | Resolved | spec.md requirement "Connection status and reconnection" now ends with the exact accepted sentence. It agrees with the scenario "Last seen message is newer than the server's history", with D2 (design.md:73: `lastSeenId` above the highest id → `replace` with latest 100), and with rule (b) (design.md:130). The sentence is labelled as a user decision in design.md:130, :330, and the evidence README. OpenSpec strict validation passes. |
| R2-3 | Resolved | The Risks entry at design.md:307 is labelled "Risk note from review finding R2-3, not a user decision". It describes the limit accurately and names a possible later mitigation (server instance or database epoch id). |

### Regression check

- `tasks.md` is unchanged since revision 2. Tasks 3.2, 4.1, and 5.3 already cover rule (b), and task 1.3 covers the reverse rule, so no task change was needed.
- Proposal is unchanged. Ticked tasks 1.1 and 1.2 are unchanged; nothing newly ticked.
- No stale module names outside the traceability note at design.md:94; no "pending user confirmation" or "blocks task 1.3" text.
- Earlier user decisions and round-1/2 history in the evidence README are kept.

### New findings (round 3)

| # | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|
| R3-1 | Info | design.md:307 | The risk note is labelled "not a user decision" but its outcome reads "Accepted limitation". It does not say who accepted it. This wording matches other residual-risk entries, such as P19's "accepted for a local unauthenticated demo", and it is not presented as a user decision. | Optional: say "accepted by design for a local demo" or "open for the user", or tell the user about this limitation in the next report. No action required. |

### Independent checks (round 3, Node v24.21.0, 2026-09-26)

- `sha256sum -c` of the seven snapshot entries (from repository root): all `OK`, exit 0.
- `npm run --silent openspec -- validate add-realtime-chat-room --strict`: valid, exit 0.
- `npm run --silent openspec -- validate --all --strict`: 1 passed, 0 failed, exit 0.
- `npm run --silent openspec -- status --change add-realtime-chat-room --json`: `isPlanningComplete` true; all four artifacts `done`; exit 0.
- Grep for `message-store|socket-handlers|pending user confirmation|blocks task 1.3` over `openspec/`, `docs/architecture.md`, and `docs/testing.md`: one hit, the traceability note at design.md:94.
- `git diff --stat 3b12640 -- proposal.md tasks.md`: only `tasks.md` (the round-1/2 edits, same hash as revision 2).
- `git diff --check`: exit 0.
- `git status --short`: 5 modified files (architecture, evidence README, design, spec, tasks) and untracked `docs/evidence/add-realtime-chat-room-layered-arch/`. This matches the maker's record.
- `git log --oneline -1`: `3b12640 feat: add toolchain configs, custom server, and smoke E2E (task 1.2)`.
- ESLint probes were not rerun: the boundary table and pattern forms changed only in labels since round 2.

### Limitations (round 3)

- The user's messages were seen only as relayed by the coordinator.
- There is no intermediate commit for revision 2, so I checked the round-3 changes by reading the affected passages and comparing hashes (`tasks.md`), not with a revision-to-revision diff.

### Verdict (round 3)

**accepted.** R2-1 to R2-3 are resolved. The only new item, R3-1, is Info and non-blocking.

## Round 4

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker (same checker as rounds 1–3).
- Date: 2026-09-26.
- Reviewed snapshot: `snapshot.txt` revision 4 (base commit `3b12640`). `sha256sum -c` passed for all seven entries.
- Scope: a whitespace-only fix after the coordinator's pre-commit `git diff --cached --check` reported "checks.txt:226: new blank line at EOF".

### Verification

- The five deliverable hashes match revision 3 exactly: `design.md` 6e887dc8…, `tasks.md` 75b249d2…, `spec.md` 86063f2f…, `architecture.md` d705ef44…, and evidence `README.md` d5545401….
- `checks.txt` now ends with a single newline after `exit=0` (9439 bytes). Appending one newline to the current file gives the revision-3 hash `ab16ec74…`, so the only change is the removed extra newline.
- `implementation.md` minus its last section (the `## Round 4` block and the blank line before it) gives the revision-3 hash `441b3bd7…`, so the only change is the appended Round 4 note.
- Whitespace: `git diff --check` for tracked files exited 0. `git diff --no-index --check /dev/null <file>` for `implementation.md`, `checks.txt`, `snapshot.txt`, and `review.md` (after this append) exited 1 with no output. That result means clean, per the maker's calibration, and matches git's behavior: exit 1 whenever the files differ, and a whitespace error adds output.

### Findings

None.

### Verdict (round 4)

**accepted.**
