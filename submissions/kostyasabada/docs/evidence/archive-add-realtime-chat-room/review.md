# Archive add-realtime-chat-room — step 1 review (spec synchronization)

## Round 1

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker; fresh scoped context.
- Date: 2026-09-30.
- Versions: Node `v24.21.0`, OpenSpec CLI `1.13.2` (`./node_modules/.bin/openspec`, `OPENSPEC_TELEMETRY=0`), git `2.53.0`, Python `3.14.4`.
- Task: `archive-add-realtime-chat-room`, step 1 only (sync the change's delta specs into `openspec/specs/`; the change is not moved in this step). User instruction 2026-09-30: commit and start the archiving.
- Read: `AGENTS.md`, `docs/workflow.md`, `docs/review-process.md`, `.agents/skills/openspec-sync-specs/SKILL.md`, `implementation.md`, `checks.txt`, `snapshot.txt`, the three new main specs, and the three delta specs under `openspec/changes/add-realtime-chat-room/specs/`.

### Reviewed snapshot

`snapshot.txt` (label "step 1: sync", base `3812985` / `38129856973331ffc11a4ce2b500965e57dd2cf3`). All five hash lines verified with `sha256sum -c` from the repository root: OK.

| File | SHA-256 |
|---|---|
| `openspec/specs/agent-loop/spec.md` | `aa03de04635151fc333d70c0a486062856e59a532aab4b19ae21136420083efe` |
| `openspec/specs/chat-room/spec.md` | `764888684a22450f5c723971d0ea88b98bb09e68eb4098a77328a1654ed57a5e` |
| `openspec/specs/session-context-hook/spec.md` | `ee541d8bb5a945bc2c98e1c5ddb4d57d24045e5c38a8ebee204ddeb8488ea87e` |
| `docs/evidence/archive-add-realtime-chat-room/implementation.md` | `ca112cdb304f94816de8a28444d31d3a17fcedb795c533c6712335dbe4269641` |
| `docs/evidence/archive-add-realtime-chat-room/checks.txt` | `2874906a6ca0598758672d2e58ae9c5811e89f56ef40c86d18071c35fc17ad47` (recomputed by the checker; matches `snapshot.txt`) |

`snapshot.txt` itself is not hashed (it lists the others); this review is added after the snapshot and is not part of it.

### Findings

No blocking or medium findings against the step-1 deliverables.

1. Low, follow-up outside step 1 (not a defect of this snapshot): after step 2 moves the change, these tracked references to the active change path will be stale and should be updated in a separate, reviewed docs task: `README.md:7`, `docs/architecture.md:19`, `docs/architecture.md:20`, `docs/architecture.md:24`, `docs/testing.md:3`, `docs/workflow.md:48` (also its sentence that `openspec/specs/` and the archive "stay empty until" the first change is archived), `docs/workflow.md:62`, `docs/workflow.md:66`, and the comment at `scripts/agent-loop.sh:4`. No references were found in `src/`, `tests/`, `.claude/`, or `CLAUDE.md`. Historical evidence under `docs/evidence/` should stay as it is.
2. Info, evidence accuracy (no change needed): `implementation.md:39` states that the maker's `fidelity.py` compares blocks "exactly except for blank lines at block edges", so on its own it would not detect an added or removed blank line at a block edge. This is disclosed, and the gap is closed by the byte-identical CLI comparison (maker and checker) and by the checker's strict byte-level reconstruction below.
3. Info, evidence scope (no change needed): the whitespace runs logged in `checks.txt` list five untracked files; `snapshot.txt` was created afterwards and its recheck is not logged, as `snapshot.txt:4` states. The checker checked `snapshot.txt` independently (clean, below).

### Independent checks

Run by the checker from `submissions/kostyasabada/` with `PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH` and `OPENSPEC_TELEMETRY=0`. Disposable copies were created in the session scratchpad outside the repository and removed afterwards.

1. Fidelity, checker's own script (`chk_fidelity.py`, written independently of the maker's `compose_main_spec.py` and `fidelity.py`; SHA-256 `bb2d15d73a894569d12131398fe322a260082a0066aaeb4471f9a83e3e562caa`, body below). Per capability it requires: title `# <capability> Specification`; exactly the sections `## Purpose` and `## Requirements` in the main spec (delta: `## Purpose`, `## ADDED Requirements`); no delta operation headers; Purpose body equal to the delta's; the text after `## Requirements` byte-identical to the text after `## ADDED Requirements`; the parsed ordered list of requirements and their scenarios equal; the whole main spec byte-equal to a reconstruction from the delta (so nothing extra); no CR, no trailing whitespace, exactly one final newline. Result: exit 0 for all three.

   | Capability | Requirements (delta / main) | Scenarios (delta / main) | Result |
   |---|---|---|---|
   | agent-loop | 6 / 6 | 18 / 18 | OK |
   | chat-room | 9 / 9 | 53 / 53 | OK |
   | session-context-hook | 3 / 3 | 5 / 5 | OK |

   Self-test on mutated copies of `session-context-hook/spec.md` (outside the repository): an extra trailing newline, the blank line after `## Requirements` dropped, an appended extra requirement, a renamed requirement, and a Purpose edit were each detected (exit 1). A blank line removed between a requirement body and its first scenario was also detected (exit 1). One first attempt at that last mutation (a `sed` expression) did not change the file ("NOT APPLIED", exit 0 on an unchanged copy); it was retried with `awk` and then detected. Both attempts are recorded here.
