# setup-claude-compat implementation

Maker: Claude Code general-purpose subagent (maker), spawned fresh by the coordinator with a scoped handoff. Setup task before product specifications exist. Independent checker acceptance is pending.

User decision (from the coordinator handoff): the user works on this project with both ChatGPT/Codex and Claude Code, and wants Claude Code to read and follow the same rules and instructions.

## Acceptance criteria and results

1. `CLAUDE.md` created in the submission root. Its first line is `@AGENTS.md`, making `AGENTS.md` the single source of rules. It adds only a short "Claude Code mapping" section: launch directory, the Agent-tool equivalent of Codex `fork_turns="none"` (fresh subagent, self-contained handoff, never a context-inheriting fork), and the `.claude/skills/` location with the `openspec` substitution reference to `docs/workflow.md`. No rules from `AGENTS.md` are duplicated.
2. Created `.claude/skills/<skill-name>` for all six OpenSpec skills as relative symlinks to `../../.agents/skills/<skill-name>` (`.openspec-target` not linked). Each resolves to `.agents/skills/<skill-name>` and `SKILL.md` is readable through it. Upstream `SKILL.md` hashes are identical before and after, identical through the symlinks, and identical to `../setup-project-skills/snapshot.txt`. `git diff HEAD -- .agents openspec/config.yaml` is empty.
3. Tool-neutral qualifiers:
   - `AGENTS.md`: delegation bullet now reads "(Codex: `fork_turns="none"`; Claude Code: see `CLAUDE.md`)"; added a context-map row for `CLAUDE.md`.
   - `docs/review-process.md`: the Scoped handoffs `fork_turns="none"` parenthetical got the same Codex/Claude Code qualifier.
   - `docs/workflow.md`: added a "Claude Code" subsection before Commands: user decision, `@AGENTS.md` import, symlinks with `.agents/skills/` as single source, `/openspec-propose` invocation, warning that `--tools claude` re-initialization would create duplicate copies, same `openspec` substitution and maker/checker rules, personal Codex skills not exposed, and runtime discovery unverified.
   - `openspec/config.yaml`: unchanged.
4. `docs/evidence/README.md`: added "Claude Code compatibility decision" entry (task, user decision, action, source) in the existing style.
5. Evidence: this file, `checks.txt`, `snapshot.txt`. `review.md` is left to the checker.

## Verification and snapshot

`checks.txt` records actual commands, output, and exit codes: pre-change and post-change `sha256sum` of upstream `SKILL.md` files, `ls -la .claude/skills`, `readlink`, readability of `SKILL.md` through each link, `realpath`, hash comparison against the earlier snapshot, unchanged `.agents/` and `openspec/config.yaml`, `git diff --check` (exit 0, no output), a whitespace check on untracked `CLAUDE.md`, `git status --short`, `git ls-files --others` / `git add --dry-run` (the six links appear as single entries, i.e. Git will store them as symlinks), and `npx --yes @fission-ai/openspec@1.13.2 validate --all --strict` (exit 0, "No items found to validate"; no specs exist yet, so this is not product validation). All recorded checks exited 0.

Base commit: `1d6d28efbd4efc7d1a1607714b18644ee400afd2` (nothing committed). `snapshot.txt` lists SHA-256 hashes of the changed and new files, including this report and `checks.txt`, relative to the repository root. Symlinks are recorded by their `readlink` target instead of a hash. `snapshot.txt` itself and the forthcoming `review.md` are outside the hashed scope.

## Limitations

- Runtime behavior in a new Claude Code session was not verified: that `@AGENTS.md` is expanded, that the symlinked skills are discovered, and that `/openspec-propose` etc. are invocable. Only filesystem resolution was verified.
- Symlinks require a filesystem and Git checkout that support them (e.g. Windows without symlink support would check them out as plain text files).
- Regenerating the OpenSpec Codex integration could remove or rename skill directories; the symlinks must be rechecked afterwards.
- The personal Codex skills (`playwright`, `security-best-practices`) in `~/.codex/skills/` are not available to Claude Code; no equivalent was installed.
- Validation used the documented `npx --yes` command, not the offline cache variant; whether npx fetched from the network or the local npm cache was not recorded.
