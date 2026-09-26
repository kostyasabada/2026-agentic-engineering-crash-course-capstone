# Implementation: add-realtime-chat-room-0-1

## Task

Task 0.1 "Decisions gate" in `openspec/changes/add-realtime-chat-room/tasks.md`.

Acceptance criteria (as handed off by the coordinator):

1. Confirm that the user decisions of 2026-09-26 (Q1–Q7, Q9, the principles "restrict the Socket.IO Origin" and "simplify the loop") are recorded in `docs/evidence/README.md`, `docs/architecture.md`, and `design.md`; report any gap.
2. Record the question, the user's reply verbatim with translation, and the resulting decision for P1–P22 and Q11 in `decisions.md`.
3. Update `design.md`, `docs/architecture.md`, and `docs/evidence/README.md` minimally; no spec/proposal edits unless needed.
4. Q8, Q10, and Q12 stay open.
5. English in artifacts (verbatim Ukrainian quote only in `decisions.md`, with translation).
6. Checks: OpenSpec strict validation of the change and of all items, `git diff --check`, `git status --short`.

## Maker

A fresh Claude Code maker subagent (Opus 5.5) spawned by the coordinator with a scoped handoff and no full conversation history. The user's reply was relayed by the coordinator; this maker did not see the conversation itself.

## Confirmation of earlier decisions (criterion 1)

- `docs/evidence/README.md`: "Toolchain and product decisions" records Q1–Q7 (product defaults, TypeScript 6.0.3 / ESLint 9.39.5), Q9 (`claude -p` default fixer), the Origin principle, and the loop simplification principle.
- `docs/architecture.md`: the agent loop bullet records Q9 and loop simplification; separate bullets record Q7 and the product defaults with the Origin principle.
- `design.md`: Q1–Q7 and Q9 are marked Resolved in Open Questions; D2 records the Origin principle and D7 the loop simplification as Accepted (user decision, 2026-09-26).
- Gaps found: none. Stale wording found: `docs/architecture.md` said the Origin mechanism was a design proposal and that stack details were "pending user confirmation" (both fixed here); `proposal.md` Impact said versions and the SQLite driver were "proposals in `design.md` pending user confirmation" (fixed in a follow-up edit, see Changes).

## Changes

- `docs/evidence/add-realtime-chat-room-0-1/decisions.md` (new): question as presented (coordinator's summary), the user's reply verbatim in Ukrainian with English translation, scope of the second clause, and the decision per item P1–P22 and Q11.
- `openspec/changes/add-realtime-chat-room/design.md`: the label legend now states that all proposals P1–P22 are Accepted (user decision, 2026-09-26, task 0.1), keeping the numbering (chosen over relabelling 22 lines); the D2 Origin line notes that the P19 mechanism was accepted; Q11 marked Resolved (`better-sqlite3` 13.0.3).
- `docs/architecture.md`: removed "the Origin mechanism is a design proposal"; added a bullet that P1–P22 are accepted and Q11 resolved, pointing to `design.md` and `decisions.md`; the "Open decisions" paragraph now lists the remaining deferrable questions Q8, Q10, Q12 instead of pending proposals.
- `docs/evidence/README.md`: added the "Design proposals decision" entry (its Action line updated to mention the `proposal.md` wording fix).
- `openspec/changes/add-realtime-chat-room/proposal.md` (Impact, one line; requested by the coordinator after the first report): the stale "proposals in `design.md` pending user confirmation" now says exact versions and the SQLite driver (`better-sqlite3` 13.0.3) were accepted by the user on 2026-09-26 (task 0.1). No other change to `proposal.md`.

No approach changed, so specs and `tasks.md` were not edited; `proposal.md` received only the wording fix above. The task checkbox is not ticked (requires checker acceptance). Nothing was staged or committed.

## Snapshot

`snapshot.txt` in this directory: base commit `57b5517` plus SHA-256 hashes of every changed deliverable (including `proposal.md` after the follow-up edit), including `decisions.md`, this file, and `checks.txt`.

## Checks

Actual outputs and exit codes are in `checks.txt` (a second run after the `proposal.md` edit is appended there with the same results) (Node v24.21.0 from `/tmp/node-v24.21.0-linux-x64/bin`):

- `npm run --silent openspec -- validate add-realtime-chat-room --strict`: exit 0.
- `npm run --silent openspec -- validate --all --strict`: 1 passed, 0 failed, exit 0.
- `git diff --check`: exit 0, no output (covers tracked files only; the new untracked files were checked separately with `grep -nE '[[:space:]]$'`, no matches, recorded in `checks.txt`).
- `git status --short`: three modified files and the new evidence directory.

No application tests apply (documentation-only task).

## Known limitations and open issues

- The question table in `decisions.md` is the coordinator's summary of what was presented, not a verbatim copy.
- Open questions Q8, Q10, and Q12 remain open and deferrable.
