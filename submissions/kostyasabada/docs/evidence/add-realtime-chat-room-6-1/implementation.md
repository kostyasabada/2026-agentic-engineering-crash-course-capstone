# Task add-realtime-chat-room-6-1, phase A: documentation

- Maker: Claude Code general-purpose subagent (maker), fresh context, scoped handoff from the coordinator.
- Date: 2026-09-30. Node: v24.21.0 (`~/.nvm/versions/node/v24.21.0/bin` first on `PATH`), npm 11.19.0.
- Base: `e5c9a22` (HEAD at the start; working tree clean). Snapshot: `snapshot.txt` (phase A).
- Scope: task 6.1 was split by the coordinator. Phase A (this record) updates the documentation so that the final commit describes the actual state. Phase B (clean-checkout `npm ci`, Chromium install if needed, `npm run check`, `openspec validate --all --strict`) is run later by the coordinator and is not part of this record. No code changed; no checkbox ticked; no staging or commit; the agent loop was not run.

## Criteria (from the handoff)

1. `docs/testing.md`: replace the stale "Current and planned coverage" section with the existing suites, one line each, and counts from an actual run; keep the accurate paragraphs; remove "planned" wording (user decision 2026-09-30, item (c) after the task 5.4 review: "update the stale coverage section of docs/testing.md in task 6.1", accepted with "коміть, приймаю всі і роби 5.5", translated: "commit, I accept all and do 5.5"; instruction "роби 6.1", translated: "do 6.1").
2. `docs/architecture.md`: update "Implementation status" / "Not implemented yet" for tasks 2.1–5.5; keep limitations accurate and add the accepted ones; list the two deferred follow-ups as open items.
3. `README.md`: update the status section and stale statements; keep run commands accurate.
4. `docs/workflow.md`, `docs/evidence/README.md`: minimal edits only for stale statements.

## Changes per file

- `docs/testing.md`: section "Current and planned coverage" renamed "Current coverage" and rewritten as two tables (10 Vitest files, 465 tests; 8 Playwright files, 52 tests) with per-file counts and a one-line scope each; the counts' source run and commit are named. The prerequisite, commands, fixture, dev HMR, reporting, and setup-history paragraphs are unchanged.
- `docs/architecture.md`: "Implementation status" now lists what exists after tasks 1.1–5.5 (tooling, agent tooling, shared schema, server layers, composition root and thin entry, chat UI) with design references; the "Not implemented yet" paragraph and the stale "placeholder page" wording are removed. "Limitations" gains four items: supervisor signalling only npm's PID (task 4.3), dev-mode HMR reload (task 5.3), Host/Origin residual risks (design D2), stale `lastSeenId` after a database reset (design Risks, review finding R2-3). The existing limitations stay; single-instance broadcast was already listed. New section "Open items" lists the two deferred follow-ups. "Open decisions" is unchanged (Q8, Q10, Q12 are still marked open in design.md).
- `README.md`: the "Current status" paragraph now says the change is implemented and names task 6.1 as the final verification; the `docs/testing.md` bullet mentions coverage. Run commands (`node --import tsx server.ts`, Ctrl+C behaviour, supervisor note, `PORT`/`HOST`/`CHAT_DB_PATH`) were already accurate and are unchanged.
- `docs/workflow.md`: "Task 2.1 is planned as the first real task run through the loop" replaced by the fact, with the log path and its stop reason (`checks_passed`, one fixer run; checked in `add-realtime-chat-room-2-1/loop-run.log`).
- `docs/evidence/README.md`: two present-tense statements in historical entries put into past tense ("Product checks have not taken place yet"; "no tests exist yet").

## Stale-phrase grep

Command (before the edits, over `README.md AGENTS.md CLAUDE.md docs/*.md docs/evidence/README.md`): `grep -niE "not yet|planned|does not exist|will be|no application|placeholder|not implemented|later task|is being implemented"`. Hits and resolution:

