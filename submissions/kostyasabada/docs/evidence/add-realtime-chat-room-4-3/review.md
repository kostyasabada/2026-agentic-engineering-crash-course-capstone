# Task add-realtime-chat-room-4-3 — independent review

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker. Fresh subagent with a scoped handoff; it did not repair, stage, commit, or tick anything.
- Round: 1
- Date: 2026-09-29
- Runtime: Node v24.21.0, npm 11.19.0 (`PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`); dash 0.5.12 as `/bin/sh`.
- Base commit: `460fbe7` (`git log --oneline -1`), nothing staged (`git diff --cached --name-only | wc -l` = 0).

## Reviewed snapshot

`snapshot.txt` (revision 1): `sha256sum -c` of its nine hash lines returned `OK` for all nine (tasks.md `c626bbe4…`, design.md `c3020358…`, package.json `592ececc…`, chat-server.ts `b1ec7036…`, shutdown.spec.ts `2e239c65…`, startup.spec.ts `476dd66e…`, testing.md `6a403f5d…`, README.md `76a057f0…`, implementation.md `03fe78f3…`), before and after all checker runs. `checks.txt` hashes to `d8842595b1d6c2b1459824ea1eb688190b42411187aba91b83de67af3630fe8a`, the final hash stated by the maker. The checker read the diffs of all eight deliverables against `460fbe7`, `server.ts`, the full fixture, `implementation.md`, `snapshot.txt`, and the relevant `checks.txt` entries (red runs, probe, manual runs, mutations, final checks), and the F5 entry of the task 5.1 review.

## Findings

