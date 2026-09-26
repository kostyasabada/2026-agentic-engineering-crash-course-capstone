# Review: add-realtime-chat-room-1-4

## Round 1

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker. Scoped handoff; no maker conversation history.
- Date: 2026-09-26
- Base commit: `1da166d` (`git log --oneline -1` confirmed); uncommitted working tree.
- Reviewed snapshot: `snapshot.txt` revision 1. `sha256sum -c` (run from the repository root) reported OK for all four entries:
  - `eeaccc8d77282405a2183861fbe6fe7c3cd57f40f82cd6644d8fdefe0155d6c2  scripts/agent-loop.sh`
  - `5e9a809c4715236d334d47bab4b473725fd843bb3a9e791e01de663cd6e6dec8  scripts/agent-loop.test.ts`
  - `7915848805fdefa0727e03515954b7e5aec4d459ffedb960ee20ff9032bcaaa1  docs/evidence/add-realtime-chat-room-1-4/implementation.md`
  - `10b2766ccd3a8ffa14f3045b38f5708ded783358fd6026383a0beb5fa787c268  docs/evidence/add-realtime-chat-room-1-4/checks.txt`
- Read: `AGENTS.md`, `docs/review-process.md`, task 1.4, `specs/agent-loop/spec.md`, design D5 and D7 (P16, P17, P22, fingerprint, log format, interrupt handling), `implementation.md`, `checks.txt`, `snapshot.txt`, `scripts/agent-loop.sh` and `scripts/agent-loop.test.ts` in full, `e2e/fixtures/chat-server.ts`, `package.json` scripts.

### Findings

No blocking findings. All findings below are non-blocking.

1. **Low — failure excerpts put trailing whitespace into `loop-run.log`** (`scripts/agent-loop.sh:261`). `sed 's/^/  | /'` turns every blank line of the failing output into `  | ` (with a trailing space), and output lines that end in spaces keep them. My manual run logged `  | not yet: ` with a trailing space. Vitest and Playwright output has many blank lines, so task 2.1's `loop-run.log`, which must be committed unedited, will almost certainly fail a `git diff --check` or `git diff --no-index --check` whitespace check on evidence files. No spec or design requirement is violated. Suggested fix, cheap if made before task 2.1: strip trailing whitespace after adding the prefix (for example `sed 's/^/  | /; s/[[:space:]]*$//'`), and add a test assertion.
2. **Info — the per-line cut can split a multi-byte character** (`scripts/agent-loop.sh:261`). `cut -b 1-500` works on bytes, so a long line with non-ASCII text can end mid-character. That leaves invalid UTF-8 in a log that D7 declares UTF-8. It is cosmetic.
3. **Info — the tests never place the project inside a larger Git repository** (`scripts/agent-loop.test.ts:69-91`). The real project is `submissions/kostyasabada/`, a subdirectory of the Git repository, but every test uses a repository whose root is the project root. My mutation that drops `--relative` from `changed_files` (`scripts/agent-loop.sh:237`) survived all 44 tests. I checked the nested layout by hand (see Independent checks): it works, including the pathspec excludes, the committed-log case, and an edit outside the project not counting as progress. This is a coverage gap only.
4. **Info — two errexit paths can end with exit 1 and no footer** (`scripts/agent-loop.sh:317-318`). `run_agent` runs with `set -e` active. A `mktemp` failure, or a brief deleted during the run (`cat -- "$brief_abs"` inside `write_prompt`), aborts the script with exit 1, which is the `max_iterations_reached` code, and writes no footer. Both are unlikely operator errors.
5. **Info — a small race when starting a child** (`scripts/agent-loop.sh:168-169`). A signal that arrives after `setsid … &` but before `CHILD_PID=$!` runs the trap with an empty `CHILD_PID`, so that child is not terminated. The window is microseconds; noted for completeness.
6. **Info — changes inside an untracked directory entry are not tracked** (`scripts/agent-loop.sh:204-215`). An untracked entry that `git ls-files --others` reports as a directory, such as a nested Git repository, contributes only `unreadable:<path>`. Changes inside it therefore do not count as progress. This is outside the task's cases.

