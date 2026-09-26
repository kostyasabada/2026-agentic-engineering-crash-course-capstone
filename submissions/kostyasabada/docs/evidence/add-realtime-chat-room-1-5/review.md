# Review: add-realtime-chat-room-1-5

## Round 1

- Reviewer: Claude Code general-purpose subagent (checker), separate from coordinator and maker. Spawned by the coordinator with a scoped handoff; no repairs, staging, commits, or checkbox changes made.
- Date: 2026-09-26
- Reviewed snapshot: `snapshot.txt` revision 2 (base commit `ffa55a1`). `sha256sum -c` of its seven entries (from the repository root) returned OK for all: `.claude/settings.json`, `scripts/session-context.sh`, `docs/workflow.md`, `openspec/changes/add-realtime-chat-room/design.md`, `implementation.md`, `checks.txt`, `hook-output.txt`. This `review.md` is not part of the snapshot.
- Inputs read: `AGENTS.md`, `docs/review-process.md`, task 1.5 in `tasks.md`, `specs/session-context-hook/spec.md`, design D8/P18 (including the round-2 user decision), all maker evidence files, `.claude/settings.json`, `scripts/session-context.sh`, `git diff ffa55a1 -- docs/workflow.md openspec/changes/add-realtime-chat-room/design.md`, the OpenSpec 1.13.2 README and `dist/` source, and the official hooks reference https://code.claude.com/docs/en/hooks (fetched 2026-09-26).

### Findings

No blocking findings. All findings below are low severity and do not require changes for acceptance.

1. Low (accuracy of rationale): `openspec/changes/add-realtime-chat-room/design.md:273`, `scripts/session-context.sh:32-33`, `docs/evidence/add-realtime-chat-room-1-5/implementation.md:103`. They say that without `OPENSPEC_TELEMETRY=0` the CLI "creates its global config file ... when none exists". The source (`dist/telemetry/config.js`, `migrateLegacyTelemetryConfig`) shows a narrower cause, which also explains what the maker recorded as "observed, not explained": the file is written only as a one-time migration. That happens when `XDG_CONFIG_HOME` points to a config directory without telemetry fields while a legacy `~/.config/openspec/config.json` with telemetry exists. I confirmed this with scratch HOME/XDG runs (T1 and T3 below). With no config anywhere, `list --json` writes nothing and sends nothing, because the notice is deferred for `--json` and `trackCommand` returns while `noticeSeen` is unset. In this user's default environment (XDG unset, existing config with `noticeSeen: true`), a run without the opt-out writes no file but does send a usage event to `https://edge.openspec.dev/batch/` (T7). The opt-out is correct and prevents both, so this is only imprecise wording.
2. Low (stale rationale, optional hardening): `implementation.md:88` (still listed as unchanged at `implementation.md:134`). The reason given for not adding `timeout --kill-after` was that npm's grandchild held stdout. That no longer applies in round 2, where `env` execs `node` as the direct child. In a scratch copy with `timeout -k 2 10`, a TERM-ignoring fake `node` was killed after 12042 ms, against 13034 ms for the repository script. The notice then reported status 137, not the timeout reason. The real OpenSpec CLI does not ignore SIGTERM, and Claude Code's 15 s hook timeout is the backstop, so this is not a spec defect for realistic inputs. A future revision could add `-k` and map 137 to the timeout notice, or update the rationale.
3. Low (wording): `docs/workflow.md:58`. It says a real Claude Code 2.1.198 session ran "the hook" without saying that the session ran the round-1 (npm) version of the script. `hook-output.txt` says this plainly ("Round 2 note"), and `workflow.md` does state that model-side receipt is pending. Acceptable; noted for precision.
4. Informational: design D8's "Codex parity: unknown (open question Q8)" (`design.md:282`) and Q8 (`design.md:326`) remain open. This matches the maker's stated conclusion; the result and limitation are documented in `docs/workflow.md` as task 1.5 requires.

### Critical items

