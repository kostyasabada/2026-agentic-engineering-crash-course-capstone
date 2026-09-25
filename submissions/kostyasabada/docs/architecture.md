# Project organization

## Accepted decisions

- The entire project lives in `submissions/kostyasabada/`.
- OpenSpec stores requirements and individual changes.
- The user selected Next.js as the application framework.
- `AGENTS.md` contains concise rules and a reading map; details are read as needed.
- Organize code by responsibility and keep related parts together. Reference: https://nextjs.org/docs/app/getting-started/project-structure.
- The user selected `@playwright/test` (dev dependency) for browser end-to-end tests, committed in the project and runnable with a single command so the checker can rerun them independently. The first OpenSpec change's design must specify the Playwright configuration, test location, how the dev server is started for tests, and the exact run command. Agent-driven browser checks are supplementary, not a substitute.
- The user selected an agent loop: the first OpenSpec change adds `scripts/agent-loop.sh`, which runs the single project check command (`npm run check`: lint, type check, unit tests, Playwright E2E); on failure it passes the failure output to a non-interactive agent run (Claude Code `claude -p` or Codex `codex exec`, selectable) and repeats until checks are green or an iteration limit (default 5) is reached. Each run writes a per-iteration log (iteration number, check result, stop reason) to `docs/evidence/<task-id>/loop-run.log`; at least one real task must run through the loop with its log committed. A loop result still requires separate checker acceptance per `review-process.md`. The first change's design must specify the script interface and arguments, agent selection, iteration limit, stop conditions, and log format.
- The user selected a dynamic context hook: the first OpenSpec change adds a Claude Code `SessionStart` hook in the project `.claude/settings.json` that runs the pinned OpenSpec CLI `list --json` (see `workflow.md`) and injects active changes into session context; a sample of its actual output must be recorded as evidence. The first change's design must specify the hook configuration, command, output, failure behavior, and Codex parity; if Codex has no equivalent mechanism, document the limitation rather than claim parity.

## Open decisions

The Next.js version, router, message transport, storage, and deployment approach will be defined in the design of the first OpenSpec change. Socket.IO and SQLite remain preliminary suggestions. No dependencies, including Playwright, have been installed, and the agent loop script and `SessionStart` hook do not exist yet.

## Context management

Directory structure alone does not reduce reading: the agent selects files based on the task. For example, fixing history involves reading history requirements, storage code, and related tests, followed by any necessary dependencies.

Do not create empty code modules in advance. Add code directories during implementation. Do not copy the entire Next.js documentation into the project.