### Task 1.4 cases: coverage assessment

The maker's case-to-test table in `implementation.md` is accurate. I checked each test's assertions against the script, and they are specific rather than tautological:
- Exact argv arrays for `claude` and `codex`.
- Exact log line sequences, with only durations normalised.
- Check-run counts recorded in a state file outside the repository.
- PID liveness checks with zombie handling.
- The `git status` output after a green run: no staging, no commit, `tasks.md` byte-identical.

Every listed case has at least one test: usage errors, invocation from other directories, defaults in the header, already green, fixed within the limit, full check failing, limit 1 (and 3), the three `agent_error` causes, `no_progress`, untracked-only edits, the broken symlink and unreadable file, the committed log, interrupt (PID gone, exit 130), log header, entries and footer, append-only log, and no checkbox or commit changes. The extra Ctrl+C test, with a check that exits 0 on SIGINT, is a useful guard against the Playwright behaviour. Every spec requirement and scenario is implemented; I found no gaps.

### Script review summary

- Arguments: every invalid or missing value exits 64 before any log, run directory, check, or agent (the tests assert that `docs/evidence` is absent). The script changes to the project root after resolving the brief.
- P17: the fixer command matches exactly. There is no resume, continue, bypass, or git permission. The prompt goes on stdin. The preamble forbids commit, push, staging, editing `tasks.md`, and writing review files.
- Timeout: `timeout --kill-after=10` runs inside a `setsid` group, and leftover group members are cleaned up afterwards.
- Fingerprint: status, `git diff --binary HEAD`, and the content of untracked files, all under the same excludes. Taking the fingerprints after the log appends is correct because the log is excluded in all three parts; the committed-log test and the maker's mutation of the exclude confirm this. The fingerprint is robust against unreadable files, symlinks, and filenames containing spaces or newlines (verified by hand).
- Signals: the trap ignores further INT and TERM, sends TERM to the group, waits up to 5 s, then sends KILL.
- The loop never commits or pushes. The final line says checker review is still required.
- Portability: `timeout` here is uutils 0.8.0; exit codes 124 and 137 were observed. The script is Linux-only (util-linux `setsid`, procps `ps`), as the maker documented.

### Maker ambiguities 1–9

All nine choices are reasonable, and none contradicts the spec or design:
- (2) Logging the check commands follows the spec's explicit header content and D7's stated purpose.
- (3) The `=== run interrupted` line is additive; it is not a fifth stop reason.
- (4) Missing tools exit 64: the spec defines no code, and the agent-executable case still gives `agent_error` 2 as the spec requires.
- (6) Stopping at `no_progress` without rerunning the check matches D7's before/after comparison.
- (9) Cleaning up leftover group members after a normal exit supports the spec's "no loop child process remains running".

### Open issue: E2E servers surviving an interrupt

The concern is plausible from the code: the fixture spawns `tsx server.ts` with `detached: true` and kills it only in `stop()` or on Node's `exit` event. I probed it with the real script in the real project. I used a fake `claude` first on `PATH`, `AGENT_LOOP_CHECK_CMD='npm run test:e2e:dev'`, and the temporary task id `checker-probe-1-4`. I started the loop in its own session and sent SIGINT to its process group, like Ctrl+C.
- My first attempt missed the E2E window because the 7 s E2E stage had already passed. That SIGINT interrupted the full check (`npm run check`) instead: exit 130 and no leftovers.
- Three further probes sent SIGINT 0.1 s, 0.5 s, and 2 s after a `server.ts` process appeared. Each time the loop exited within about 0.4 s with an `interrupted` log line. 3 s later, `ps` showed no `server.ts`, `tsx`, Playwright, or `chrome-headless-shell` process.
- Side effect found: the fixture's temporary directories (`/tmp/chat-e2e-*`, empty) remain after an interrupt, because the fixture's `finally` block does not run. I removed the three that my probes created. One older empty directory from 13:37 predates this review and was left alone.

Conclusion: no leftover servers were observed. This does not block task 1.4. Hardening the fixture (a SIGTERM handler, temp-dir cleanup) could be a follow-up task. Limitation: only the dev-mode smoke and startup tests were probed, not production mode.

