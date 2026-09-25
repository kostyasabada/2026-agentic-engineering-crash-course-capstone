# Chat project rules

- Work within `submissions/kostyasabada/`. Do not modify course files at the repository root.
- Use English for project documentation, specifications, code comments, UI text, and commit messages. Continue conversations in the user's language.
- Implement agreed tasks and run checks independently. Discuss feature scope expansions with the user.
- Prepare an OpenSpec change before implementing a new capability. Specifications must precede code; preserve this order in commits.
- Read context selectively: locate relevant files first, then open them. Expand the search when dependencies or uncertainty require it.
- Do not read all documentation, archived changes, or evidence logs by default. Do not duplicate requirements across documents.
- Read the relevant `openspec/specs/` and active change in `openspec/changes/` for the current task.
- Run appropriate checks before completion. Report actual results, failures, and anything not verified.
- Every task requires a maker and a different checker agent. Follow `docs/review-process.md`; do not mark a task complete without evidence and checker acceptance of the final revision.
- Never invent test results, reviews, iterations, or user decisions.

## Context map — read as needed

| Task | Source |
|---|---|
| Setup and running the project | `README.md` |
| Existing capability requirements | `openspec/specs/<capability>/spec.md` |
| Proposed change | `openspec/changes/<change>/` |
| OpenSpec workflow | `docs/workflow.md` |
| Structure and technical decisions | `docs/architecture.md` |
| Behavior verification | `docs/testing.md` |
| Task ownership, independent review, and completion | `docs/review-process.md` |
| Capstone evidence | `docs/evidence/README.md` |
