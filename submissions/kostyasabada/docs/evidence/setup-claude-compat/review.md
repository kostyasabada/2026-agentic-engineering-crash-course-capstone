# setup-claude-compat review

Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker.

## Review round 1

- Date: 2026-09-25
- Reviewed snapshot: `snapshot.txt` in this directory (base commit `1d6d28efbd4efc7d1a1607714b18644ee400afd2`, uncommitted working tree): SHA-256 hashes for `CLAUDE.md`, `AGENTS.md`, `docs/review-process.md`, `docs/workflow.md`, `docs/evidence/README.md`, `docs/evidence/setup-claude-compat/implementation.md`, `docs/evidence/setup-claude-compat/checks.txt`, plus six symlinks under `.claude/skills/` recorded by `readlink` target. This `review.md` is outside the hashed scope.
- Inputs read: task acceptance criteria from the coordinator handoff, `docs/review-process.md`, `AGENTS.md`, `CLAUDE.md`, full `docs/workflow.md`, `git diff` of all tracked changes, untracked files, and the maker evidence (`implementation.md`, `checks.txt`, `snapshot.txt`).

### Acceptance criteria

1. Met. `CLAUDE.md` line 1 is `@AGENTS.md`; the remaining "Claude Code mapping" section states `AGENTS.md` is the single source and only maps: launch directory, fresh Agent-tool subagents as the `fork_turns="none"` equivalent with no context-inheriting forks for maker/checker, skills at `.claude/skills/` as symlinks, and the `openspec` substitution by reference to `docs/workflow.md`. No `AGENTS.md` rule is restated.
2. Met. All six `.claude/skills/<name>` entries are symlinks with target `../../.agents/skills/<name>`; `.openspec-target` is not linked. Upstream `SKILL.md` hashes are unchanged and match `docs/evidence/setup-project-skills/snapshot.txt`.
3. Met. `AGENTS.md` delegation bullet qualified (Codex / Claude Code) and a context-map row added; `docs/review-process.md` Scoped handoffs parenthetical qualified with a correct relative link `../CLAUDE.md`; `docs/workflow.md` gained a "Claude Code" subsection including the `--tools claude` duplication warning and an explicit statement that runtime discovery/invocation is unverified. `openspec/config.yaml` unchanged and contains no Codex-specific `fork_turns` wording needing edits.
4. Met. `docs/evidence/README.md` has a "Claude Code compatibility decision" entry in the existing style; its statements match the diff.
5. Met. `implementation.md`, `checks.txt`, `snapshot.txt` present; no maker-written `review.md`.

Constraints: English only (the only non-ASCII character in the reviewed files is a pre-existing em dash in `AGENTS.md`); no changes outside `submissions/kostyasabada/`; no application code, dependencies, or commits.

### Findings

No blocking findings. Two non-blocking observations for the coordinator's information (no change required for acceptance):

- O1 (informational, `CLAUDE.md` lines 7-9 and `docs/workflow.md` "Claude Code" subsection): the launch directory and "fresh Agent-tool subagent, not a context-inheriting fork" statements appear in both files, and `docs/review-process.md` line 13 also names the Claude Code equivalent. This overlap is mandated by acceptance criteria 1 and 3 and the wording is consistent (no contradictions found), but future edits must keep the three places in sync, given the `AGENTS.md` rule against duplicating requirements.
- O2 (informational, upstream `.agents/skills/*/SKILL.md` frontmatter): each skill declares `allowed-tools: Bash(openspec:*)`. In Claude Code this pre-approves only a bare `openspec` executable; the project's substituted `npx --yes @fission-ai/openspec@1.13.2 ...` commands will not be pre-approved by that frontmatter and may trigger permission prompts. Upstream files must stay unchanged, so this is a usage note, not a defect.

### Independently executed checks

Run by the checker on 2026-09-25.

| Check | Result |
|---|---|
| `sha256sum -c` on the seven hashed snapshot entries (from repo root) | all 7 `OK`, exit 0 |
| `readlink` on each `.claude/skills/*` | all six `-> ../../.agents/skills/<name>` |
| `realpath --relative-to=.` on each link | all resolve to `.agents/skills/<name>` |
| Read `SKILL.md` through each link (frontmatter line 2) | `name:` matches directory for all six |
| `sha256sum` through links vs `.agents/skills/*/SKILL.md` | identical, diff exit 0 |
| `.agents/skills/*/SKILL.md` vs `docs/evidence/setup-project-skills/snapshot.txt` | identical, diff exit 0 |
| `git diff --stat HEAD -- .agents openspec/config.yaml` | empty, exit 0 |
| `git status --short` from repo root | only paths under `submissions/kostyasabada/` (4 modified, 3 untracked) |
| `git diff --check` from repo root | no output, exit 0 |
| `git check-ignore -v .claude/skills/openspec-propose CLAUDE.md` | not ignored (exit 1) |
| No `CLAUDE.md`/`AGENTS.md`/`.claude` at repository root or `submissions/` | confirmed; no parent memory file competes |
| `npx --yes @fission-ai/openspec@1.13.2 validate --all --strict` | `No items found to validate.`, exit 0 (no specs exist yet; not product validation) |
| `npx --yes @fission-ai/openspec@1.13.2 init --help` | `--tools` accepts `claude`, supporting the workflow.md warning |

Consistency: `CLAUDE.md`, `AGENTS.md`, `docs/workflow.md`, and `docs/review-process.md` agree on the coordinator/maker/checker model, the Claude Code subagent mapping, the launch directory, and the `openspec` substitution. The mapping is accurate for Claude Code: `@path` imports in `CLAUDE.md` are a Claude Code memory feature, project skills are discovered from `.claude/skills/<name>/SKILL.md`, and skills are user-invocable as `/<name>`.

### Limitations

- Runtime behavior was not verified in a Claude Code session started after the change: this checker session's skill list does not include the OpenSpec skills, but the symlinks were created during the same session (18:03), so this is neither evidence for nor against discovery. `@AGENTS.md` expansion was also not verified at runtime.
- Symlink portability (for example Windows checkouts without symlink support) was not tested.
- Whether `npx` fetched from the network or the local cache was not recorded; the offline variant was not needed.

### Verdict

`accepted`