2. CLI equivalence. Copy A: `git archive HEAD openspec` (no synced specs; `openspec/specs/` held only `.gitkeep`), then `openspec archive add-realtime-chat-room --yes`: "create" for all three, `+ 6`, `+ 9`, `+ 3`, `Totals: + 18, ~ 0, - 0, → 0`, exit 0. `cmp` of each generated main spec with the real repository file: byte-identical for all three. `diff -r` of the real change directory with the moved `openspec/changes/archive/2026-09-30-add-realtime-chat-room/`: identical.
   Copy B: the same base tree plus the three synced specs, then the recommended step-2 command `openspec archive add-realtime-chat-room --yes`: "update" for all three, `Totals: + 0, ~ 0, - 0, → 0`, "Specs already in sync; no files changed.", exit 0; `sha256sum -c` of the pre-run spec hashes: OK for all three; `diff -r` of the moved change with the original: identical; `diff -r` of the final trees of copies A and B: identical.
   Copy C (closer to the real run): full `git archive HEAD .` of the submission plus the synced specs, `node_modules` symlinked, committed in a throwaway git repository, then the same command: identical output ("Specs already in sync; no files changed.", exit 0); `git status` showed only the change deleted and the archive directory added, `git diff --stat HEAD -- openspec/specs` empty, and after staging `git diff --cached -M --summary` reported seven 100% renames into `openspec/changes/archive/2026-09-30-add-realtime-chat-room/`.
