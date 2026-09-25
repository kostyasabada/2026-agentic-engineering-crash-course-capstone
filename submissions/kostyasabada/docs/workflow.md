# OpenSpec workflow

OpenSpec 1.13.2 has been initialized with the `spec-driven` schema. We use the CLI; editor integrations and slash commands have not been installed.

## Commands

Run from `submissions/kostyasabada/`. The version is pinned in the commands; no global installation is needed. The first run requires access to npm.

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