### Evidence honesty

- The red run is genuine: 44 of 44 tests failed with ENOENT on the missing script.
- Every attempt is recorded in execution order, including the failed first green run (a wrong test assertion) and the typecheck failure. Exit codes are measured.
- The helper bodies (`rec14.sh`, `mutate14.sh`) are included. The four mutation checks each report a restore with a SHA-256 match.
- The manual usage-error entry's `[exit 2]` is explained: it comes from the trailing `ls`, while the script itself exited 64.
- `claude --help` is recorded, and Codex's absence is recorded.

### Independent checks

| Check | Result |
|---|---|
| `sha256sum -c` on the snapshot entries | 4 of 4 OK |
| `bash -n scripts/agent-loop.sh` | exit 0 |
| `ls -l scripts/agent-loop.sh` | `-rwxr-xr-x`, 14163 bytes |
| `npx vitest run scripts/agent-loop.test.ts`, run 1 | exit 0, 44 of 44 passed, 13.77 s |
| `npx vitest run scripts/agent-loop.test.ts`, run 2 | exit 0, 44 of 44 passed, 13.67 s (no flakiness) |
| Mutation M1: `exit 130` becomes `exit 1` in `on_signal` (line 187) | both interrupt tests failed; restored, SHA-256 `eeaccc8d…` before and after |
| Mutation M2: `-ge` becomes `-gt` in the iteration-limit check (line 356) | `limit 1` and `limit 3` tests failed; restored, hash match |
| Mutation M3: `--relative` removed from `changed_files` (line 237) | survived (finding 3); restored, hash match |
| Manual usage errors: `--agent gpt` from the project root, and missing `--task-id` from `/tmp` | exit 64 with usage on stderr both times; no log directory and no `.agent-loop/` created |
| Manual run with a fake `claude` in a temporary Git repo, project nested at `sub/proj`, invoked from `sub/`, owned file named `fix me.txt` | green after 2 fixer runs, exit 0; log has header, failing excerpts, 2 agent entries, passing check and full check, footer `checks_passed fixer_runs=2 exit=0` |
| Second manual run in the same repo with the log committed; fixer edits an untracked file named `nl\nname.txt`, then a file outside the project | run 1 counted as progress; run 2 gave `no_progress`, exit 3; the committed log was appended but not counted |
| Real-project interrupt probes (see Open issue) | exit 130; no leftover processes; empty `/tmp/chat-e2e-*` directories left (mine removed) |
| `npm run check` | exit 0 in 29 s: lint, typecheck, 67 unit tests in 2 files, `next build` and 2 Playwright tests |
| `pgrep -af "agent-loop\|server.ts\|next\|playwright"` afterwards | no processes |
| `git status --short` | only `?? docs/evidence/add-realtime-chat-room-1-4/` and `?? scripts/` |
| `git diff --check`, and `git diff --no-index --check /dev/null <file>` for each untracked file | exit 0 and exit 1 respectively (clean) |
| `git log --oneline -1` | `1da166d` |

Temporary files inside the repository, all removed right after the probes: `docs/evidence/checker-probe-1-4/`, `.agent-loop/checker-probe-1-4/` (and the then-empty `.agent-loop/`). The in-place mutations of `scripts/agent-loop.sh` were restored, with a SHA-256 check each time. All other scratch work was done in the session scratchpad outside the repository.

### Limitations

- The real `claude -p` was not run (cost) and Codex is not installed, so real stdin handling and permission effects remain unverified until task 2.1.
- `shellcheck` is not installed and was not run.
- GNU coreutils `timeout` was not tested; only uutils 0.8.0 was.
- The E2E interrupt probes covered only dev mode and the current two E2E specs.

### Verdict

**accepted**. Finding 1 (trailing whitespace in log excerpts) is recommended as a cheap fix before task 2.1, but it does not violate the spec or design and does not block this task.

## Round 2