- `docs/workflow.md` rebuild (item 1): faithful. `git diff ffa55a1 -- docs/workflow.md` has one hunk. It replaces only the "neither exists yet" line with the new sentence about `scripts/agent-loop.sh` and the hook, and after the unchanged "Documentation:" line it appends the "Session context hook" section (one paragraph plus the Codex paragraph). Every other line matches HEAD: 54 lines at HEAD, 60 now, +7/-1. The file ends with a single newline. No lost or altered content.
- OpenSpec telemetry and other side effects (item 2): verified. README 1.13.2 documents `OPENSPEC_TELEMETRY=0` / `DO_NOT_TRACK=1` as env opt-outs. In `dist/telemetry/opt-out.js` any value other than 1/true/yes/on disables telemetry, and `trackCommand` and `maybeShowTelemetryNotice` return before reading or writing config. The only network code in `dist/` is `telemetry/index.js` (PostHog fetch) and `core/version-check.js`. `getAvailableCliUpdate` is called only from the `update` command (`dist/cli/index.js:243`), not from `list`. The `list` action (`dist/cli/index.js:295-332`) uses `core/root-selection.js` and `core/list.js`, which only inspect and read. The write-capable helpers they import (`ensureOpenSpecRoot`, `writeStore*`) are not called on that path. The completion tip is deferred without writing for `--json`/non-TTY runs. Runtime tracing confirmed all of this (table below).
- Spec compliance (item 3): met for everything observable. Success output uses the D8 format. Every failure path prints one notice with the manual command and exits 0, and the timeout is 10 s. Working tree, `~/.npm/_logs`, and `~/.config/openspec` were unchanged around every run. `.claude/settings.json` matches P18 and the official schema: `hooks.SessionStart[].matcher` takes valid sources `startup|resume|clear|compact`, `type: "command"`, the double-quoted `$CLAUDE_PROJECT_DIR` shell form, and `timeout` in seconds. Per the docs, plain-text stdout with exit 0 is added as context, and the script never exits 2, which would block the session.
- Evidence honesty (item 4): met. `implementation.md` has a dedicated "Side effects outside the repository" section near the top that discloses both incidents: the 11 deleted npm debug logs and the emptied `docs/workflow.md`, including that the round-1 snapshot hash was of the emptied file. `hook-output.txt` records that the real session ran the round-1 npm script, that it hit "Not logged in · Please run /login", `total_cost_usd` 0, and `claude` exit 1. It says model-side receipt is pending under user option A and is not claimed. Earlier attempts, including pre-opt-out round-2 runs, failed whitespace checks, and unrecorded exploration, are recorded. The `[SPACE]` markers are explained by maker notes after the entries at 16:14:57Z and 16:33:55Z.

### Independent checks (run by the checker, 2026-09-26)

Runtime: `PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH`, uutils `timeout` 0.8.0. Fingerprints covered `git status --short`, `git status --short --untracked-files=all --ignored`, hashes of all tracked and untracked file contents, a `~/.npm/_logs` listing with full-iso mtimes (21 files), and a `~/.config/openspec` listing plus content hash. All were read-only. They were identical before and after every run below.

