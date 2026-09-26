# Implementation: add-realtime-chat-room-1-4

## Task

Task 1.4 in `openspec/changes/add-realtime-chat-room/tasks.md`: implement `scripts/agent-loop.sh` per `specs/agent-loop/spec.md` (normative) and design D7 (P16 interface, P17 CLI invocation and permissions, P22 stop reasons, fingerprint, log format, interrupt handling, cost control), with `scripts/agent-loop.test.ts` (Vitest) driving it through `AGENT_LOOP_CHECK_CMD`, `AGENT_LOOP_FULL_CHECK_CMD`, and fake `claude`/`codex` executables on `PATH`, covering every case listed in the task; confirm the real CLI flags with `claude --help` and record whether Codex is installed. Verify: `npm run test:unit` exit 0 with these tests, `npm run check` exit 0, and a recorded manual usage-error run.

## Maker

Claude Code general-purpose subagent (maker), spawned by the coordinator with a scoped handoff and no full conversation history. Nothing staged or committed; the task checkbox is not ticked; no `review.md` written.

Runtime: Node v24.21.0, npm 11.19.0 (`PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH`), GNU bash 5.3.9(1)-release, base commit `1da166d`. Tools used by the script on this machine: `/usr/bin/timeout` (uutils coreutils 0.8.0, not GNU), `/usr/bin/setsid` (util-linux 2.41.3), `sha256sum`, `git`, `ps` (procps-ng 4.0.4), GNU sed 4.9. `shellcheck` is not installed (not installed by the maker, per the handoff).

## Changes

- `scripts/agent-loop.sh` (new, mode `-rwxr-xr-x`, passes `bash -n`):
  - Interface of P16: `--task-id` (required, `^[a-z0-9][a-z0-9-]*$`), `--brief` (required, readable file), `--agent claude|codex` (default `claude`), `--max-iterations` (1–10, default 5), `--agent-timeout` (default 900 s). Any invalid, missing, or unknown argument prints the usage to stderr and exits 64 before any check, agent, or log write. `-h`/`--help` prints the usage to stdout and exits 0.
  - Resolves the brief, then `cd`s to the parent of `scripts/` (the project root) and works there.
  - `AGENT_LOOP_CHECK_CMD` / `AGENT_LOOP_FULL_CHECK_CMD` override `npm run check:loop` / `npm run check` (test seam of P16); the values used are written in the log header.
  - Iteration: iteration 0 = fast check; when it passes, the full check runs in the same iteration; each further iteration = one fixer run + fast check (+ full check if the fast check passes). Stop reasons and exits exactly as P22/D7: `checks_passed` 0, `max_iterations_reached` 1, `agent_error` 2 (executable missing via `command -v`, non-zero exit, or timeout; the cause is logged), `no_progress` 3.
  - Fixer invocation exactly as P17: `claude -p --permission-mode acceptEdits --allowedTools "Read" "Edit" "Write" "Glob" "Grep" "Bash(npm run lint)" "Bash(npm run typecheck)" "Bash(npm run test:unit)" --no-session-persistence --output-format text --max-budget-usd "${AGENT_LOOP_CLAUDE_MAX_USD:-2}"`, or `codex exec --sandbox workspace-write --cd <project-root> -`; the prompt goes on stdin; each run is wrapped in `timeout --kill-after=10 <agent-timeout>`. No resume/continue flag, no permission bypass, no Git permission.
  - Fixer prompt: fixed preamble (one fix iteration; edit only the "Owned files" of the brief; do not weaken, skip, or delete tests or specifications; do not commit, push, stage, or change Git history or the index; do not edit `tasks.md` or tick checkboxes; do not write review files or verdicts; stop when done; the run is not a review) + the brief + the last 200 lines (at most 20 KB, ANSI stripped) of the failing check's output. The prompt is written to a `mktemp` file for stdin and removed afterwards.
  - No-progress fingerprint as D7: SHA-256 over `git status --porcelain=v1 --untracked-files=all`, `git diff --binary HEAD` (empty tree if there is no commit), and one line per untracked, non-ignored entry from `git ls-files --others --exclude-standard -z` sorted by path (symlink → `readlink` text, readable regular file → its SHA-256, anything else → `unreadable:<path>`; no command in this part can fail the pipeline), all limited by the pathspec `-- . ':(exclude)docs/evidence/<task-id>/loop-run.log' ':(exclude).agent-loop'`. The "after" fingerprint is taken after the agent entry has been appended to the log, so the exclusion of an already committed log is actually exercised.
  - Process handling: every check and fixer run starts via `setsid` in its own session and process group, and the script waits with the `wait` builtin. `trap` on `INT`/`TERM` sends TERM to the child's group, escalates to KILL after 5 s, waits until no live group member remains, appends a best-effort line `=== run interrupted=<time> signal=<INT|TERM> fixer_runs=<n> exit=130`, and exits 130. After every normal child exit, leftover members of its group are terminated the same way.
  - Log (`docs/evidence/<task-id>/loop-run.log`, append-only, created with its directory): the D7 header (`start`, `task_id`, `agent`, `max_iterations`, `agent_timeout_s`, `check_cmd`, `full_check_cmd`, `git_head`, `node`), one entry per check (`iteration`, `phase=check|full_check`, `exit`, `result=pass|fail`, `duration_s`) and per fixer run (`iteration`, `phase=agent`, `exit`, `duration_s`, `cause=timeout|exit_code` on failure, `changed_files` when non-empty), a failing check excerpt (last 40 lines, ANSI stripped, at most 500 bytes per line, prefixed `  | `), and the footer (`end`, `stop_reason`, `fixer_runs`, `exit`). Values containing whitespace, quotes, or backslashes are double-quoted. No environment is dumped. Full outputs go to `.agent-loop/<task-id>/<run-id>/iter-<n>-{check,full_check,agent}.txt` (git-ignored). Final stdout line: `Loop finished: <stop_reason>. Independent checker review is still required.`