- Checker: the same Claude Code general-purpose subagent (checker) as round 1, separate from coordinator and maker.
- Date: 2026-09-26
- Base commit: `1da166d` (confirmed); uncommitted working tree.
- Reviewed snapshot: `snapshot.txt` revision 2. `sha256sum -c` reported OK for all four entries:
  - `e1059b0f6f1a68d6d663c2f60c60af80fcf832398a0aca1aebd02278752cd838  scripts/agent-loop.sh`
  - `4c7e4d683841b5225089f159e52ad8a9a26910dd624703808b19576ff27731a2  scripts/agent-loop.test.ts`
  - `6cf31eb48bd4c18c3bb6a6fe371beb42f9faa712e8b9de134c69779c9fadff22  docs/evidence/add-realtime-chat-room-1-4/implementation.md`
  - `27d36c9e4e3ee6b5f6da5374e3cfd2a17dd75f6f55e80768a523877ee65c4d92  docs/evidence/add-realtime-chat-room-1-4/checks.txt`
- Read: the "Round 2" sections of `implementation.md` and `checks.txt`, `snapshot.txt` revision 2, and the script diff against revision 1. I diffed against my own copy of revision 1, whose SHA-256 is `eeaccc8d…` and matches the round 1 snapshot. The script diff is limited to:
  - the list of required tools (`iconv` added) and the header comment;
  - the excerpt pipeline at `scripts/agent-loop.sh:260-265`.
- In the test file, I read the changed helpers (`makeRepo({ nested })`, `Repo.gitRoot`, `recordLines`) and the three new tests. I kept no copy of test revision 1, so I checked the test changes by reading, not by diff.

### Resolution of round 1 findings

1. **Resolved.** The excerpt now goes through `sed 's/^/  | /; s/[[:space:]]*$//'` (`scripts/agent-loop.sh:265`), so a blank line becomes `  |`.
   - The new test (`scripts/agent-loop.test.ts:649`) feeds blank lines, whitespace-only lines, trailing spaces, a trailing tab, a CR line, and a trailing blank line.
   - It asserts the exact excerpt lines, no line ending in whitespace, no blank lines, and one final newline. It also runs `git diff --no-index --check /dev/null <log>` and expects exit 1 with no output.
   - My mutation that narrows the strip to spaces only (`s/ *$//`) made this test fail.
   - The maker's red run with revision 1 also failed this test.
2. **Resolved.** The pipeline is now `cut -b 1-500 | { iconv -f UTF-8 -t UTF-8 -c 2>/dev/null || true; }` (`scripts/agent-loop.sh:264`).
   - The new test (`scripts/agent-loop.test.ts:681`) covers three lines: a split `é` at bytes 500–501, which is dropped; 300 × `é`, which becomes 250 × `é`; and exactly 500 bytes, which stays whole. The whole log is decoded with a fatal UTF-8 decoder.
   - My mutation that removes `-c` made this test fail. Without `-c`, glibc `iconv` stops at the first invalid byte, so the later lines would be lost.
   - Assessment of the `iconv` approach:
     - Direct probe: glibc 2.43 `iconv -c` drops only the invalid bytes (`\xff\xfe`, a trailing `\xc3`), keeps all later lines, and exits 1. The `|| true` is therefore needed for the normal exit 1.
     - What `|| true` can mask: a genuinely fatal `iconv` failure would, at worst, shorten or empty the excerpt. The `fail` entry is still logged, and the full output stays in `.agent-loop/…`, so masking is acceptable.
     - `2>/dev/null` only hides `iconv`'s diagnostics.
     - With `iconv` missing from `PATH`, the loop exits 64 with `agent-loop: required command not found on PATH: iconv`, before any log or run directory is written (verified).
     - Portability: `iconv -c` exists in glibc, macOS, and busybox. The script is Linux-only anyway.
3. **Resolved.** The new nested-project test (`scripts/agent-loop.test.ts:568-600`) uses the real layout: the project at `outer/sub/project` inside a larger repository, invoked from `outer/sub` with a relative `--brief`, and a previously committed log.
   - It asserts that the checks ran in the project root (twice).
   - It asserts that `changed_files=tracked.txt` is relative to the project, which proves `--relative`.
   - It asserts that an edit only outside the project ends with `no_progress`, which proves the `.` pathspec.
   - It asserts that the committed log was appended and not counted as progress, and that nothing was written at the outer root.
   - The maker's mutation that removes `--relative` fails this test, closing the survivor from my round 1 mutation M3. The assertions are specific.
