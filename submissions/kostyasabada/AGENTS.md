# Chat project rules

- Work within `submissions/kostyasabada/`. Do not modify course files at the repository root.
- Use English for project documentation, specifications, code comments, UI text, and commit messages. Continue conversations in the user's language.
- Implement agreed tasks and run checks independently. Discuss feature scope expansions with the user.
- Prepare an OpenSpec change before implementing a new capability. Specifications must precede code; preserve this order in commits.
- Read context selectively: locate relevant files first, then open them. Expand the search when dependencies or uncertainty require it.
- Do not read all documentation, archived changes, or evidence logs by default. Do not duplicate requirements across documents.
- Read the relevant `openspec/specs/` and active change in `openspec/changes/` for the current task.
- Run appropriate checks before completion. Report actual results, failures, and anything not verified.
- The main agent coordinates only: spawn a fresh maker subagent for each task and a separate checker, each with scoped context and no full history by default (Codex: `fork_turns="none"`; Claude Code: see `CLAUDE.md`). Follow `docs/review-process.md`; complete tasks only with evidence and checker acceptance of the final revision.
- Never invent test results, reviews, iterations, or user decisions.
- Commit only with the user's approval: no agent commits, pushes, amends, rebases, resets, or otherwise rewrites history unless the user explicitly asks for that specific commit in the current conversation. Before committing, the coordinator shows the changed files (`git status --short`, `git diff --stat`) and waits for explicit approval. Approval covers one commit only; checker acceptance is not approval. Where other documents say to commit, this rule applies.
- Installed skills follow these project ownership and completion rules. In generated OpenSpec instructions, implementation and artifact-writing steps belong to the maker; completion checkboxes and archive readiness require separate checker acceptance of the final snapshot. Read `docs/workflow.md` for invocation and integration details.

## Context map — read as needed

| Task | Source |
|---|---|
| Setup and running the project | `README.md` |
| Existing capability requirements | `openspec/specs/<capability>/spec.md` |
| Proposed change | `openspec/changes/<change>/` |
| OpenSpec workflow | `docs/workflow.md` |
| Claude Code mapping (imports this file) | `CLAUDE.md` |
| Structure and technical decisions | `docs/architecture.md` |
| Behavior verification | `docs/testing.md` |
| Task ownership, independent review, and completion | `docs/review-process.md` |
| Capstone evidence | `docs/evidence/README.md` |
