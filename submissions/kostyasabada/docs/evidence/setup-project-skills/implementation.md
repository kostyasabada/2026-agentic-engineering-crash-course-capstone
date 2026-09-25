# setup-project-skills implementation

Maker: `/root/install_project_skills`, separate from the coordinator. Setup task before product specifications exist. Independent checker acceptance is pending.

## Acceptance criteria and results

- Installed only the two approved curated skills (`playwright`, `security-best-practices`) using the mandatory skill-installer helper from `openai/skills`, branch `main`, into the standard personal directory `/home/ksabada/.codex/skills/`. Network and personal-directory access were escalated and approved. `gh-fix-ci` remains absent.
- Inspected the cached official OpenSpec 1.13.2 CLI implementation and `init --help` before initialization. Legacy-artifact preflight found no local or global artifacts to clean up. Ran `init --tools codex --profile core --no-animation` from this submission with telemetry disabled. Generated six skills plus `.openspec-target` under the submission's `.agents/skills/`; no global commands were generated.
- Preserved `openspec/config.yaml` and the existing home OpenSpec configuration byte-for-byte, verified by before/after hashes. No application code, product change, or commit was created.
- Updated `AGENTS.md` and `docs/workflow.md` with installation scope, activation, pinned CLI substitution, and explicit interpretation of generated workflows under coordinator/maker/checker rules. Upstream skill files are unchanged. Completion requires checker acceptance; synchronous spec sync and review precede archive; specifications precede implementation.

## Verification and snapshot

`checks.txt` records the actual initialization, version, list, context, validation, prerequisites, preservation hashes, and all installed personal skill files with SHA-256 hashes. The CLI reports version 1.13.2, six generated files declare `generatedBy: "1.13.2"`, and the selected root is this submission. Strict validation exited 0 with “No items found to validate”; this is not product behavior validation. `git diff --check` passed. The initial help call emitted harmless stream-fd permission diagnostics and exited 0; subsequent initialization and checks exited 0.

`snapshot.txt` hashes all project deliverables, including this report and `checks.txt`, relative to the repository root. The snapshot and forthcoming `review.md` are evidence records outside the hashed scope. The external skill manifest in `checks.txt` freezes installed bytes because these curated skills do not declare release versions. Source: https://github.com/openai/skills/tree/main/skills/.curated. OpenSpec behavior was verified against the installed package's `dist/core/init.js`, `config.js`, `global-config.js`, and `legacy-cleanup.js` at version 1.13.2.

## Limitations and activation

The new personal skills are available on the next turn per the installer instructions. Restart Codex if they do not appear. Launch a task inside `submissions/kostyasabada/` for scoped OpenSpec discovery; a root-launched task must not assume downward discovery. Official discovery guidance was opened at https://learn.chatgpt.com/docs/build-skills. Runtime discovery/invocation in a new task is unverified. Playwright browser execution, browser binaries, and security review behavior were not tested. No application exists to exercise yet. The npm cache path is machine-specific and may disappear; documented pinned npx commands can fetch the same CLI version. No global CLI installation was performed.
