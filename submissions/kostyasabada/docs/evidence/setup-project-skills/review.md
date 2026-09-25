# setup-project-skills independent review

Checker: `/root/check_project_skills`, separate from coordinator `/root` and maker `/root/install_project_skills`. Review round 1, 2026-09-25.

Verdict: **accepted** for the installation and documentation scope in `snapshot.txt`. No blocking findings.

## Reviewed scope and findings

Read `AGENTS.md`, `docs/review-process.md`, `docs/workflow.md`, the maker report and check log, and the generated apply/archive instructions. Inspected the remaining generated workflow metadata and relevant artifact/completion instructions. The approved scope is the two personal curated skills plus the submission's OpenSpec Codex integration; `gh-fix-ci` is excluded.

The added project rule and workflow guidance explicitly preserve fresh makers, separate checkers, scoped handoffs, and acceptance of the final snapshot. They qualify the generated apply workflow's immediate checkmarks and completion examples: implementation alone and CLI `all_done` do not establish reviewed completion. They also require specification commits before implementation and synchronous spec synchronization plus independent review before archive. Generated upstream instructions are retained with these project-level constraints documented. These are agent instructions, not an automated enforcement mechanism.

## Independently executed checks

- Recomputed all 11 SHA-256 entries in `snapshot.txt`: all matched current files, including the maker report and check log.
- Enumerated every actual file under the two personal skill directories and compared both paths and SHA-256 values with the external manifest in `checks.txt`: exact matches, 9 Playwright files and 13 security-best-practices files.
- Confirmed `/home/ksabada/.codex/skills/gh-fix-ci` does not exist.
- Confirmed exactly six generated `SKILL.md` files under this submission's `.agents/skills/`, each declaring `generatedBy: "1.13.2"`; `.openspec-target` contains `codex`.
- Compared `openspec/config.yaml` byte-for-byte with `git show HEAD:submissions/kostyasabada/openspec/config.yaml`: identical.
- Recomputed the home OpenSpec configuration hash: matched the maker's recorded preserved hash `a1ad1ab40a0f36666817b0513511ac86044846fd9316af098b448beb3eee4680`.
- Ran the documented offline pinned `openspec list --json` command from this submission: exit 0, no active changes, and the correct submission path selected as the nearest root. The command emitted three `Failed to create stream fd: Operation not permitted` diagnostics before valid JSON; they did not prevent this check.
- Ran `git diff --check`: exit 0. Reviewed the AGENTS/workflow diff for consistency with the existing review process.

## Limitations

No browser was installed or launched, no security review was exercised, and no application tests were appropriate for this setup-only review. Runtime skill discovery/invocation in a newly launched task remains unverified, as the maker documents. The personal-file checks establish installed bytes against the recorded manifest, not independent remote-source provenance. The home configuration preservation check relies on the maker's pre-installation hash; the project configuration has the independent Git baseline. The maker's strict OpenSpec validation reported no items to validate and is not product verification. Repository-wide change-scope verification is assigned to the coordinator.

This review is an evidence record added after the frozen snapshot and is intentionally outside its hashed scope. No reviewed deliverable was edited by the checker.