- `docs/architecture.md:28` "placeholder page" — removed (the page is the chat UI).
- `docs/architecture.md:32` "Not implemented yet (later tasks of the change)" — removed.
- `README.md:7` "is being implemented", "placeholder Next.js page", "not implemented yet" — rewritten.
- `docs/testing.md:32,36` "Current and planned coverage", "Planned with the chat features" — rewritten.
- `docs/workflow.md:62` "Task 2.1 is planned as the first real task" — rewritten.
- `docs/evidence/README.md:83` "not yet a user decision at the time of round 1" — kept: explicitly dated historical record.

Additional hits found with a wider pattern after the edits (`...|being implemented|remaining|yet\b`): `docs/evidence/README.md:39` "no tests exist yet" — changed to past tense; `docs/architecture.md:53` "remaining open questions" — kept (Q8, Q10, Q12 are still open in design.md). `docs/workflow.md:48` ("`openspec/specs/` and the archive stay empty until ... archived") matched no pattern but was checked: still true (the change is not archived; `openspec/specs/` does not exist). The final grep is in `checks.txt`.

## Test counts (run at `e5c9a22`, details in `checks.txt`)

- Vitest: 10 files, 465 tests passed, 0 failed or skipped: config 23, schema 108, repository 13, service 31, controller 53, host-policy 116, app 43, merge-messages 12, send-ack 19, agent-loop 47.
- Playwright `--list`: 52 tests in 8 files: smoke 1, startup 1, shutdown 3, host-policy 2, nickname 12, messaging 19, connection 5, history 9. Listing only; E2E tests were not run in phase A (phase B runs `npm run check`).

## Limitations and notes

- The handoff called the ESLint follow-up "task 4.2 open issue 4"; the task 4.2 evidence numbers it open point 6 (`add-realtime-chat-room-4-2/implementation.md`, "Open point 6 deferred"; `review.md` "open point 6 ... deferred to a separate task"). The documentation uses "open point 6".
- The path check lists every backticked path-like token in the five changed documents, including unchanged lines. The 19 tokens it cannot resolve are not repo paths or are relative to another base; each is classified in `checks.txt`. `evidence/add-realtime-chat-room-6-1/checks.txt` did not exist when the check ran and is created by this task.
- Coverage counts reflect `e5c9a22`; a later test change needs the table updated.
- Not verified here: a full `npm run check` and E2E execution (phase B), and the rendering of the Markdown tables in a viewer.

## Round 2 (phase A revision 2)

The checker's Phase A round 1 in `review.md` requested changes: three low findings and one informational note. The coordinator relayed them for fixing within the same scope (user instruction "роби 6.1", translated: "do 6.1"). Everything above this section is unchanged (append-only).

- Finding 1 (`docs/architecture.md:48`): "today only `server.ts` imports it" was false, because `src/app/layout.tsx:1` imports `type { Metadata } from 'next'`. Now: "today no file under `src/server/` imports it; `server.ts` does". Checked by grepping `src/server` for imports of `next`; there are none.
- Finding 2 (`docs/testing.md:60`): the `e2e/messaging.spec.ts` row now also names "local `HH:MM` timestamps" and "nickname attribution and change (including duplicates)". These cover the 4 nickname tests at `messaging.spec.ts:578,592,606,629` and the timestamp test at `:348`. The count stays 19.
- Finding 3 (this file, line 34): correction. The Stale-phrase grep section says "`openspec/specs/` does not exist". That is wrong. `openspec/specs/` exists and holds only a tracked `.gitkeep`, and `openspec/changes/archive/` also holds only a tracked `.gitkeep` (`git ls-files`, in `checks.txt` Round 2). The conclusion does not change: the `docs/workflow.md:48` statement that both stay empty until the change is archived is still true.
- Info note 4 (`docs/architecture.md:26`): the sentence now says that `dev` and `start` run `node --import tsx server.ts` directly, while `check` and `check:loop` do so through the E2E fixture.
- Changed in round 2: `docs/architecture.md` (lines 26 and 48) and `docs/testing.md` (line 60), plus appended Round 2 sections in this file and in `checks.txt`, and a regenerated `snapshot.txt` (phase A revision 2, base `e5c9a22`). No other lines changed; the diff against the round 1 copies is in `checks.txt`. `review.md` was not edited.
