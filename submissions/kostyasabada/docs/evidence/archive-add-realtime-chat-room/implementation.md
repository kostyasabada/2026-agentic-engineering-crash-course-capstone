# Archive add-realtime-chat-room — step 1: spec synchronization

## Task

- Task ID: `archive-add-realtime-chat-room`, step 1 (spec synchronization only).
- User instruction (2026-09-30): commit and start the archiving. Per `docs/workflow.md`, spec synchronization is delegated to a maker and reviewed by an independent checker before the change is moved. This step does not move or archive the change.
- Maker: Claude Code general-purpose subagent (maker), fresh scoped context.
- Base commit: `3812985` (`38129856973331ffc11a4ce2b500965e57dd2cf3`).
- Environment: Node `v24.21.0`, OpenSpec CLI `1.13.2` (`./node_modules/.bin/openspec`, `OPENSPEC_TELEMETRY=0`).

## Acceptance criteria

1. `openspec/specs/<capability>/spec.md` exists for `agent-loop`, `chat-room`, and `session-context-hook`, produced by applying the change's delta specs as OpenSpec would: the delta's `## Purpose` body copied verbatim, every ADDED requirement and scenario verbatim under a single `## Requirements` section, no delta operation headers.
2. The result equals what `openspec archive` generates.
3. `openspec validate --all --strict` and `openspec validate --specs --strict` exit 0; `openspec list --specs` shows the three capabilities with requirement counts matching the deltas.
4. A fidelity script confirms every delta requirement and scenario appears unchanged in the main spec.
5. `openspec/changes/add-realtime-chat-room/` is untouched; nothing staged or committed; nothing outside the submission changed apart from the maker's scratch area.

## Method

Manual (agent-driven) sync following `.agents/skills/openspec-sync-specs/SKILL.md`, verified against the CLI.

- OpenSpec 1.13.2 has no sync-only command (`openspec --help`; `openspec archive --help` offers only `--yes`, `--skip-specs`, `--no-validate`, `--json`, `--store`). The CLI applies deltas only as part of `archive`, which also moves the change, so it was not run in the real repository.
- All three deltas are new capabilities with `## Purpose` and `## ADDED Requirements` only (no MODIFIED/REMOVED/RENAMED), so each main spec is created from its ADDED requirements. The specs-rule snapshot (`openspec instructions specs --change add-realtime-chat-room --json`) returned one rule about verifiable scenarios; it constrains content already present verbatim in the deltas and needed no change.
- Main specs were written by a small composer script (`compose_main_spec.py`, body in `checks.txt`) that follows the skill's Main Spec Format Reference: `# <capability> Specification`, `## Purpose`, the Purpose body, `## Requirements`, then the ADDED block verbatim.
- CLI reference: the base `openspec/` tree (`git archive HEAD openspec`) was extracted into a disposable directory in the scratchpad outside the repository, and `openspec archive add-realtime-chat-room --yes` was run there.
  - Revision 1 of the composed specs differed from the CLI output only by one blank line after `## Purpose` in each file (the CLI puts the body directly under the heading). The composer was adjusted and the specs recomposed.
  - Revision 2 is byte-identical to the CLI output for all three files (`diff -u` empty, `cmp` identical, equal SHA-256).
- In `checks.txt`, a `[SPACE]` shown on an otherwise empty `diff -u` context line is the diff's own leading-space prefix for a blank line, not trailing whitespace in the spec files.

## Results

| Capability | Requirements (delta / main) | Scenarios (delta / main) | Fidelity | CLI byte-identical |
|---|---|---|---|---|
| agent-loop | 6 / 6 | 18 / 18 | match | yes |
| chat-room | 9 / 9 | 53 / 53 | match | yes |
| session-context-hook | 3 / 3 | 5 / 5 | match | yes |

- Fidelity script (`fidelity.py`, written independently of the composer; body in `checks.txt`) compares the Purpose body, the ordered requirement names and bodies, and the ordered scenario names and bodies, exactly except for blank lines at block edges, and rejects delta operation headers in main specs. All three capabilities: exit 0.
- Calibration: mutated copies were detected (exit 1) for a scenario-body edit, a scenario-heading edit, a requirement-body edit, a trailing space added to a scenario line, and a `## ADDED Requirements` header in a main spec. One first-attempt mutation (`the message is rejected`) did not apply because the text does not occur in the file; the retry used a requirement-body edit instead. Both attempts are recorded.
- `openspec validate --all --strict`: 4 passed, 0 failed, exit 0. `openspec validate --specs --strict`: 3 passed, 0 failed, exit 0. Both print informational notes only (requirement text longer than 500 characters).
- `openspec list --specs`: `agent-loop` 6, `chat-room` 9, `session-context-hook` 3 requirements, matching the delta counts (the CLI archive run also reported `+ 6`, `+ 9`, `+ 3` added).
- `git diff --exit-code HEAD -- openspec/changes`: no diff; nothing staged; `git status` shows only the three new main specs and this evidence directory as untracked.
- Whitespace: `git diff --check HEAD` exit 0 (no tracked changes). Per untracked file, `git diff --no-index --check /dev/null <file>` was calibrated: exit 3 with output for a file with a trailing space and a CR, exit 1 with no output for a clean file (exit 1 only signals that the files differ). All five untracked files: exit 1, no output.
- The first per-file whitespace run failed: `checks.txt` ended with a blank line because the logging helper wrote a blank line after each entry. The helper now writes the separator before each entry, and the one trailing newline at the end of `checks.txt` was removed; no other log content was edited. Both runs are recorded.