3. Validation in the real repository: `openspec validate --all --strict`: 4 passed, 0 failed, exit 0. `openspec validate --specs --strict`: 3 passed, 0 failed, exit 0. Both print only `[INFO]` notes about requirement text longer than 500 characters. `openspec list --specs`: `agent-loop` 6, `chat-room` 9, `session-context-hook` 3, exit 0.
4. Real repository state: `git log --oneline -1` is `3812985 test: final verification from a clean checkout (task 6.1 phase B)`. `git diff --exit-code HEAD -- openspec/changes`: exit 0, and `git status --short --untracked-files=all -- openspec/changes` is empty. `git status --short --untracked-files=all`: only the three new main specs and `checks.txt`, `implementation.md`, `snapshot.txt` (before this review was written). Nothing staged (`git diff --cached --quiet` exit 0). No changes outside `submissions/kostyasabada/` in the course repository status. `git diff --check` and `git diff --check HEAD`: exit 0. `git diff --no-index --check /dev/null <file>` for each of the six untracked files: exit 1 with no output (exit 1 only signals a difference; the maker's calibration in `checks.txt` shows exit 3 with output for a file with whitespace errors). `sha256sum -c` of the `snapshot.txt` hash lines: OK.
5. Evidence honesty:
   - `checks.txt` trailing newline: the failed per-file run is recorded with its output (`checks.txt:837: new blank line at EOF.`, rc 3, overall exit 1), followed by a logged note that the helper was changed to write the separator before each entry and that the one trailing newline at EOF was removed. The final `checks.txt` ends in `[exit code: 0]` and a single newline. `implementation.md:45` discloses the same. That no other log content was edited cannot be proven without an earlier copy; the entries are consistent with the helper change (blank-line separators before each later entry).
   - Mutation self-test of `fidelity.py`: `checks.txt` records mutations a (scenario body), b (scenario heading), d (`## ADDED Requirements` header) detected with rc 1; mutation c printed "c: mutation not applied" and `fidelity.py` returned `RESULT: match`, rc 0 on the unchanged copy; the retry recorded c (requirement body, `SHALL` to `MUST`) and e (trailing space on a scenario line), both rc 1. This matches `implementation.md:40`.
   - The Revision 1 CLI diff (one extra blank line after `## Purpose` in each file) and the Revision 2 byte-identical result are both recorded, as `implementation.md` describes.
   - The specs-rule snapshot in `checks.txt` has one rule ("Add verifiable scenarios for requirements, including failure cases."); the delta text is copied verbatim, so it imposes no change.
   - The skill's new-capability rules hold: all three deltas have only `## Purpose` and `## ADDED Requirements`, no MODIFIED/REMOVED/RENAMED; `.openspec.yaml` has no `retire_capabilities`; no TBD Purpose placeholder was needed.

<details>
<summary>Checker helper body: chk_fidelity.py</summary>

```python
#!/usr/bin/env python3
"""Checker's own fidelity check (independent of maker's fidelity.py).
Usage: chk_fidelity.py <capability> <delta> <main>
Strict: byte-level structural reconstruction, plus parsed requirement/scenario order."""
import sys, re
cap, dpath, mpath = sys.argv[1:4]
d = open(dpath, 'rb').read().decode('utf-8')
m = open(mpath, 'rb').read().decode('utf-8')
errs = []
if '\r' in m: errs.append('CR in main')
if not m.endswith('\n') or m.endswith('\n\n'): errs.append('main does not end with exactly one newline')
for i, l in enumerate(m.split('\n'), 1):
    if l != l.rstrip(' \t'): errs.append(f'trailing whitespace main:{i}')
if re.search(r'^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements', m, re.M): errs.append('delta header in main')
dl = d.split('\n'); ml = m.split('\n')
# delta sections
dsec = [(i, l) for i, l in enumerate(dl) if l.startswith('## ')]
msec = [(i, l) for i, l in enumerate(ml) if l.startswith('## ')]
if [l for _, l in dsec] != ['## Purpose', '## ADDED Requirements']: errs.append(f'unexpected delta sections {dsec}')
if [l for _, l in msec] != ['## Purpose', '## Requirements']: errs.append(f'unexpected main sections {msec}')
if ml[0] != f'# {cap} Specification': errs.append(f'title {ml[0]!r}')
# Purpose bodies (strip only surrounding blank lines)
def body(lines, a, b):
    x = lines[a+1:b]
    while x and x[0] == '': x.pop(0)
    while x and x[-1] == '': x.pop()
    return x
dp = body(dl, dsec[0][0], dsec[1][0]); mp = body(ml, msec[0][0], msec[1][0])
if dp != mp: errs.append('Purpose body differs')
# Requirements block: everything after the header, must be byte-identical
dreq = '\n'.join(dl[dsec[1][0]+1:]); mreq = '\n'.join(ml[msec[1][0]+1:])
if dreq != mreq: errs.append('requirements block not byte-identical')
# Parsed order check
def parse(t):
    out = []
    for l in t.split('\n'):
        if l.startswith('### Requirement: '): out.append((l[17:], []))
        elif l.startswith('#### Scenario: '): out[-1][1].append(l[15:])
    return out
pd, pm = parse(dreq), parse(mreq)
if pd != pm: errs.append('parsed requirement/scenario order differs')
# nothing extra outside: main == title + blank + Purpose + body + blank + Requirements + block
recon = f'# {cap} Specification\n\n## Purpose\n' + '\n'.join(dp) + '\n\n## Requirements' + '\n' + dreq
if recon != m: errs.append('main != reconstruction from delta')
nr = len(pd); ns = sum(len(s) for _, s in pd)
print(f'{cap}: requirements {nr}/{len(pm)} scenarios {ns}/{sum(len(s) for _, s in pm)} ->', 'OK' if not errs else 'FAIL: ' + '; '.join(errs))
for r, s in pd: print(f'  {r} [{len(s)}]')
sys.exit(1 if errs else 0)
```

</details>

## Recommendation for step 2

Use the default command, not `--skip-specs`, run from `submissions/kostyasabada/` with the pinned CLI per `docs/workflow.md` (Commands):

```bash
OPENSPEC_TELEMETRY=0 npm run --silent openspec -- archive add-realtime-chat-room --yes
```

(equivalently `OPENSPEC_TELEMETRY=0 ./node_modules/.bin/openspec archive add-realtime-chat-room --yes`). Do not pass `--no-validate`.

Reason: with the specs already synced, the default run re-applies the deltas and writes nothing ("Specs already in sync; no files changed.", `Totals: + 0, ~ 0, - 0, → 0`), so it is a free CLI cross-check of this sync; `--skip-specs` produces the same files but skips that check and would hide drift if a main spec had changed.

Preconditions:

- Immediately before the run, `sha256sum -c` of the three main-spec lines in `snapshot.txt` passes and `git diff --exit-code HEAD -- openspec/changes` is empty; otherwise this acceptance no longer applies.
- Stop and report if the run prints anything other than `+ 0, ~ 0, - 0, → 0` and "Specs already in sync; no files changed.", or exits non-zero.
- Afterwards verify: main-spec hashes unchanged; `openspec/changes/add-realtime-chat-room/` gone and `openspec/changes/archive/<run date>-add-realtime-chat-room/` identical to the committed change (`git diff -M` shows only 100% renames); `openspec validate --all --strict` passes. The date prefix is the date of the run.
- Recommended, not required: commit step 1 (specs and this evidence) first, with the user's explicit approval for that commit per `AGENTS.md`, so the step-2 diff is pure renames. The user's "commit and start the archiving" instruction does not by itself approve a specific commit; the coordinator shows `git status --short` and `git diff --stat` and waits for approval.
- Plan the Low follow-up (finding 1) as a separate reviewed docs task after the move.

## Limitations

- Copies A and B contained only `openspec/`; copy C was a full `git archive HEAD` of the submission with `node_modules` symlinked, but ran in a throwaway git repository, not the real one. The real step-2 run was not performed.
- The claim that no other `checks.txt` content was edited when the trailing newline was removed cannot be verified independently (no earlier copy exists).
- No application tests were run: step 1 changes specifications and evidence only.
- The checker's helper lives in the session scratchpad and is removed after this review; its body is included above.

## Verdict

accepted — the three main specs in the snapshot are byte-identical to what `openspec archive` 1.13.2 generates from the change, contain every delta requirement and scenario verbatim and in order with the Purpose copied and no delta headers, validate strictly, and leave the change untouched. Finding 1 is a follow-up for after step 2, not a blocker for this step.
