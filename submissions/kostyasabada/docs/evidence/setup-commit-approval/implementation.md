# setup-commit-approval implementation

Maker: Claude Code general-purpose subagent (maker), spawned fresh by the coordinator with a scoped handoff. Setup task; independent checker acceptance is pending.

User decision (2026-09-26, in Ukrainian, translated: "make a rule: do not make commits without me. I want to see the changed files"; relayed in the coordinator handoff): no agent (coordinator, maker, or checker; Claude Code or Codex) commits, pushes, amends, rebases, resets, or otherwise rewrites history unless the user explicitly asks for that specific commit in the current conversation. Before committing, the coordinator shows the changed files and waits for explicit approval. Approval covers one commit only; checker acceptance is not approval to commit.

Trigger: the coordinator had committed `e66917e` (the `add-realtime-chat-room` OpenSpec change) after checker acceptance without asking the user.

## Acceptance criteria and results

1. `AGENTS.md`: added one bullet after "Never invent test results..." stating the rule, the pre-commit file listing (`git status --short`, `git diff --stat`), one-commit scope, that checker acceptance is not approval, and that the rule applies wherever other documents say to commit. `CLAUDE.md` is unchanged; it imports `AGENTS.md`.
2. Contradicting or ambiguous wording, found with grep for "commit" (see `checks.txt`), reworded with short cross-references:
   - `docs/review-process.md`: Coordinator role now says it orchestrates Git "(commits only with the user's approval, see `../AGENTS.md`)"; workflow step 3 now says "an existing commit SHA", so freezing the review scope does not imply creating a commit.
   - `docs/workflow.md`: line 11 ("Prepare and commit specifications before implementation...") gains "commits require the user's approval (`AGENTS.md`)"; Sequence step 3 now reads "Prepare the artifacts and, with the user's approval, commit them before implementation."
   - `openspec/config.yaml`: the `rules.tasks` loop rule now says it commits `loop-run.log` "(commits only with the user's approval, per AGENTS.md)". PyYAML parse confirms 3 string rules.
   - `openspec/changes/add-realtime-chat-room/tasks.md` (already accepted artifact; checker should re-review): task 2.1 only, "commit `docs/evidence/add-realtime-chat-room-2-1/loop-run.log` unedited." replaced by "keep `docs/evidence/add-realtime-chat-room-2-1/loop-run.log` unedited so it is committed as is (with the user's approval, per `AGENTS.md`)." No other line of the change was edited.
   - Left unchanged because they do not imply that agents commit on their own: `AGENTS.md` line 6 ("preserve this order in commits"), `docs/architecture.md` and `design.md` ("with its log committed", "committed project settings/tests"), `spec.md` statements that the loop script never commits, `design.md` fixer prompt forbidding commits, `tasks.md` 1.4 ("no checkbox/commit changes") and 6.1 ("clean checkout of the final commit"), and historical entries in `docs/evidence/README.md` and other task evidence directories.
3. `docs/evidence/README.md`: added "Commit approval decision" (task, user decision, trigger, action, source).
4. English only; all changes inside `submissions/kostyasabada/`; no code, scripts, hooks, or settings.
5. Evidence: this file, `checks.txt`, `snapshot.txt`. No `review.md` (left to the checker).

## Verification and snapshot

`checks.txt` records actual commands, output, and exit codes: grep for "commit" before and after the edits (scoped to `AGENTS.md`, `CLAUDE.md`, `docs/review-process.md`, `docs/workflow.md`, `docs/architecture.md`, `docs/testing.md`, `openspec/config.yaml`, and the active change; up to 50 characters of context per match), grep of `docs/evidence/README.md` after edits, `git diff --check` (exit 0), a PyYAML parse of `rules.tasks` (exit 0), `npm run --silent openspec -- validate --all --strict` (exit 0, `change/add-realtime-chat-room` passed), and `git status --short --untracked-files=all` (six modified files plus the two untracked evidence files), exit 0.

Base commit: `e66917e` (nothing staged or committed by the maker). `snapshot.txt` lists SHA-256 hashes of the changed files, this report, and `checks.txt`, with paths relative to the repository root. `snapshot.txt` itself is not hashed.

## Limitations

- The "before" grep was run before any edit and saved to a scratch file, then copied into `checks.txt`; the "after" checks ran while this report was an empty placeholder (so `git status` lists it). A "before" grep of `docs/evidence/README.md` was not saved separately; its three pre-existing matches (lines 5, 38, 45) are unchanged in the "after" output.
- The rule is documentation only; nothing technically prevents an agent from running `git commit`.
