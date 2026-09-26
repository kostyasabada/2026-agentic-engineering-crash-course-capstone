# OpenSpec workflow

OpenSpec 1.13.2 uses the existing `spec-driven` schema and project context. Its Codex integration is installed under `.agents/skills/` in this submission. The core profile generated six skills: `openspec-propose`, `openspec-explore`, `openspec-apply-change`, `openspec-update-change`, `openspec-sync-specs`, and `openspec-archive-change`. This version uses invocable skills for Codex; it did not install separate slash-command files.

## Skills and activation

The approved `playwright` and `security-best-practices` skills from `openai/skills` are installed personally at `~/.codex/skills/`, outside this repository. They are available on the next turn; if they do not appear, restart Codex. Playwright provides browser automation guidance and a CLI wrapper. The project also installs Playwright Test separately; see `testing.md` for the browser verification result. Security best practices supports explicit security guidance/review requests for Python, JavaScript/TypeScript, and Go. `gh-fix-ci` was not installed.

Start a Codex task with `submissions/kostyasabada/` as its working directory to discover the submission's OpenSpec skills. Repository skill discovery scans from the working directory upward, so a task launched at the course repository root should not be assumed to discover skills in this child directory. In the desktop app, select the skill from the skills UI when available; CLI/IDE users can mention `$openspec-propose`, for example. Installed files and CLI behavior were verified, but runtime discovery and invocation in a new task have not been tested. See [official skill documentation](https://learn.chatgpt.com/docs/build-skills).

Generated instructions remain upstream files. Their task-writing and implementation steps are performed by a fresh maker, while the main agent coordinates. Apply's immediate completion/checkmark examples only apply after the separate checker accepts the final snapshot, as required by `AGENTS.md` and `docs/review-process.md`. Prepare and commit specifications before implementation even when a generated skill permits interleaving; commits require the user's approval (`AGENTS.md`). During archive, delegate spec synchronization synchronously, wait for the maker and independent checker, and only then move the change. A CLI `all_done` state alone is not review evidence. Recheck these rules after regenerating the integration.

## Claude Code

The project is also used with Claude Code (user decision). `CLAUDE.md` imports `AGENTS.md` with `@AGENTS.md`, so both tools follow the same rules; it only adds a short tool mapping.

- Launch Claude Code with `submissions/kostyasabada/` as the working directory.
- The six OpenSpec skills are exposed at `.claude/skills/<skill-name>` as relative symlinks to `../../.agents/skills/<skill-name>`. `.agents/skills/` remains the single source, so regenerating the Codex integration updates both tools. Invoke them as `/openspec-propose`, `/openspec-apply-change`, and so on.
- Re-initializing OpenSpec with `--tools claude` would generate separate duplicate copies under `.claude/`; prefer the symlinks. If the Codex integration is regenerated, check that the symlinks still resolve.
- Apply the same `openspec` executable substitution (see Commands) and the same coordinator, maker, and checker rules. Spawn makers and checkers as fresh Agent-tool subagents with self-contained handoffs, not context-inheriting forks.
- The personal Codex skills in `~/.codex/skills/` are not exposed to Claude Code.
- Symlink resolution was verified on the filesystem; runtime skill discovery and invocation in a new Claude Code session have not been verified.

## Commands

Run from `submissions/kostyasabada/`. Install the locked project dependencies with `npm ci`; this requires npm registry access on a clean machine. OpenSpec 1.13.2 is pinned in `package.json` and `package-lock.json`, so no global installation or temporary-cache command is needed.

Generated skills use `openspec ...` as shorthand. In both Codex and Claude Code, replace that executable with `npm run --silent openspec --`, preserving all arguments and the working directory. The npm script resolves the project-local executable. `--silent` keeps npm's script banner out of JSON output.

```bash
npm ci
npm run --silent openspec -- list --json
npm run --silent openspec -- new change <change-name>
npm run --silent openspec -- status --change <change-name> --json
npm run --silent openspec -- instructions proposal --change <change-name> --json
npm run --silent openspec -- validate --all --strict
```

## Sequence

1. Create a separate change for an agreed task.
2. Use `status` and `instructions` to obtain current artifact requirements for proposal, specs, design, and tasks. Do not invent the format.
3. Prepare the artifacts and, with the user's approval, commit them before implementation. Discuss unresolved product decisions with the user.
4. The main agent coordinates only and spawns a fresh maker subagent for each task with scoped context and no full history by default. The maker implements the task and records actual check results. Follow `docs/review-process.md` for handoffs, evidence, and review snapshots, including specification tasks.
5. Spawn a separate checker with scoped context. Return findings to that task's maker and obtain checker acceptance of the final snapshot before marking the task complete.
6. Archive the completed change following CLI guidance, merging requirements into `openspec/specs/`.

`openspec/specs/` contains current requirements; `openspec/changes/` contains active changes; `openspec/changes/archive/` contains completed changes. The initial directories are intentionally empty: product specifications have not been written yet.

This process description is not evidence of an executed automated loop. Claiming loop engineering requires a reproducible mechanism and a record of an actual run.

An agent loop script and a Claude Code `SessionStart` context hook are planned for the first OpenSpec change (see `architecture.md`); neither exists yet.

Documentation: https://github.com/Fission-AI/OpenSpec.
