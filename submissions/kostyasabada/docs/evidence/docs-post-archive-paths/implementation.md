# docs-post-archive-paths — fix stale references after the archive

## Task

- Task ID: `docs-post-archive-paths`.
- User decision (2026-09-30): "так" ("yes") to the coordinator's proposal to fix the stale references left by the archive of `add-realtime-chat-room` in a small separate task with review. The archive checker listed the stale lines.
- Maker: Claude Code general-purpose subagent (maker), fresh scoped context.
- Base commit: `a55b664` (`a55b6646372ccffad0b91ed38b665ef5fe76b158`).
- Environment: Node `v24.21.0`, OpenSpec CLI `1.13.2` (`./node_modules/.bin/openspec`, `OPENSPEC_TELEMETRY=0`).

## Acceptance criteria

1. No project document or script outside `docs/evidence/**`, `node_modules`, `.next`, and `openspec/changes/archive/**` references `openspec/changes/add-realtime-chat-room`.
2. Requirement references point to `openspec/specs/<capability>/spec.md`; design, tasks, and proposal references point to `openspec/changes/archive/2026-09-30-add-realtime-chat-room/`.
3. Statements made false by the archive are reworded (`openspec/specs/` "stay empty until" the archive; task 6.1 "is the final" verification; `list --json` "shows progress").
4. Historical evidence under `docs/evidence/**` is not edited; `AGENTS.md` generic context-map rows stay.
5. `scripts/agent-loop.sh` changes comments only; `bash -n` passes; `scripts/agent-loop.test.ts` passes.
6. Every repository path in the changed lines exists; strict validation passes; no active changes; lint passes; no whitespace errors. Nothing staged or committed.

## Changes

| File | Lines | Change |
|---|---|---|
| `README.md` | 7 | "is implemented" → "is complete and archived"; task 6.1 "was" the final verification; requirements now in `openspec/specs/` (three capabilities named); proposal, design, and tasks in the archived directory; `list --json` "shows active changes (none at present)" instead of "shows progress". |
| `docs/architecture.md` | 19, 20 | `design.md` path → `openspec/changes/archive/2026-09-30-add-realtime-chat-room/design.md`. |
| `docs/architecture.md` | 24 | "Tasks 1.1–5.5 … are implemented; task 6.1 is the final verification" → all tasks (1.1–6.1) complete, 6.1 was the final verification, change archived on 2026-09-30 to the archived path; design references refer to its `design.md`; requirements in `openspec/specs/`. |
| `docs/testing.md` | 3 | Requirements path → `openspec/specs/`. |
| `docs/workflow.md` | 48 | Removed the now-false "stay empty until … archived" sentence; states the change was archived on 2026-09-30, with requirements in `openspec/specs/` and proposal, design, and tasks in the archived directory. |
| `docs/workflow.md` | 62, 66 | Requirement paths → `openspec/specs/agent-loop/spec.md` and `openspec/specs/session-context-hook/spec.md`. |
| `scripts/agent-loop.sh` | 4–6 (comment) | Spec path → `openspec/specs/agent-loop/spec.md`; the bare `design.md D7` is now "D7 in `openspec/changes/archive/2026-09-30-add-realtime-chat-room/design.md`" (one extra comment line, since the bare `design.md` no longer resolves relative to an active change). |

Not changed, by decision:

- `docs/evidence/**` (historical records), `openspec/changes/archive/**`.
- `AGENTS.md:9` ("Read the relevant `openspec/specs/` and active change in `openspec/changes/`") and the context-map rows: generic and still correct.
- `.agents/skills/**` "active change" hits: generic OpenSpec skill instructions.
- `openspec/specs/session-context-hook/spec.md` "active change(s)" hits: requirement text about the hook.
- `docs/architecture.md:12` ("the first OpenSpec change adds … must specify"): a recorded user decision stated at the time it was made; it references no path and is not falsified by the archive.
- `docs/workflow.md` "design D7"/"design D8" labels: line 48 now states where the design lives.

## Grep before / after

Scope: the submission, excluding directories named `node_modules`, `.next`, `evidence`, and `archive` (full commands and outputs in `checks.txt`).

- `changes/add-realtime-chat-room`: before 9 hits (`README.md:7`, `docs/testing.md:3`, `docs/architecture.md:19,20,24`, `docs/workflow.md:48,62,66`, `scripts/agent-loop.sh:4`); after 0 (grep exit 1).
- Now-false statements (`stays empty`, `stay empty`, `not archived`, `active change`, `task 6.1 is`, `final verification`, `shows progress`, case-insensitive): before, the false ones were `README.md:7` ("final verification … is task 6.1", "shows progress"), `docs/architecture.md:24` ("task 6.1 is the final verification"), and `docs/workflow.md:48` ("stay empty until"). After, the remaining hits are the generic ones listed under "Not changed" plus the new, true wording in `README.md:7`, `docs/architecture.md:24`, and `docs/workflow.md:48`.

