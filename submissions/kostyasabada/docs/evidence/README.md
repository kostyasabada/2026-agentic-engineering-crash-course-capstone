# Capstone evidence

Add only factual records during the work: verification results, reviews, and human decisions. This file alone does not prove that tests or reviews passed.

For each record, include the task, action, actual result, and a reference to a file, commit, or saved output. Do not hide errors or unsuccessful attempts.

Required task evidence and the completion gate are defined in `../review-process.md`. Store each task's implementation report, independent review, snapshot, and supporting outputs in its own directory here.

## Initial user decisions

- Selected a chat between people.
- Kept the project separate from course files.
- Selected OpenSpec for specifications.
- Selected Next.js for the application itself, beyond its example of file organization.
- Chose a concise `AGENTS.md` with details in separate files read selectively.
- Requested English throughout the project; existing project documentation was translated accordingly.
- Required a different agent to check every maker's task, with verifiable completion evidence.

Source: the conversation during initial setup. Product checks have not taken place yet. Task review results, when available, are stored in the task directories below this directory.

## Task delegation decision

- Task: `setup-agent-delegation`.
- User decision: the main agent coordinates only, spawning a fresh separate maker for each task with its own scoped context, receiving the result, and using another separate checker.
- Action: updated `../../AGENTS.md`, `../review-process.md`, `../workflow.md`, and `../../openspec/config.yaml` to define this process.
- Source: the user's task delegation request in the setup conversation. Implementation and actual checks are recorded in `setup-agent-delegation/implementation.md` and `setup-agent-delegation/checks.txt`; acceptance requires a separate checker report.

## Claude Code compatibility decision

- Task: `setup-claude-compat`.
- User decision: the project is worked on with both ChatGPT/Codex and Claude Code, and Claude Code must read and follow the same rules and instructions.
- Action: added `../../CLAUDE.md` importing `../../AGENTS.md`, exposed the six OpenSpec skills at `../../.claude/skills/` as relative symlinks to `../../.agents/skills/`, and added tool-neutral qualifiers to `../../AGENTS.md`, `../review-process.md`, and `../workflow.md`.
- Source: the user's Claude Code compatibility request in the setup conversation. Implementation and actual checks are recorded in `setup-claude-compat/implementation.md` and `setup-claude-compat/checks.txt`; acceptance requires a separate checker report.

## E2E testing decision

- Task: `setup-e2e-decision`.
- User decision: browser end-to-end tests use `@playwright/test` as a dev dependency, committed in the project and runnable with a single command so the checker can rerun them independently; the first OpenSpec change's design must detail the setup. Agent-driven browser checks (the personal Codex `playwright` skill or the Claude Code browser) remain supplementary for quick manual checks and screenshots.
- Action: recorded the decision in `../architecture.md` and `../testing.md`, and added a design rule to `../../openspec/config.yaml`. No dependencies were installed and no tests exist yet.
- Source: the user's E2E testing request in the setup conversation. Implementation and actual checks are recorded in `setup-e2e-decision/implementation.md` and `setup-e2e-decision/checks.txt`; acceptance requires a separate checker report.