- `scripts/agent-loop.test.ts` (new): 44 Vitest tests. Each test copies the script into a fresh temporary Git repository under `os.tmpdir()` (so that repository is the script's project root and the real project is never touched), overrides both check commands, and puts a `bin/` directory with fake `claude`/`codex` scripts first on a `PATH` from which every directory containing a real `claude` or `codex` executable is removed (so no test can start a real, paid agent run). The fakes record their argv, stdin, working directory, and run count in a state directory outside the repository. Short time limits (`--agent-timeout 1`) keep the suite at about 13–14 s. `afterEach` kills any recorded PID that is still alive and removes the temporary directory.

`vitest.config.ts` already includes `scripts/**/*.test.ts`; `eslint.config.mjs`, `package.json`, `.gitignore` (`.agent-loop/` already ignored), and the planning artifacts are unchanged.

## Criteria mapping (task 1.4 case → test in `scripts/agent-loop.test.ts`)

All test names below are under `describe('agent-loop.sh')`.

| Task 1.4 case | Test(s) |
|---|---|
| Usage errors (64): missing task id | `usage errors` › `no arguments…`, `missing task id…` (also `missing brief`, invalid task ids, missing brief file, option without value, unknown option, positional argument) — each asserts exit 64, `Usage:` on stderr, empty stdout, no check run, no agent run, no log directory |
| Usage errors (64): invalid iteration limits | `usage errors` › `iteration limit 0`, `negative iteration limit`, `non-numeric iteration limit`, `fractional iteration limit`, `iteration limit above 10`, `empty iteration limit` (also `agent timeout 0`, `non-numeric agent timeout`) |
| Usage errors (64): unknown agent | `usage errors` › `unknown agent`, `empty agent` |
| Invocation from another directory | `invocation` › `runs the checks in the project root and logs there when invoked from a subdirectory`, `… when invoked from outside the project` |
| Default agent `claude` and limit 5 in the header | `invocation` › `uses agent claude, limit 5, timeout 900 s, and the real check commands by default` (only `--task-id` and `--brief`; header also shows `check_cmd="npm run check:loop" full_check_cmd="npm run check"` and `git_head`) |
| Already green | `check-and-fix iteration` › `already green: starts no agent, stops with checks_passed, exits 0` |
| Fixed within the limit | `check-and-fix iteration` › `fixed within the limit: records iterations 0, 1, 2 and the full check, exits 0` |
| Full check failing after the fast check passes | `check-and-fix iteration` › `full check failing after the fast check passes feeds the fixer and continues` (asserts the full check's output reaches the fixer prompt) |
| Limit reached (1) | `check-and-fix iteration` › `limit 1 reached…`, `limit 3 reached…` (exactly N agent runs, N+1 checks, exit 1) |
| `agent_error` (2): missing executable | `early stops` › `agent_error when the claude executable is missing`, `agent_error when the codex executable is missing` |
| `agent_error` (2): non-zero exit | `early stops` › `agent_error when the fixer exits non-zero, recording its exit code` |
| `agent_error` (2): timeout | `early stops` › `agent_error when the fixer exceeds the time limit; the fixer and its children are terminated` |
| `no_progress` (3) | `early stops` › `no_progress when the fixer exits 0 without changing the working tree` (also `no_progress when the fixer only changes an ignored file`) |
| Untracked-only edit is progress (temporary Git repository) | `early stops` › `editing only the content of an untracked, non-ignored file counts as progress` (the file's status line stays `?? notes.txt`; only its content changes) |
| Broken untracked symlink and unreadable untracked file do not abort; symlink retarget is progress | `early stops` › `a broken untracked symlink and an unreadable untracked file do not abort the loop; retargeting the symlink is progress` (skipped only when running as root) |
| Committed `loop-run.log` appended, no other change → `no_progress` | `early stops` › `an already committed loop-run.log that gets appended is not progress` |
| Interrupt during a long-running fixer: fixer and children terminated, PID gone, exit 130 | `interrupt` › `SIGINT during a long-running fixer terminates it and its children and exits 130`; also `Ctrl+C (SIGINT to the process group) during a check that exits 0 on SIGINT is not treated as green` |
| Log header/entries/footer | `run log` › `records header, failing check with a bounded ANSI-free excerpt, agent, passing checks, and footer` (spec scenario "Log records a successful loop"; also: no secret env value in the log, output files under `.agent-loop/`), `limits the fixer input to the last 200 lines of the failing output`; entries/footers are also asserted line by line in the iteration and early-stop tests |
| Append-only log | `run log` › `appends: a second run keeps the first record unchanged and adds its own after it` |
| No checkbox/commit changes | `green loop is not acceptance` › `changes no checkbox, commit, or review file, and says checker review is still required` |
| Real CLI flags (P17) | `invocation` › `passes the fixed Claude Code flags, no git permission, and the prompt on stdin`, `runs \`codex exec\` in the project root with the prompt on stdin when codex is selected`; `claude --help` recorded in `checks.txt` |

## `claude --help` vs. P17

`claude --version`: `2.1.198 (Claude Code)` (the version named in P17). `claude --help` (full output in `checks.txt`) lists every flag P17 uses: `-p, --print`, `--permission-mode <mode>` with choice `acceptEdits`, `--allowedTools, --allowed-tools <tools...>`, `--no-session-persistence` ("only works with --print"), `--output-format <format>` with choice `text`, and `--max-budget-usd <amount>` ("only works with --print"). The bypass options P17 excludes (`--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`, `--permission-mode bypassPermissions`) and the resume options (`-c, --continue`, `-r, --resume`) exist and are not used. `--allowedTools` is variadic; the script passes no positional prompt (stdin only), so the option list ends at the next `--` option. The real `claude -p` was not run (cost; per the handoff), so reading the prompt from stdin and the effect of the permission flags in a real run are not verified here; task 2.1 is the first real run.

Codex: `command -v codex` exits 1 (not installed), so `codex exec --help` could not be recorded; the Codex invocation stays unverified as D7 states. `shellcheck`: `command -v shellcheck` exits 1 (not installed); not run.

## Interrupt handling and the Playwright SIGINT behavior

Playwright exits 0 when it is interrupted by SIGINT. The loop cannot misclassify such a run as green because (1) every check runs in its own session (`setsid`), so a terminal Ctrl+C (SIGINT to the foreground process group) reaches only the script, not the check; (2) the script's `INT`/`TERM` trap runs as soon as `wait` is interrupted, terminates the check's process group, and exits 130 before any exit code of the interrupted check is evaluated, so no `result=pass`, full check, agent run, or `checks_passed` footer can follow. The test `Ctrl+C (SIGINT to the process group) during a check that exits 0 on SIGINT is not treated as green` uses a check that, like Playwright, exits 0 on SIGINT/SIGTERM, sends SIGINT to the script's whole process group, and asserts exit 130, no `result=pass`, no full check, no agent run, and that the check and its child PIDs are gone.

## Ambiguities and deviations (planning artifacts not changed)

1. **Relative `--brief` path base.** Neither the spec nor D7 says whether a relative brief path is resolved from the caller's directory or from the project root (they coincide for the documented invocation from the project root). Chosen: the caller's directory (ordinary CLI convention), resolved before the `cd`. Tested with `--brief brief.md` from `docs/`.
2. **Log header shows the check commands although they can come from environment variables.** The spec requires the header to contain the fast and full check commands and forbids "environment variable values" in the log; D7 says the override values are written to the header so a checker can confirm real runs used the real commands. Followed the spec's explicit header content and D7; no other environment value is logged (tested with a secret-looking variable). Flagged in case the prohibition was meant to cover the overrides too.
3. **Interrupt record.** The spec says "Every stop MUST be recorded in the run log"; D7 says no footer is guaranteed after an interrupt. The script appends a best-effort `=== run interrupted=… signal=… fixer_runs=… exit=130` line (not a `stop_reason`, so the four stop reasons stay unchanged). Additive to the D7 log format.
4. **Missing required tools** (`git`, `timeout`, `setsid`, `sha256sum`, `ps`) are reported as a usage error (exit 64, no log) before any check. The spec defines no exit code for this; 64 keeps the defined code set unchanged.
5. **Scratch output directory name.** D7 names it `.agent-loop/<task-id>/<run-start>/`; the script uses `<run-start in compact form YYYYMMDDTHHMMSSZ>-<pid>` so that two runs within the same second (as in the append test) do not overwrite each other, and no colons appear in path names.
6. **`no_progress` does not rerun the check.** When the fingerprint is unchanged after a successful fixer run, the checks are known to fail (unchanged tree), so the loop stops without another check run (saves a full `check:loop`). The spec's "while the checks still fail" is taken from the last check result.
7. **`changed_files`** is cumulative relative to `HEAD` (`git diff --name-only --relative HEAD` plus untracked files, same pathspec, comma-separated, omitted when empty), not the per-run delta; D7 defines it as informational only.
8. **`--agent-timeout` upper bound** 86400 s (D7 names only the default); limits outside 1–86400 are usage errors.
9. **Leftover group members after a normal child exit** are terminated (TERM, then KILL after 5 s) so no loop child process remains running; D7 describes this only for interrupts.

## Snapshot

`snapshot.txt` in this directory: SHA-256 of `scripts/agent-loop.sh`, `scripts/agent-loop.test.ts`, this file, and `checks.txt`, paths from the repository root, base `1da166d`.

## Checks (all in `checks.txt`, with exact commands, output, and measured exit codes)

- Environment: `node --version` v24.21.0, `bash --version | head -1` GNU bash 5.3.9(1)-release, tool versions; `command -v shellcheck` exit 1, `command -v codex` exit 1; `claude --version` 2.1.198; `claude --help` full output.
- Red run (test file written, script absent): `npx vitest run scripts/agent-loop.test.ts` → exit 1, `Tests  44 failed (44)`, every failure `ENOENT … copyfile …/scripts/agent-loop.sh`.
- Script created: `ls -l scripts/` shows `-rwxr-xr-x … agent-loop.sh`; `bash -n` exit 0.
- First green attempt: exit 1, 43 passed, 1 failed — the failure was a wrong assertion in the test itself (it expected `line 1\u001b` in the raw output file, but the raw line is `\u001b[31mFAIL\u001b[0m line 1`); the assertion was corrected to the actual raw form, script unchanged. Next run: exit 0, `Tests  44 passed (44)`. Verbose run: all 44 names with durations, exit 0, no leftover `sleep 300` process.
- Mutation checks (helper `mutate14.sh`: temporary edit of the script, targeted tests, restore with SHA-256 verification): removing the `loop-run.log` exclusion fails the committed-log test; dropping untracked file content hashing fails the untracked-only test; replacing the symlink target text with a constant fails the symlink test; removing `setsid` fails the Ctrl+C test (it timed out at 30 s; `afterEach` killed the leftover processes, and a later scan found no leftover `sleep 300`). Each run restored the original script (hash match).
- Manual usage-error runs: `scripts/agent-loop.sh --brief …` → `agent-loop: missing --task-id`, usage, `exit: 64`, no `.agent-loop/` and no new evidence directory (that entry's `[exit 2]` comes from the trailing `ls .agent-loop`, which failed as expected); from `/tmp` with `--brief /dev/null --max-iterations 11` → exit 64.
- `npx eslint scripts/agent-loop.test.ts` exit 0; `npm run typecheck` first failed (exit 2: `NODE_ENV` missing in the typed `env` objects, and follow-on `never` errors), fixed by adding `NODE_ENV: 'test'` to both `env` objects of the test file; rerun exit 0.
- `npm run check` (lint, typecheck, test:unit with 67 tests in 2 files, next build + 2 Playwright tests): exit 0, 29 s. Afterwards a process scan found no `agent-loop`, `tsx`, `server.ts`, Playwright, or Vitest process, and no `agent-loop-test-*` directory remained in `/tmp`.
- Whitespace: `git diff --check` (tracked) and `git diff --no-index --check /dev/null <file>` for every new file (calibrated: trailing space → exit 3, clean → exit 1), plus a single-final-newline check.

## Known limitations and open issues

- **E2E servers may escape an interrupt of a real `check:loop`/`check`.** `e2e/fixtures/chat-server.ts` spawns the server with `detached: true` (own session), so it is outside the check's process group that the loop terminates; its cleanup runs on the Playwright process's `exit` event, which Node does not emit when the process dies from SIGTERM. Whether Playwright's own SIGTERM handling tears the fixtures down was not verified. The loop's tests use fake checks only. Suggested follow-up (not in the scope of this task): verify with a real interrupted `npm run check:loop`, and if servers remain, handle SIGTERM in the fixture.
- The real `claude -p` fixer was not run (cost); Codex is not installed. First real run: task 2.1.
- Linux-specific: `setsid` (util-linux), `ps -o pgid=,stat=` (procps), `/proc` in the tests' zombie check. Tested with uutils `timeout` 0.8.0 (exit 124 on timeout, 137 after `--kill-after`, confirmed manually); GNU coreutils `timeout` documents the same codes but was not tested here.
- `shellcheck` is not installed, so the script was not linted by it.
- A process that leaves the fixer's or check's process group on its own (for example with `setsid` or `detached: true`) is not tracked by the loop.

## Round 2 (checker findings of `review.md` round 1)

The checker accepted round 1 with non-blocking findings. The coordinator asked for fixes to findings 1–3 before task 2.1, because task 2.1 commits `loop-run.log` unedited. Round 1 above describes revision 1 and is kept as it was. Where it differs, this section wins: the suite now has 47 tests (15.3 s), and the excerpt pipeline is the one described here.

### Changes

- **Finding 1 — trailing whitespace in the log** (`scripts/agent-loop.sh`, excerpt in `run_check`).
  - Each excerpt line now passes through `sed 's/^/  | /; s/[[:space:]]*$//'`, so a blank output line becomes `  |`.
  - I checked the other writers:
    - The header, entries, footer, and interrupted line all end in a fixed token or in a value produced by `quote()`, which ends in `"` when it contains whitespace.
    - Every line is written with a single `\n`, and nothing writes a blank line.
- **Finding 2 — UTF-8-safe truncation.**
  - The pipeline is now `cut -b 1-500 | { iconv -f UTF-8 -t UTF-8 -c 2>/dev/null || true; }`. `iconv -c` drops a character that the byte cut split, and also any other invalid byte, so the log stays valid UTF-8.
  - The `|| true` is needed because glibc `iconv` exits 1 after dropping input (checked by hand: `printf 'x\xc3' | iconv -f UTF-8 -t UTF-8 -c` prints `x` and exits 1), and under `set -e` that would abort the loop.
  - `iconv` (glibc 2.43 here) was added to the list of required tools and to the header comment.
  - Lines are still at most 500 bytes. Counting in bytes rather than characters is deliberate and simple, and valid UTF-8 is guaranteed.
- **Finding 3 — test gap for a nested project.** `makeRepo({ nested: true })` places the project at `outer/sub/project` inside a larger repository, which is the real layout. The new test does the following:
  - It commits `tracked.txt`, a file outside the project, and a previous `loop-run.log`.
  - It runs the loop from `outer/sub` with a relative `--brief`.
  - Fixer run 1 edits the tracked project file, and the log shows `changed_files=tracked.txt`, not `sub/project/tracked.txt`.
  - Fixer run 2 edits only `../../outside.txt` and ends in `no_progress`.
  - It also asserts that the checks ran in the project root, the committed log was appended, and nothing was written at the outer root.
- **Test helpers.** `Repo.gitRoot` was added, and `recordLines` also filters the blank excerpt line `  |`.

### New tests (`scripts/agent-loop.test.ts`)

| Finding | Test |
|---|---|
| 1 | `run log` › `writes no trailing whitespace and no blank line at the end, whatever the check prints`. The check prints blank lines, whitespace-only lines, trailing spaces, a trailing tab, a CR line, and a trailing blank line. The test asserts that no log line ends in whitespace, there are no blank lines, the file has exactly one final newline, the excerpt lines are exact, and `git diff --no-index --check /dev/null <log>` exits 1 with no output. |
| 2 | `run log` › `truncates long excerpt lines to at most 500 bytes without splitting a UTF-8 character`. Line 1 is 499 ASCII bytes plus `é` at bytes 500–501, and is logged as the 499 bytes only. Line 2 is 300 × `é` and becomes 250 × `é`. Line 3, exactly 500 bytes, stays whole. The whole log is decoded with a fatal UTF-8 decoder. |
| 3 | `project nested in a larger Git repository` › `logs changed files relative to the project, counts project edits as progress, and ignores edits outside the project`. |

### Round 2 checks (appended to `checks.txt` under "Round 2")

1. **Red** (script unchanged, SHA-256 `eeaccc8d…`, same as revision 1): `npx vitest run scripts/agent-loop.test.ts` exits 1 with 2 failed and 45 passed.
   - The whitespace test failed: `expected [ '  | ', '  |    ', …(5) ] to deeply equal []`.
   - The UTF-8 test failed: `TypeError: The encoded data was not valid for encoding utf-8`.
   - The nested test already passed. It is a coverage test, and item 3 below shows it catches the regression.
2. **Green** after the fix: `bash -n` exits 0, the mode stays `-rwxr-xr-x`, and 47 of 47 tests pass (exit 0) with no leftover `sleep 300`.
3. **Mutation checks** (`mutate14.sh`; each run restored the script with a SHA-256 match):

   | Mutation | Test that failed |
   |---|---|
   | `--relative` removed from `changed_files` | the nested test |
   | trailing-whitespace strip removed | the whitespace test |
   | `iconv` step replaced by `cat` | the UTF-8 test |

4. `npm run typecheck` and `npm run lint` both exit 0.
5. `npm run check` exits 0 in 30 s: lint, typecheck, test:unit with 70 tests in 2 files, next build, and 2 Playwright tests.
6. A process scan afterwards found no `agent-loop`, `tsx`, `server.ts`, Playwright, Vitest, or `sleep 300` process.
7. One directory, `/tmp/agent-loop-test-oSilXP`, was found (recorded in `checks.txt`). It was created at 15:48:23 UTC, which is between my round 1 runs (last test run about 15:42) and my round 2 runs (from 15:54). It holds a codex fake's state only, so it was not created by my runs and is probably from the checker's review. I left it in place.
8. Whitespace: the checks at the end of `checks.txt`.

### Informational findings 4–6 (no change, per the coordinator)

These are added to the known limitations:

- **4.** Two `set -e` paths in `run_agent` can end the script with exit 1 (the `max_iterations_reached` code) and no footer: a `mktemp` failure, or a brief deleted during the run (`cat` in `write_prompt`). Both are unlikely operator errors.
- **5.** A signal that arrives between `setsid … &` and `CHILD_PID=$!` (a window of microseconds) runs the trap with an empty `CHILD_PID`, so that child is not terminated.
- **6.** An untracked entry that `git ls-files --others` reports as a directory (for example, a nested Git repository) contributes only `unreadable:<path>`, so changes inside it do not count as progress.

### Snapshot

`snapshot.txt` was regenerated as revision 2 (base `1da166d`). It covers `scripts/agent-loop.sh`, `scripts/agent-loop.test.ts`, this file, and `checks.txt`. `review.md` was not edited and is not part of the snapshot.
