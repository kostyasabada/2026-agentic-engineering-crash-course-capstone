@AGENTS.md

## Claude Code mapping

`AGENTS.md` (imported above) is the single source of project rules. This section only maps them to Claude Code; it adds no rules.

- Launch Claude Code with `submissions/kostyasabada/` as the working directory.
- Scoped handoffs (Codex `fork_turns="none"`): spawn each maker and checker with the Agent tool as a fresh subagent (for example `general-purpose`) with a self-contained handoff per `docs/review-process.md`. Never use a context-inheriting fork for a maker or checker.
- OpenSpec skills are exposed at `.claude/skills/` as symlinks to `.agents/skills/`; invoke them as `/openspec-propose` and so on. Replace the `openspec` executable as described in `docs/workflow.md`.