## Step 2 (moving the change) — rehearsed in disposable copies

Two further disposable copies held the base `openspec/` tree plus the synced main specs:

- `openspec archive add-realtime-chat-room --yes` reported `Totals: + 0, ~ 0, - 0, → 0` and `Specs already in sync; no files changed.`, exit 0. The main-spec hashes were unchanged: the CLI re-evaluates the deltas but, with the specs synced, writes nothing and does not duplicate requirements.
- `openspec archive add-realtime-chat-room --yes --skip-specs` reported `Skipping spec updates (--skip-specs flag provided).`, exit 0; the main-spec hashes were unchanged.
- In both, the change moved to `openspec/changes/archive/2026-09-30-add-realtime-chat-room/`, with content identical to the original (`diff -r`). The date prefix is the date the command runs.

## Snapshot

`snapshot.txt` in this directory (label "step 1: sync", base `3812985`) lists SHA-256 hashes of the three main specs, this file, and `checks.txt` (hash taken after the final append).

## Limitations

- The CLI comparison ran the same CLI version from the submission's `node_modules` in a copy of `openspec/` only (not the full submission); the root resolved to the copy (`source: nearest`).
- Helper scripts live in the session scratchpad (outside the repository) and are not part of the deliverables; their full bodies are in `checks.txt`. The scratchpad also contains unrelated files from earlier sessions, which were not touched.
- No application tests were run: this step changes specifications only.
- No review has been performed yet; independent checker acceptance is pending.

## Step 2: move the change

The sections above describe step 1 as reviewed. The checker accepted it (`review.md`), and it was committed as `a0d8abd`. The step-1 `snapshot.txt` is preserved in that commit; the current `snapshot.txt` is the step-2 snapshot.

- Instruction: user, 2026-09-30, "commit and run step 2", relayed by the coordinator. Maker: the same Claude Code general-purpose subagent (maker). Base: `a0d8abd` (`a0d8abdb5a28090d964fbc1a2b46de7648f9a83f`). Node `v24.21.0`.
- Criteria:
  - Run the checker's recommended default command with no `--skip-specs` and no `--no-validate`.
  - Stop without fixing if the output is anything other than zero totals with "Specs already in sync; no files changed.", or if the exit code is non-zero.
  - Afterwards: main specs unchanged; the moved files identical to the originals; strict validation passes; no active changes; spec counts 6/9/3.
  - Do not edit documents that reference the old path, and do not stage or commit.

### Preconditions (all recorded in `checks.txt`, STEP 2 part)

- HEAD is `a0d8abd`.
- `sha256sum -c` on the three main-spec lines of the committed step-1 `snapshot.txt`: all OK.
- `git diff --exit-code HEAD -- openspec/changes`: no diff.
- `git status --short` was not empty. The only entry was `checks.txt`, modified by this step's own STEP 2 appends: the HEAD version is an exact byte prefix of the working file, and nothing else was modified or untracked. The precondition entry therefore shows exit 1, followed by the append-only proof with exit 0. I treated this as satisfied in substance: it is not the archive stop condition.

### Command and output

`OPENSPEC_TELEMETRY=0 npm run --silent openspec -- archive add-realtime-chat-room --yes` exited 0. It printed the non-blocking proposal warning, then `Task status: ✓ Complete`, all three specs listed as `update`, `Totals: + 0, ~ 0, - 0, → 0`, `Specs already in sync; no files changed.`, and `Change 'add-realtime-chat-room' archived as '2026-09-30-add-realtime-chat-room'.` The stop condition was not triggered.

### Verification after the move

- Moved from `submissions/kostyasabada/openspec/changes/add-realtime-chat-room/` to `submissions/kostyasabada/openspec/changes/archive/2026-09-30-add-realtime-chat-room/`. The old path no longer exists, and `openspec/changes/` now contains only `archive/` (`.gitkeep` plus the archived change).
- Main specs: the SHA-256 values match the step-1 snapshot, and `git diff --exit-code HEAD -- openspec/specs` shows no diff.
- Content identity:
  - The `git ls-tree -r HEAD` blob hashes of the 7 files at the old path equal `git hash-object` of the 7 files at the new path.
  - Each file is byte-identical to `git show HEAD:<old path>/<file>` (`cmp`).
  - Together these show the move is 7 pure renames.
- `git status --short` / `--porcelain`: 7 `D` entries at the old path, 7 `??` entries at the new path, and ` M checks.txt`. Nothing is staged.
  - `git diff --stat -M HEAD` lists only the deletions, because the new files are untracked (`git add -N` was not allowed) and git cannot pair them as renames. The blob-hash comparison above stands in for that.
- `openspec validate --all --strict`: 3 passed, 0 failed, exit 0 (INFO notes only; no change items remain).
- `openspec list --json`: `"changes": []`. `openspec list --specs`: agent-loop 6, chat-room 9, session-context-hook 3.
- Whitespace: see the final entries in `checks.txt`. The check method is the one calibrated in step 1.

### Step 2 limitations and follow-up

- Tracked documents that still reference the old active-change path were deliberately not edited: the checker's finding 1 lists `README.md`, `docs/architecture.md`, `docs/testing.md`, `docs/workflow.md`, and `scripts/agent-loop.sh`. That is a separate follow-up task.
- Checker review of step 2 is pending.