## Checks (all in `checks.txt`, exit codes measured with `pipefail`)

- Path sanity: all 12 repository paths used in the changed lines exist. `docs/architecture.md` writes evidence paths relative to `docs/` (`evidence/...`), so they were checked as `docs/evidence/...`.
- `scripts/agent-loop.sh`: the diff changes only `#` comment lines; `bash -n` ok; `npx vitest run scripts/agent-loop.test.ts`: 1 file, 47 tests passed, exit 0.
- `openspec validate --all --strict`: 3 passed, 0 failed, exit 0 (informational notes about long requirement text only).
- `openspec list --json`: `"changes": []`, exit 0.
- `npm run lint`: exit 0.
- `git diff --check HEAD`: exit 0, no output.
- Per-file `git diff --no-index --check /dev/null <file>` calibrated on scratchpad files: exit 3 with output for a file with a trailing space and CR, exit 1 with no output for a clean file (exit 1 only means the files differ). In the logged calibration output, `+bad line [CR]` shows the calibration file's trailing space followed by its CR (the helper marks CRs before trailing spaces, so that space is no longer at line end and is not marked). Run on `implementation.md` and `checks.txt`; results in `checks.txt`.
- Helper: `log.sh` (scratchpad, outside the repository; body in `checks.txt`) runs each command with `bash -o pipefail` in the submission directory and appends the command, the combined output with trailing spaces shown as `[SPACE]` and CRs as `[CR]`, and the exit code.

## Snapshot

`snapshot.txt` in this directory (base `a55b664`) lists SHA-256 hashes of the five changed files, this file, and `checks.txt`, with paths from the repository root.

## Limitations

- Only a text search was used to find stale references; references phrased without the path or the searched words could remain.
- The full test suite and E2E tests were not run: the only code file changed is a comment in `scripts/agent-loop.sh`, whose own tests were run.
- No review has been performed yet; independent checker acceptance is pending.

## Round 2

The sections above describe round 1 as reviewed. The checker requested changes (`review.md`, round 1: F1 must fix, F2 recommended); the coordinator relayed both for fixing. Same maker, same base `a55b664`. Round-1 text above is left unchanged; this section supersedes it where they differ.

### Changes

| File | Lines | Change |
|---|---|---|
| `docs/architecture.md` | 24 | F1: "(1.1–6.1)" → "(0.1–6.1)". The archived `tasks.md` lists 0.1, 1.1–1.6, 2.1–2.2, 3.1–3.2, 4.1–4.3, 5.1–5.5, and 6.1, all `[x]`. The round-1 Changes table row for this line should read "all tasks (0.1–6.1) complete". |
| `scripts/session-context.sh` | 2–3 (comment) | F2: "(design D8, specs/session-context-hook/spec.md)" → "Normative behavior: `openspec/specs/session-context-hook/spec.md`; design: D8 in `openspec/changes/archive/2026-09-30-add-realtime-chat-room/design.md`", matching the `scripts/agent-loop.sh` comment. One extra comment line. |

### Checks (in `checks.txt`, entries prefixed "ROUND 2")

- `git diff --stat a55b664 -- .`: six files (the round-1 five plus `scripts/session-context.sh`), 13 insertions, 11 deletions; nothing staged; HEAD still `a55b664`.
- `scripts/session-context.sh`: only `#` lines changed; `bash -n` ok. Both paths in the new comment exist, and `design.md` has `### D8` at line 254. No `.ts` test references the script (grep exit 1).
- Hook run once from the project directory (`scripts/session-context.sh`): printed the "Active OpenSpec changes" header and the `list --json` output (`"changes": []`), exit 0.
- Task list of the archived `tasks.md`: 0.1 through 6.1, all `[x]`. The trailing `[SPACE]` in that entry comes from the `tr` join in the command, not from a file.
- `openspec validate --all --strict`: 3 passed, 0 failed, exit 0. `npm run lint`: exit 0. `git diff --check a55b664`: exit 0.
- Per-file `git diff --no-index --check /dev/null <file>` (calibrated in round 1) on `implementation.md` and `checks.txt`: see the last `checks.txt` entry.

### Snapshot

`snapshot.txt` is regenerated as revision 2 (base `a55b664`). It adds `scripts/session-context.sh` and has new hashes for `docs/architecture.md`, `implementation.md`, and `checks.txt`. The round-1 snapshot is replaced (it was never committed); `review.md` (round 1) records that its seven hashes verified and quotes the round-1 `checks.txt` hash.
