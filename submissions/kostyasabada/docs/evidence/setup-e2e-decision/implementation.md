# setup-e2e-decision implementation

Maker: Claude Code general-purpose subagent (maker), spawned fresh by the coordinator with a scoped handoff. Setup task before any OpenSpec change exists (`openspec/changes/` contains only `archive/`). Independent checker acceptance is pending.

User decision (from the coordinator handoff): browser end-to-end tests use `@playwright/test` as a dev dependency, committed in the project and runnable with a single command so the checker can rerun them independently. The first OpenSpec change's design must detail the setup. Agent-driven browser checks (the personal Codex `playwright` CLI skill in `~/.codex/skills/`, or the Claude Code built-in browser) remain supplementary for quick manual checks and screenshots, not a substitute for the automated tests.

## Acceptance criteria and results

1. `docs/architecture.md`: added one "Accepted decisions" bullet recording the decision and requiring the first OpenSpec change's design to specify the Playwright configuration, test location, dev server startup for tests, and the exact run command. In "Open decisions", "dependencies have not been installed" became "No dependencies, including Playwright, have been installed" so it does not contradict the new decision.
2. `docs/testing.md`: the intro now states the planned scenarios will be automated as `@playwright/test` browser end-to-end tests (referencing `architecture.md`), with exact commands added alongside the tests. Added one paragraph stating agent-driven browser checks and screenshots are supplementary. The planned scenarios and the "planned checks, not results" statement are unchanged.
3. `docs/evidence/README.md`: added an "E2E testing decision" entry (task, user decision, action, source) in the existing style.
4. `openspec/config.yaml`: added one `rules.design` rule: "Specify browser E2E tests with @playwright/test (dev dependency), including configuration, test location, dev server startup, and the exact run command." The suggested wording with `(dev dependency): configuration` was rephrased because an unquoted `": "` would make YAML parse the item as a mapping instead of a string; the parse check confirms both design rules are strings.
5. No dependencies installed; no `package.json`, code, or test files created. English only. All changes are inside `submissions/kostyasabada/`.
6. Evidence: this file, `checks.txt`, `snapshot.txt`. `review.md` is left to the checker.

## Verification and snapshot

`checks.txt` records actual commands, output, and exit codes: `git diff --check` (exit 0, no output), a PyYAML parse of `openspec/config.yaml` (exit 0; `rules.design` is a list of two strings), a check that no `package.json` or `node_modules` exists, `npx --yes @fission-ai/openspec@1.13.2 validate --all --strict` (exit 0, "No items found to validate"; no specs or changes exist, so this is not product validation), and `git status --short` (the four modified files).

Base commit: `e2cb857142168e3cc0a1b800f7acdfd0cc212c32` (nothing committed). `snapshot.txt` lists SHA-256 hashes of the changed files and of this report and `checks.txt`, relative to the repository root. `snapshot.txt` itself and the forthcoming `review.md` are outside the hashed scope.

## Limitations

- `git status --short` in `checks.txt` was run while the new evidence directory was still empty, so it does not list the untracked `docs/evidence/setup-e2e-decision/` files; they are listed in `snapshot.txt`.
- The `package.json`/`node_modules` absence check pipes through `head`, so its recorded exit code is that of the pipeline, not of `ls`; the output shows both paths are absent.
- Whether `npx` fetched OpenSpec from the network or the local npm cache was not recorded.
- The decision is recorded only; no Playwright configuration, tests, or commands exist yet. Their correctness must be verified in the first OpenSpec change.
