# setup-loop-hook-decision implementation

Maker: Claude Code general-purpose subagent (maker), spawned fresh by the coordinator with a scoped handoff. Setup task before any OpenSpec change exists. Independent checker acceptance is pending.

User decisions (source: the user's request in the setup conversation, 2026-09-25, relayed in the coordinator handoff):

- A. Agent loop: the first OpenSpec change adds `scripts/agent-loop.sh`, which runs `npm run check` (lint, type check, unit tests, Playwright E2E); on failure it passes the failure output to a selectable non-interactive agent run (`claude -p` or `codex exec`) and repeats until checks are green or an iteration limit (default 5) is reached. Each run writes a per-iteration log (iteration number, check result, stop reason) to `docs/evidence/<task-id>/loop-run.log`. At least one real task must run through the loop with its log committed. Loop results still need separate checker acceptance.
- B. Dynamic context hook: the first OpenSpec change adds a Claude Code `SessionStart` hook in the project `.claude/settings.json` that runs the pinned OpenSpec CLI `list --json` and injects active changes into session context. Codex parity is evaluated in the design; a missing equivalent is documented as a limitation. A sample of actual hook output is recorded as evidence.

## Acceptance criteria and results

1. `docs/architecture.md`: added two "Accepted decisions" bullets (A and B), each stating what the first change's design must specify. "Open decisions" now also states the loop script and hook do not exist yet.
2. `docs/testing.md`: one sentence that `npm run check` is the planned single check command used by the agent loop, to be defined with the tests.
3. `docs/workflow.md`: one sentence after the existing "not evidence of an executed automated loop" paragraph (kept unchanged) pointing to `architecture.md` and stating neither mechanism exists yet.
4. `openspec/config.yaml`: added one `rules.design` rule (loop script and SessionStart hook details) and one `rules.tasks` rule (run a real task through the loop and commit `loop-run.log`; record actual hook output; checker acceptance still required). No unquoted `": "`; the parse check shows all rules are strings.
5. `docs/evidence/README.md`: added a "Loop and dynamic context decision" entry (task, user decision, action, source) in the existing style.
6. No scripts, hooks, settings, dependencies, or code created; `AGENTS.md` and `CLAUDE.md` unchanged (no new context-map row needed, since the decision lives in `docs/architecture.md`). English only; all changes are inside `submissions/kostyasabada/`.
7. Evidence: this file, `checks.txt`, `snapshot.txt`. `review.md` is left to the checker.

## Verification and snapshot

`checks.txt` records actual commands, output, and exit codes: `git diff --check` (exit 0, no output); a PyYAML parse listing `rules.design` (3 strings) and `rules.tasks` (3 strings), exit 0; `ls -d scripts .claude/settings.json package.json` (exit 2, all three absent); `npx --yes @fission-ai/openspec@1.13.2 validate --all --strict` (exit 0, "No items found to validate"; no specs or changes exist, so this is not product validation); `git status --short` and `git status --short --untracked-files=all` (the five modified files plus the untracked evidence files).

Base commit: `6982f267d394262b43d5bd4038006683b40ac3f3` (nothing committed). `snapshot.txt` lists SHA-256 hashes of the changed files, this report, and `checks.txt`, with paths relative to the repository root. `snapshot.txt` itself and the forthcoming `review.md` are outside the hashed scope.

## Limitations

- The checks ran before this report had content (it existed as an empty file so `git status` would list it); the report was written afterwards and describes those results. Its final hash is in `snapshot.txt`.
- Whether `npx` fetched OpenSpec from the network or the local npm cache was not recorded.
- The decisions are recorded only; no loop script, hook, `npm run check`, or tests exist. Their behavior and Codex parity must be verified in the first OpenSpec change.
