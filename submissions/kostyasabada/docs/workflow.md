# OpenSpec workflow

OpenSpec 1.13.2 uses the existing `spec-driven` schema and project context. Its Codex integration is installed under `.agents/skills/` in this submission. The core profile generated six skills: `openspec-propose`, `openspec-explore`, `openspec-apply-change`, `openspec-update-change`, `openspec-sync-specs`, and `openspec-archive-change`. This version uses invocable skills for Codex; it did not install separate slash-command files.

## Skills and activation

The approved `playwright` and `security-best-practices` skills from `openai/skills` are installed personally at `~/.codex/skills/`, outside this repository. They are available on the next turn; if they do not appear, restart Codex. Playwright provides browser automation guidance and a CLI wrapper; browser binaries and a running browser have not been verified. Security best practices supports explicit security guidance/review requests for Python, JavaScript/TypeScript, and Go. `gh-fix-ci` was not installed.

Start a Codex task with `submissions/kostyasabada/` as its working directory to discover the submission's OpenSpec skills. Repository skill discovery scans from the working directory upward, so a task launched at the course repository root should not be assumed to discover skills in this child directory. In the desktop app, select the skill from the skills UI when available; CLI/IDE users can mention `$openspec-propose`, for example. Installed files and CLI behavior were verified, but runtime discovery and invocation in a new task have not been tested. See [official skill documentation](https://learn.chatgpt.com/docs/build-skills).

Generated instructions remain upstream files. Their task-writing and implementation steps are performed by a fresh maker, while the main agent coordinates. Apply's immediate completion/checkmark examples only apply after the separate checker accepts the final snapshot, as required by `AGENTS.md` and `docs/review-process.md`. Prepare and commit specifications before implementation even when a generated skill permits interleaving. During archive, delegate spec synchronization synchronously, wait for the maker and independent checker, and only then move the change. A CLI `all_done` state alone is not review evidence. Recheck these rules after regenerating the integration.

## Commands

Run from `submissions/kostyasabada/`. The version is pinned in the commands; no global installation is needed. The first run requires access to npm.

Generated skills use `openspec ...` as shorthand. In this project, replace that executable with `npx --yes @fission-ai/openspec@1.13.2`, preserving all arguments and the working directory. For the current machine's cached offline installation, use `npm exec --offline --cache /tmp/capstone-npm-cache --yes --package=@fission-ai/openspec@1.13.2 -- openspec ...`.

```bash
npx --yes @fission-ai/openspec@1.13.2 list --json
npx --yes @fission-ai/openspec@1.13.2 new change <change-name>
npx --yes @fission-ai/openspec@1.13.2 status --change <change-name> --json
npx --yes @fission-ai/openspec@1.13.2 instructions proposal --change <change-name> --json
npx --yes @fission-ai/openspec@1.13.2 validate --all --strict
```

## Sequence

1. Create a separate change for an agreed task.
2. Use `status` and `instructions` to obtain current artifact requirements for proposal, specs, design, and tasks. Do not invent the format.
3. Prepare and commit the artifacts before implementation. Discuss unresolved product decisions with the user.
4. The main agent coordinates only and spawns a fresh maker subagent for each task with scoped context and no full history by default. The maker implements the task and records actual check results. Follow `docs/review-process.md` for handoffs, evidence, and review snapshots, including specification tasks.
5. Spawn a separate checker with scoped context. Return findings to that task's maker and obtain checker acceptance of the final snapshot before marking the task complete.
6. Archive the completed change following CLI guidance, merging requirements into `openspec/specs/`.

`openspec/specs/` contains current requirements; `openspec/changes/` contains active changes; `openspec/changes/archive/` contains completed changes. The initial directories are intentionally empty: product specifications have not been written yet.

This process description is not evidence of an executed automated loop. Claiming loop engineering requires a reproducible mechanism and a record of an actual run.

Documentation: https://github.com/Fission-AI/OpenSpec.
