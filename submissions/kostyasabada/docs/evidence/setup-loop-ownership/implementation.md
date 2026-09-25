# setup-loop-ownership implementation

Maker: Claude Code general-purpose subagent (maker), spawned fresh by the coordinator with a scoped handoff. Setup task before any OpenSpec change exists. Independent checker acceptance is pending.

User decision (source: the user's request in the setup conversation, 2026-09-25, relayed in the coordinator handoff), refining the accepted agent loop decision in `docs/architecture.md`:

- The task's maker launches `scripts/agent-loop.sh`; the coordinator does not run the loop, because the loop changes deliverables and the coordinator does not implement them.
- `npm run check` is a deterministic command, not an agent; the loop runs it, and the checker reruns it independently.
- Each fix iteration is a fresh non-interactive agent process with scoped input only (task, failure output, owned files); it acts on the maker's side and does not count as a checker.
- Default fixer: Codex (`codex exec`); Claude Code (`claude -p`) remains selectable. Default checker: a separate Claude Code subagent (cross-tool maker/checker separation).
- A green loop does not complete a task: the checker reads the spec, changes, and `loop-run.log`, reruns checks, and gives the verdict per `docs/review-process.md`; findings return to the same maker, who may rerun the loop.
- The first change's design must also address permissions for launching agent CLIs from the script and cost control (the iteration limit).

## Acceptance criteria and results

1. `docs/architecture.md`: extended the existing agent loop bullet in "Accepted decisions" with an "Ownership (user decision)" passage covering the points above. The previous standalone sentence on checker acceptance was folded into it, and the design requirements list now also includes agent defaults, CLI launch permissions, and cost control through the iteration limit.
2. `docs/review-process.md`: added one "Agent loop" bullet under Roles: loop fix iterations are part of the maker's work, a green loop is not checker acceptance, and the checker also reviews `loop-run.log`.
3. `openspec/config.yaml`: added one `rules.design` rule on loop ownership (maker launches), fixer and checker defaults, CLI launch permissions, and cost control. No unquoted `": "`; the parse check shows 4 string rules.
4. `docs/evidence/README.md`: added a "Loop ownership decision" entry (task, user decision, action, source) in the existing style.
5. No scripts, hooks, settings, dependencies, or code created. `AGENTS.md` and `CLAUDE.md` unchanged: no contradiction found (AGENTS.md defers details to `docs/review-process.md`). English only; all changes are inside `submissions/kostyasabada/`.
6. Evidence: this file, `checks.txt`, `snapshot.txt`. `review.md` is left to the checker.

## Verification and snapshot

`checks.txt` records actual commands, output, and exit codes: `git diff --check` (exit 0, no output); a PyYAML parse listing `rules.design` (4 strings, including the new rule), exit 0; `npx --yes @fission-ai/openspec@1.13.2 validate --all --strict` (exit 0, "No items found to validate"; no specs or changes exist, so this is not product validation); `git status --short --untracked-files=all` (the four modified files plus the untracked evidence files), exit 0.

Base commit: `6b636c3` (nothing committed). `snapshot.txt` lists SHA-256 hashes of the changed files, this report, and `checks.txt`, with paths relative to the repository root. `snapshot.txt` itself and the forthcoming `review.md` are outside the hashed scope.

## Limitations

- The checks ran while this report existed as an empty placeholder (so `git status` would list it); it was written afterwards and describes those results. Its final hash is in `snapshot.txt`.
- Whether `npx` fetched OpenSpec from the network or the local npm cache was not recorded.
- The decision is recorded only; no loop script, `npm run check`, CLI permission setup, or tests exist. Their behavior must be designed and verified in the first OpenSpec change.
