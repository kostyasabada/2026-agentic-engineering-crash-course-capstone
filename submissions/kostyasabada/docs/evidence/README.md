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

## Loop and dynamic context decision

- Task: `setup-loop-hook-decision`.
- User decision: the first OpenSpec change adds `scripts/agent-loop.sh`, which runs `npm run check` and, on failure, passes the output to a selectable non-interactive agent run (`claude -p` or `codex exec`) until checks pass or an iteration limit (default 5) is reached, logging each iteration to `<task-id>/loop-run.log`; at least one real task must run through it with the log committed, and loop results still need separate checker acceptance. It also adds a Claude Code `SessionStart` hook that injects the pinned OpenSpec `list --json` output into session context, with Codex parity evaluated in the design and a sample of actual hook output recorded.
- Action: recorded the decision in `../architecture.md`, with short pointers in `../testing.md` and `../workflow.md`, and added design and tasks rules to `../../openspec/config.yaml`. No script, hook, settings, or dependencies were created.
- Source: the user's loop engineering and dynamic context request in the setup conversation (2026-09-25). Implementation and actual checks are recorded in `setup-loop-hook-decision/implementation.md` and `setup-loop-hook-decision/checks.txt`; acceptance requires a separate checker report.

## Loop ownership decision

- Task: `setup-loop-ownership`.
- User decision: the task's maker launches `scripts/agent-loop.sh`, not the coordinator; `npm run check` is a deterministic command that the loop runs and the checker reruns independently; each fix iteration is a fresh non-interactive agent process with scoped input on the maker's side, not a checker. The default fixer is Codex (`codex exec`), with `claude -p` selectable, and the default checker is a separate Claude Code subagent. A green loop does not complete a task: the checker reviews the spec, changes, and `loop-run.log`, reruns checks, and gives the verdict; findings return to the same maker. The first change's design must also address CLI launch permissions and cost control through the iteration limit.
- Action: extended the agent loop decision in `../architecture.md`, added an agent loop clause to the roles in `../review-process.md`, and added a design rule to `../../openspec/config.yaml`. No script, hook, settings, or dependencies were created.
- Source: the user's loop ownership request in the setup conversation (2026-09-25). Implementation and actual checks are recorded in `setup-loop-ownership/implementation.md` and `setup-loop-ownership/checks.txt`; acceptance requires a separate checker report.