4. **Findings 4–6 (Info).** No code change, as the coordinator decided. They are recorded as known limitations in `implementation.md`, which is acceptable.

### New findings

1. **Info — a NUL byte in check output reaches the log** (`scripts/agent-loop.sh:264`). A NUL passes through `strip_ansi`, `cut`, and `iconv -c` unchanged (probe: `\x00nul` came out as-is), and Git then treats the committed log as binary. This existed in revision 1 and is not a regression. Test runners rarely print NUL, so this is not blocking.

I found no regressions. All 47 tests pass, and the round 1 behaviour tests are unchanged in intent. The `recordLines` filter now also skips the bare `  |` excerpt line, which is needed and correct.

### Temporary directory `/tmp/agent-loop-test-oSilXP`

This directory was mine. Its timestamps (15:48:23–15:48:24 UTC) match my first round 1 interrupt probe. That probe missed the E2E window and interrupted `npm run check` during `test:unit`, while Vitest was running the codex test of `scripts/agent-loop.test.ts`. Its contents fit: only a codex fake, `fixed.txt`, and codex state. Because the Vitest run was killed, `afterEach` never removed it. I confirmed that no process was using it and removed it in round 2. Round 1 did not record this leftover; this entry corrects that. No `/tmp/agent-loop-test-*` directory remains. The only `/tmp/chat-e2e-*` directory left is the empty `/tmp/chat-e2e-3adWce` from 13:37 local time, which predates my review and was left alone.

### Independent checks (round 2)

| Check | Result |
|---|---|
| `sha256sum -c` on the snapshot entries | 4 of 4 OK |
| `bash -n scripts/agent-loop.sh` | exit 0 |
| `ls -l scripts/agent-loop.sh` | `-rwxr-xr-x`, 14484 bytes |
| `npx vitest run scripts/agent-loop.test.ts`, run 1 | exit 0, 47 of 47 passed, 15.43 s |
| `npx vitest run scripts/agent-loop.test.ts`, run 2 | exit 0, 47 of 47 passed, 15.42 s (no flakiness) |
| Mutation R2-M1: `s/[[:space:]]*$//` becomes `s/ *$//` (line 265) | whitespace test failed; restored, SHA-256 `e1059b0f…` before and after |
| Mutation R2-M2: `-c` removed from `iconv` (line 264) | UTF-8 test failed; restored, hash match |
| `iconv -c` probe with invalid bytes, a trailing split byte, and a NUL | invalid bytes dropped, later lines kept, NUL passed through, exit 1 |
| Loop run with `iconv` absent from `PATH` | exit 64, `required command not found on PATH: iconv`, no log directory, no `.agent-loop/` |
| `npm run check` | exit 0 in 30 s: lint, typecheck, 70 unit tests in 2 files, `next build` and 2 Playwright tests |
| Leftover processes (`agent-loop`, `server.ts`, `next-server`, Playwright, `sleep 300`, Vitest) | none |
| `git status --short` | `?? docs/evidence/add-realtime-chat-room-1-4/` and `?? scripts/` only |
| `git diff --check`, and `git diff --no-index --check /dev/null <file>` for each untracked file | exit 0 and exit 1 respectively (clean) |
| `git log --oneline -1` | `1da166d` |

The in-place mutations were restored, with a SHA-256 check each time. No temporary files were created inside the repository this round; the `iconv`-free `PATH` directory was in the session scratchpad and has been removed.

### Limitations (round 2)

- I compared the test file by reading only, not by diff, because I kept no copy of test revision 1.
- The round 1 limitations still apply:
  - The real `claude -p` was not run, and Codex is not installed.
  - `shellcheck` was not run.
  - Only uutils `timeout` was tested.
  - The E2E interrupt probes covered only dev mode.

### Verdict (round 2)

**accepted**. Findings 1–3 are resolved and each is backed by a test that fails under mutation. The one new finding is informational and not a regression.