| ID | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|
| C1 | low, pre-existing, non-blocking | `README.md:46` | Confirmed (maker open issue 3): the run note that this task rewrites still ends with "`CHAT_DB_PATH` … is parsed already but not used until message storage is implemented". Storage has been used since task 4.2 (the shutdown tests store a message through Socket.IO in the fixture's `CHAT_DB_PATH` and read it back). The sentence is false in a line the task edits. | Replace it with one accurate sentence (the server stores messages in `CHAT_DB_PATH`, default `data/chat.sqlite`, git-ignored). Cheapest as a maker revision of this task (README is in the code group); then only `README.md` needs re-review. Acceptable as a follow-up doc fix if the coordinator prefers to keep the diff to the runner. |
| C2 | low, pre-existing limitation, non-blocking | `README.md:46`, `design.md:295`, implementation.md open issue 2 | The maker recorded only the group-signal case. The checker also signalled only the npm PID (as a supervisor that signals just its direct child, e.g. `npm start` as a container's PID 1, would). With the current scripts: `npm start` + SIGTERM to npm only → npm exits 143 after 17 ms, `sh` dies, the server receives no signal and keeps running and listening on port 3000 (reparented; still alive after 10 s; the checker then stopped it with a direct SIGTERM). Idle probe: SIGINT to npm only → npm forwards it to `sh`, dash keeps waiting, node receives nothing, the tree hangs (checker intervened by hand; see limitations). The same chain existed with the tsx CLI (`npm` → `sh` → CLI), so this is not a regression of 4.3. | Document it as a limitation (one sentence in the README run note or the design Risks entry): signal the whole process group (a terminal's Ctrl+C does) or run `NODE_ENV=production node --import tsx server.ts` directly under a supervisor. No user decision needed unless the user wants the npm scripts themselves to be supervisor-safe (see open issue 2 below). |
| C3 | info | implementation.md open issue 2 | The maker's prediction that `exec` in the scripts causes a second signal is confirmed at the signal level: an idle probe under an `exec` script received 2 signals on a group SIGINT and 2 on a group SIGTERM (npm forwards to its child, which is then node), and `strace` of the real server under an `exec` script shows two SIGINT deliveries (from the killer and from npm). However, the real server's handler ran only once in 17 of 17 group-signal runs (no "again, exiting immediately" line, exit 0, no `-wal`). "The rule would then cut the shutdown short" is therefore plausible but was not observed for the real server; the outcome is timing-dependent. | No change needed in this task; carry the nuance into any future decision on `exec`. |

No findings on the spec-first split, the correctness of the runner change, the fixture, or evidence honesty (details below).

## Review focus

1. **Spec first and decision record.** `tasks.md:32` adds unticked task 4.3 with goal, change, red-first, verification, and mutation; `design.md:51–53` (P6 refinement, the `relaySignals` reason, the rejected "assert only the child's exit" alternative, the decision with date 2026-09-29, the Ukrainian quote "коміть 5.1 і роби 4.3" and the translation "commit 5.1 and do 4.3"), `design.md:201` (D5 note), the D6 fixture sentence, and `design.md:295` (Risks) are consistent with each other and with `implementation.md`. The decision is described as the user's reply to the coordinator's recommendation, not as the user choosing the mechanism; nothing else is labelled a user decision. The F5 reference matches the task 5.1 review (F5, medium, "should be fixed in a separate task before 5.2"). Spec group = `tasks.md` + `design.md` only; no delta `spec.md` needs a change (no requirement mentions the runner). Strict validation of the change and of all items exits 0.
2. **Correctness.** `package.json:11,13` keep `NODE_ENV=development|production` in front of `node --import tsx server.ts`; `server.ts:10` still derives `dev` from `NODE_ENV`. `node --import tsx` resolves `tsx` from the working directory; the fixture sets `cwd: PROJECT_DIR` and spawns `process.execPath` (the Node binary running Playwright) with `['--import', 'tsx', 'server.ts']` and unchanged env, stdio, and `detached: true` (`e2e/fixtures/chat-server.ts:59–70`); the unused `TSX_CLI` constant is removed. The process tree is `npm` → `sh -c …` → `node --import tsx server.ts` (no CLI child). The shutdown handler received exactly one signal and logged both lines in every checker run (group SIGINT dev; group SIGTERM dev and start). Stack traces through the new runner point to source lines (`src/server/config.ts:47:11`, `:27:11`, `server.ts:9:18`), matching the maker's record. Comment edits in `shutdown.spec.ts` and `startup.spec.ts` change no logic.
3. **Reproduction honesty.** Checker probe (helper bodies extracted from `implementation.md`, byte-identical to the maker's helper files, run from a checker copy): tsx CLI 9 of 10 runs cut short (SIGINT: 4 × exit 130, 1 graceful; SIGTERM: 5 × exit 143; handler never ran in those 9); `node --import tsx` 10 of 10 graceful (handler ran once, exit 0). This reproduces the mechanism more strongly than the maker's 3 of 6. After the change: dev `--repeat-each=30` 0 failed / 90 passed; prod (after `next build`) `--repeat-each=10` 0 failed / 30 passed. The checker did not re-run the red E2E or the mutation (1 / 210 and 0 / 300 in the maker's runs; see limitations).
4. **Open issue 2** — see C2, C3 and the recommendation below.
5. **Open issue 3** — confirmed as C1.
6. **Evidence honesty.** `checks.txt` keeps every attempt in order: the red x20 with 0 failures, the red x50 with 1 failure (`"code": 130`), both non-reproducing mutations with hash-checked restores, and the corrected `server.ts:10` → `:9` slip and the literal `$SP` expansion are disclosed in `implementation.md`. Markers `[SPACE]` are visible where trailing spaces occur. The implementation report states plainly that E2E repeats alone cannot prove the fix and that the probe is the reliable demonstration.
7. **Proportionality.** The deliverable diff is small (23 insertions, 17 deletions over 8 files) and limited to the runner, its documentation, and comments that had become inaccurate; the evidence is proportionate to an intermittent signal-timing defect.

## Independent checks

All run from `submissions/kostyasabada/` with the Node path above, `OPENSPEC_TELEMETRY=0`, and a checker recorder that marks trailing spaces as `[SPACE]` (log kept in the checker's scratchpad, removed after this report; results below are copied from it).

| Check | Result |
|---|---|
| `sha256sum -c` of the snapshot hash lines; `sha256sum checks.txt` | 9 × OK, exit 0; `d8842595…fe8a` (matches) |
| `openspec validate add-realtime-chat-room --strict`; `validate --all --strict` | valid, exit 0; 1 passed, 0 failed, exit 0 |
| Probe, 5 runs per runner × signal | CLI 9 / 10 cut short; `--import` 10 / 10 graceful |
| `E2E_SERVER_MODE=dev npx playwright test e2e/shutdown.spec.ts --repeat-each=30` | 90 passed, 0 failed, exit 0 (232 s) |
| `npm run build` then `npx playwright test e2e/shutdown.spec.ts --repeat-each=10` (prod) | build exit 0; 30 passed, 0 failed, exit 0 |
| `npm run lint`; `npm run typecheck` | exit 0; exit 0 (first attempt piped through `tail` without `pipefail`; re-run without a pipe, both exit 0) |
| `npm run test:unit` | 8 files, 434 / 434 passed, exit 0 |
| `npm run test:e2e`; `npm run test:e2e:dev` | 19 passed, exit 0; 19 passed, exit 0 |
| `npm run check`; `npm run check:loop` | exit 0 (19 E2E passed); exit 0 (19 E2E passed) |
| Manual `npm run dev` via `setsid` (own process group, no tracer), SIGINT to the group | `GET /` 200; `> Received SIGINT, shutting down`, `> Server closed`; npm exit 130 after 96 ms, server already gone; port 3000 free; `-wal`/`-shm` present before, only `chat.sqlite` after; 0 group processes left |
| Manual `npm run dev` and `npm start`, SIGTERM to the group | both log lines; npm exit 143 after 21 ms while the server was still alive; server gone after 104 ms (dev) / 51 ms (start); port free; no `-wal`; 0 left |
| Manual `npm start`, SIGTERM to the npm PID only | npm exit 143; server received nothing, still listening after 10 s (C2); stopped by a direct SIGTERM from the checker; port then free |
| `exec` variant (temporary package outside the repository, script `cd <root> && NODE_ENV=production exec node --import tsx server.ts`) | group SIGTERM, npm-only SIGTERM, 8 × group SIGINT, 8 × group SIGTERM, 1 × group SIGINT under `strace`: handler once, both log lines, npm exit 0, port free, no `-wal` in all 19; `strace` shows two SIGINT deliveries to the server (C3) |
| Idle probe (logs every signal), npm `plain` vs `exec` script | plain: group SIGINT/SIGTERM → 1 signal each; npm-only SIGTERM → 0 (orphan); npm-only SIGINT → hang. exec: group SIGINT/SIGTERM → 2 signals each; npm-only → 1 each |
| `PORT=abc node --import tsx server.ts` | `ConfigError` with frames `src/server/config.ts:47:11`, `:27:11`, `server.ts:9:18`; node exit 1 |
| `git diff --check`; `git diff --no-index --check /dev/null <file>` for the 3 untracked evidence files | exit 0; exit 1 each (differs, no whitespace error) |
| `git status --short` | the 8 modified deliverables and `?? docs/evidence/add-realtime-chat-room-4-3/`; nothing staged |
| Leftovers (node / Chromium / npm processes matching `server.ts`, `next`, `playwright`, `vitest`, `tsx`; port 3000; `chat-e2e-*` dirs) | none; port 3000 free; 0 |

## Limitations

- The red E2E run and the mutation were not re-run by the checker; the checker relied on the maker's recorded runs plus its own probe for the "before" state.
- In the idle-probe case "plain script, SIGINT to the npm PID only" the tree hung; the checker sent SIGINT to the node PID by hand from another shell. That run's recorded "SIGINT #1" comes from this intervention, not from npm (recorded as a note in the checker log).
- The server orphaned by the npm-only SIGTERM run had its temporary DB directory removed by the helper while it was still open; its graceful exit after the checker's direct SIGTERM was confirmed by the PID disappearing and the port being freed, not by its log lines.
- The checker's manual runs used `setsid` from a non-interactive shell, not a real terminal; a terminal's Ctrl+C sends the same group SIGINT. Supervisors (systemd, Docker, pm2) were not tested; their behavior is inferred from the npm-PID-only runs.
- Why the real server handled only one of two SIGINT deliveries under `exec` (C3) was not investigated further.

## Recommendations on the maker's open issues

- **Open issue 2 (npm exits before the server finishes on SIGTERM):** with a group signal the impact is cosmetic for this local-only app: the server still finishes, closes Socket.IO and the database (no `-wal` left), and frees the port; only npm's exit status (130/143) and timing (npm exits about 30–85 ms earlier) differ. The real risk is a supervisor that signals only npm's PID or kills the rest of the tree as soon as npm exits (C2), which is pre-existing and not made worse by 4.3. `exec` is not a drop-in fix (C3: double delivery confirmed at the signal level). Recommendation: accept as a documented limitation (one README sentence as in C2); no user decision is needed now. A user decision would be needed only to make the npm scripts supervisor-safe, which means either `exec` plus relaxing the 4.2 "second signal exits with 1" rule for a repeated identical signal, or recommending the direct `node --import tsx server.ts` command for deployment.
- **Open issue 3 (stale `CHAT_DB_PATH` sentence):** confirmed (C1); fix with one sentence, preferably in this task's code commit.

## Verdict

**accepted** (round 1). The deliverables meet the task 4.3 criteria: the spec group precedes the code group and the decision record is accurate, the runner change is correct in dev and prod, the shutdown handler receives exactly one signal from a group signal, the probe shows the mechanism and its removal, the repeat runs and all required checks pass, and the evidence is honest about the rare reproduction. C1 and C2 are low-severity, non-blocking documentation items; if the maker changes `README.md` for them, that file needs re-review before the code commit.

## Round 2

- Checker: the same Claude Code general-purpose subagent (checker), separate from coordinator and maker. Date 2026-09-29, Node v24.21.0, base `460fbe7`.
- Reviewed snapshot: `snapshot.txt` revision 2. `sha256sum -c` of its nine hash lines: 9 × OK, exit 0. README.md is now `37ab96310a43f5e97310295becade1d446d5a080e2a49e5f4fb3435612ef52bc`, implementation.md `e6784b1a…821d`; the other seven hashes (tasks.md, design.md, package.json, chat-server.ts, shutdown.spec.ts, startup.spec.ts, testing.md) equal revision 1. `checks.txt` hashes to `a4acbe247c58c1356799488da2193a88f5cb39f0863ae45720f3a98385a1a37f`, as stated by the maker. The spec group is still only `tasks.md` and `design.md`, both unchanged.
- User decision (relayed by the coordinator, recorded in implementation.md "Round 2"): "так, виправляй і потім коміть" (translated: "yes, fix and then commit").
- README diff: `git diff 460fbe7 -- README.md` is still one line (46). Compared with round 1, it adds exactly one sentence after the Ctrl+C note and replaces only the final `CHAT_DB_PATH` sentence. Nothing else in that line changed.

| Finding | Resolution | Check |
|---|---|---|
| C1 | Resolved. The new sentence says the server stores chat messages in the SQLite file `CHAT_DB_PATH` (default `data/chat.sqlite`, relative to the working directory, git-ignored, parent directory created if missing). | This matches `src/server/config.ts:19,29` (default and env value), `src/server/app.ts:116` (`openDatabase(config.dbPath)`), `src/server/db/sqlite.ts:24` (`mkdirSync(dirname(path), { recursive: true })`) and `.gitignore:6` (`data/`). |
| C2 | Resolved. The new sentence says Ctrl+C signals the whole process group; a supervisor that signals only npm's PID does not reach the server, which keeps running; the fix is to signal the group or run `NODE_ENV=production node --import tsx server.ts` directly. | This matches the round-1 npm-PID-only runs: the server stayed alive after SIGTERM, and the tree hung after SIGINT with the server still running. It is consistent with `design.md:295`, which says `npm run` remains a wrapper. That Risks entry does not name the supervisor case; the README is the right place for that. |
| C3 | Info only, no change expected. | — |

- Minor (info, not blocking): the added sentence partly repeats the preceding clause ("reaches the server's graceful shutdown" / "so the server shuts down gracefully").
- Independent checks, round 2:
  - `git diff --check` exit 0.
  - `git diff --no-index --check /dev/null <file>` exits 1 (clean) for `checks.txt`, `implementation.md`, `review.md` (before this append) and `snapshot.txt`.
  - `git status --short` shows only the 8 modified deliverables and the untracked evidence directory; nothing is staged.
  - No application checks were re-run, because only documentation changed. The maker's round-2 `npm run lint` exit 0 is recorded in `checks.txt`.
- Verdict: **accepted** (round 2), for snapshot revision 2.