| Check | Result |
|---|---|
| `sha256sum -c` snapshot entries | 7/7 OK |
| `bash -n scripts/session-context.sh` | exit 0 |
| `ls -l` | script `-rwxr-xr-x`, settings `-rw-rw-r--`; settings parse as JSON; neither file git-ignored |
| A: success, `CLAUDE_PROJECT_DIR` set, cwd `/tmp` | source line and JSON naming `add-realtime-chat-room`, exit 0, 325 ms |
| B: success, `CLAUDE_PROJECT_DIR` unset, cwd `/tmp` | same (fallback to project root), exit 0, 336 ms |
| C: missing binary (scratch copy of `package.json` + `openspec/`, no `node_modules`) | notice "./node_modules/.bin/openspec is missing; dependencies are not installed", exit 0; copy unchanged |
| D: node unavailable (scratch PATH: bash env dirname timeout sleep) | notice "node not found on PATH", exit 0 |
| E: forced timeout (fake `node`: `exec sleep 30`) | timeout notice, exit 0, 10039 ms, no `sleep` left |
| F: CLI fails (fake `node` exits 3, stderr "boom") | notice "exited with status 3", stderr not shown, exit 0 |
| G: project directory missing | notice "project directory not accessible", exit 0 |
| H: TERM-ignoring direct child (`trap "" TERM; exec sleep 13`) | timeout notice after 13034 ms, exit 0 (finding 2); a scratch copy with `-k 2`: 12042 ms, status 137 |
| OpenSpec tracing: `unshare -rn` (no network), `NODE_OPTIONS=--import` wrapper logging `fetch` and fs write/mkdir/rename calls | T1 empty HOME+XDG, no opt-out: nothing traced, no files. T2 same with opt-out: nothing. T3 legacy config in scratch HOME, empty XDG, no opt-out: mkdir + writeFile `<XDG>/openspec/config.json` + fetch `https://edge.openspec.dev/batch/`. T4 same with opt-out: nothing. T5 real HOME (read-only), empty scratch XDG, no opt-out: write into scratch XDG + fetch (reproduces the maker's observation). T6 same with opt-out: nothing. T7 real HOME, XDG unset, no opt-out: fetch only, no write; with opt-out: nothing. All runs exit 0 with the change listed. |
| `OPENSPEC_TELEMETRY=0 ./node_modules/.bin/openspec validate add-realtime-chat-room --strict` | "Change 'add-realtime-chat-room' is valid", exit 0 |
| `OPENSPEC_TELEMETRY=0 ./node_modules/.bin/openspec validate --all --strict` | 1 passed, 0 failed, exit 0 |
| Lint / typecheck: `./node_modules/.bin/eslint .` and `./node_modules/.bin/tsc --noEmit` (the bodies of `npm run lint` / `npm run typecheck`, run directly to avoid npm logs) | exit 0 / exit 0 |
| `git diff --check` | exit 0 |
| `git diff --no-index --check /dev/null <file>` per untracked file | exit 1 (no problems) for all six; each ends with a single final newline |
| `git log --oneline -1` | `ffa55a1 feat: add agent loop script with tests (task 1.4)` |
| `git status --short` (unchanged from the start) | ` M docs/workflow.md`, ` M openspec/changes/add-realtime-chat-room/design.md`, `?? .claude/settings.json`, `?? docs/evidence/add-realtime-chat-room-1-5/`, `?? scripts/session-context.sh` (plus this `review.md` once written) |
| Leftover processes (`pgrep` for openspec, sleep, `claude -p`) | none apart from the pgrep shell itself |

### Side effects caused by the checker

- Inside the repository: only this `review.md`.
- Outside the repository: scratch files under the session scratchpad (`checker15/`: fingerprint helper, trace module, fake `node` directories, a scratch project copy, scratch HOME/XDG trees, one scratch config file written by OpenSpec in T3/T5). No npm command was run, so `~/.npm/_logs` was not touched, and `~/.config/openspec` was unchanged (fingerprints). Telemetry fetches in T3/T5/T7 ran inside a network-less namespace (`unshare -rn`) and could not reach the network. One read-only `find` traversed the home directory by mistake while listing T5/T6 files; it read nothing and wrote nothing. The hooks documentation was fetched once with WebFetch.

### Limitations

- No real Claude Code session was run, as instructed. Model-side receipt of the hook text is not verified by me or by the maker; it is pending the user-run session (option A). Claude Code's 15 s hook timeout and the `resume`/`clear`/`compact` sources were not observed.
- The "no active changes" scenario was not exercised; the script passes the CLI JSON through unchanged.
- The OpenSpec source review covered the `list` action path, telemetry, the version check, and the completion tip in the installed 1.13.2 `dist/`. It is not a full audit of every transitive module.

### Verdict

accepted
