# Review: add-realtime-chat-room-spec

## Round 1

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker. Model: Claude Opus 5.5.
- Date: 2026-09-26 (checks run around 2026-09-26T06:57Z).
- Reviewed snapshot: `docs/evidence/add-realtime-chat-room-spec/snapshot.txt` (file manifest, 9 entries, base commit `cde39ddc390b493c1709ebdc2a2057c7d2b48005`). All 9 hashes verified OK (see Independent checks). The handoff named base `c0c46da`; actual HEAD and snapshot base is `cde39dd` (user commit pinning Node 24 and dev tools), whose parent is `c0c46da`. This is recorded by the maker and is not a problem.
- Scope read: `docs/review-process.md`, `AGENTS.md`, `docs/architecture.md`, `docs/testing.md`, `openspec/config.yaml`, `package.json`, `.nvmrc`, the full change (`proposal.md`, `specs/chat-room/spec.md`, `specs/agent-loop/spec.md`, `specs/session-context-hook/spec.md`, `design.md`, `tasks.md`), and the maker evidence (`implementation.md`, `checks.txt`, `snapshot.txt`).

### Criteria assessment

| Criterion | Result |
|---|---|
| proposal: goal, scope, non-goals (config rule) | Met — `proposal.md:9`, `:11-21`, `:23-31`. |
| Scope: one room, nickname without registration, real-time, latest 100 | Met — `proposal.md:13-16`; non-goals exclude rooms, accounts, pagination. |
| specs: verifiable scenarios incl. failure cases (config rule) | Met — empty (`chat-room/spec.md:60-66`), oversized browser/server (`:68-74`), invalid nickname incl. server-side (`:17-31`), connection loss (`:120-122`), restart persistence (`:113-115`, `:132-134`), 100 limit ordering (`:98-100`), delivery to another client (`:44-47`). |
| design: accepted / proposals / open questions separated (config rule) | Met — label legend `design.md:12-16`; every decision labelled; Q1–Q12 at `:226-241`. |
| Accepted user decisions labelled | Met — Next.js (`:37`), Socket.IO + `server.ts` with consequences (`:45-46`), SQLite + restart (`:70`), local single process + single-instance broadcast limitation (`:71`), Playwright (`:129`), `npm run check` (`:107`), loop ownership/defaults (`:139`), SessionStart hook (`:174`). |
| Coordinator proposals labelled as proposals, not user decisions | Met — App Router P1, TS strict P2, Server Components P3, npm P4, layout/colocation P10, zod P11, ESLint Next config P12, Vitest P13, SQLite driver P9. Versions independently confirmed with `npm view` (below). |
| Product details not decided by user are proposals/open questions | Met in design (`design.md:228`, Q1–Q6); see finding N1 about the spec files themselves. |
| Playwright: config, location, server startup, exact command (config rule) | Met — `design.md:130-135`. |
| Check composition | Met — `design.md:110-125`. |
| Loop: interface, agent selection, limit, stop conditions, log format, CLI permissions, cost control, ownership (config rules) | Met — `design.md:139-170`, normative in `specs/agent-loop/spec.md`. |
| Hook: config, command, output, failure behavior, Codex parity (config rule) | Met — `design.md:175-201`; parity honestly left "unknown" (`:201`, Q8). |
| Risks | Met — `design.md:207-220`. |
| tasks: ordered, tooling early, checks per task, maker/checker per task, evidence (config rules) | Met — preamble `tasks.md:3`; decision gate 0.1; tooling 1.1–1.6 before features; every task has a "Verify" clause. |
| Real task through the loop with committed `loop-run.log` | Met — `tasks.md:20` (task 2.1), with checker review of the log. |
| Recorded actual hook output | Met — `tasks.md:15` (task 1.5, `hook-output.txt`, "state plainly anything that could not be observed"). |
| Honesty: unknowns left open | Met — Codex flags (Q9, `design.md:152`), Codex hook parity (Q8, `:201`), TS/ESLint compat as open Q7, Node version drift recorded (`:8`). |
| No code, no installs, nothing outside submission | Met — see Independent checks. |

### Findings

No blocking findings.

Non-blocking:

- **N1 (honesty/traceability)** `specs/chat-room/spec.md:10`, `:58`, `:54`, `:118` — The spec states the proposed product values (32-char nickname and allowed character set, 1000-char limit, 5 s send timeout, localStorage remember/change, reconnection behavior) as plain SHALL requirements with no marker inside the spec that they are pending user confirmation. The pending status is stated only in `design.md:228` and gated by `tasks.md:9` (task 0.1). Acceptable because of the gate, but a reader of the spec alone could take them as decided. Consider a one-line note, or ensure task 0.1 is completed before any implementation or archive.
- **N2 (traceability)** `design.md:14`, `:70-71` — "Accepted (user decision)" is defined as "already recorded in `docs/architecture.md` or stated by the user for this change", but `docs/architecture.md` still lists Socket.IO and SQLite as "preliminary suggestions" under Open decisions. The maker disclosed this (`implementation.md:33`) and the handoff says the user decided; D2 carries a date, D3 (SQLite, local single process) carries no date/source. Recommend adding the decision date/source in D3 or having task 0.1 record these decisions in the user's words too.
- **N3 (spec precision / testability)** `specs/chat-room/spec.md:10`, `:58` vs `design.md:232` — "characters" is undefined in the spec; Q2 says Unicode code points, while JS `string.length`, zod `.max()`, and HTML `maxlength` count UTF-16 code units. Emoji or astral characters near the 1000/32 limit would behave differently between client, server, and tests. Define the unit in the spec (or in Q1/Q2) before task 2.1.
- **N4 (requirement clauses without scenarios)** — Clauses with no scenario: nickname "SHALL be able to change it" (`chat-room/spec.md:10`; covered only by task 5.1 text); "line breaks inside the text are preserved" (`:58`; no scenario or explicit task test); ">100 missed → show latest 100" (`:118`; covered by task 4.1 test but no spec scenario); `agent_timeout` (`agent-loop/spec.md:51`; tested in task 1.4 but no scenario); "refuse to run when the working directory is not the project root" (`agent-loop/spec.md:10`; no exit code, no scenario, and not in the task 1.4 test list, so not verifiable as written).
- **N5 (task coverage)** `chat-room/spec.md:87-89` ("Messages appear in server order on every client") has no explicit test in tasks 4.1/5.2; only `merge-messages` unit tests for ordering (`tasks.md:34`) indirectly cover it. Name it in 4.1 or 5.2.
- **N6 (task wording)** `tasks.md:12` — task 1.2 requires `npm run lint`, `typecheck`, `test:unit`, `test:e2e` to pass but does not say it adds those npm scripts (P14); task 1.3 adds only `check`. Minor ordering ambiguity for the maker.
- **N7 (Q7 wording precision; compatibility concern confirmed)** `design.md:209`, `:236` — Independently confirmed plausible (npm view output below): `typescript-eslint`/`@typescript-eslint/parser` 8.70.1 (pulled by `eslint-config-next` 16.3.6 as `^8.46.0`) declare `typescript >=4.8.4 <6.1.0`, so TS 7.0.2 is out of range; `eslint-plugin-react` 7.37.5 (`^9.7` max), `eslint-plugin-import` 2.32.0 and `eslint-plugin-jsx-a11y` 6.10.2 (`^9` max) exclude ESLint 10.11.0; `typescript@7.0.2` exports only `./lib/version.cjs` plus `./unstable/*`, supporting the "no classic compiler API" claim. Precision: `eslint-config-next`'s own peers (`eslint >=9.0.0`, `typescript >=3.3.1`) are satisfied; the conflicts are in its transitive dependencies' peers. Q7 says "so `eslint-config-next` peers are satisfied" — reword to "its dependencies' peers". The recommendation TS 6.0.3 / ESLint 9.39.5 is consistent with those ranges (both versions exist).
- **N8 (over-engineering, flag only)** `specs/agent-loop/spec.md:51`, `design.md:156` — Eight distinct stop reasons, git-diff fingerprinting for `no_progress`, `out_of_scope_changes` detection, and a 1–10 cap are heavier than a small educational chat strictly needs. Most are cheap safety for an automated fixer and are testable with fakes (task 1.4), so this is a note, not a request. Similarly `test:e2e` runs `next build` on every `npm run check` (`design.md:120`), making each loop iteration slower; this is accepted by design (fast-fail order mitigates it).
- **N9 (security, low)** `design.md:47-49`, `:51` — Server-side zod validation, text-only rendering with `react/no-danger` (`:103`), XSS scenario (`chat-room/spec.md:49-51`), no secrets, and env values excluded from logs are covered. Not addressed: Socket.IO does not restrict WebSocket connections by `Origin` without `allowRequest`/`cors` config, so any web page open in the user's browser could post to `127.0.0.1:3000`. Low impact for a local, unauthenticated demo; consider noting it as an accepted risk. Socket.IO's default `maxHttpBufferSize` (1 MB) bounds oversized payloads before validation.
- **N10 (observation outside this change)** `design.md:8` says Node 24.21.0 is not installed on this machine; I confirmed nvm has only v24.13.1 and `node` on PATH is v22.22.1. The pre-existing `docs/testing.md` states a Chromium check passed "using Node 24.21.0" on this machine. Not a defect of this change; the discrepancy should be resolved when task 1.6 updates `docs/testing.md`.

Scope creep: none found beyond the agreed items. Connection status/reconnection, remembered nickname, and send-failure feedback are product details presented as proposals (Q1, Q5) rather than decisions; non-goals explicitly exclude presence, typing, rooms, auth, moderation, and scaling.

### Independent checks

Run from `submissions/kostyasabada/` unless noted; `node` on PATH v22.22.1 (npm 9.2.0), OpenSpec via the local pinned dev dependency 1.13.2.

```
$ (repo root) grep -E '^[0-9a-f]{64}' submissions/kostyasabada/docs/evidence/add-realtime-chat-room-spec/snapshot.txt | sha256sum -c -
... checks.txt: OK
... implementation.md: OK
... design.md: OK
... .openspec.yaml: OK
... proposal.md: OK
... specs/agent-loop/spec.md: OK
... specs/chat-room/spec.md: OK
... specs/session-context-hook/spec.md: OK
... tasks.md: OK
exit=0

$ npm run --silent openspec -- validate add-realtime-chat-room --strict
Change 'add-realtime-chat-room' is valid
exit=0

$ npm run --silent openspec -- status --change add-realtime-chat-room --json
... proposal/specs/design/tasks "status": "done"; "isPlanningComplete": true; "isComplete": true
exit=0

$ npm run --silent openspec -- validate --all --strict
✓ change/add-realtime-chat-room
Totals: 1 passed, 0 failed (1 items)
exit=0

$ (repo root) git status --short
?? submissions/kostyasabada/docs/evidence/add-realtime-chat-room-spec/
?? submissions/kostyasabada/openspec/changes/add-realtime-chat-room/
(untracked files: exactly the 9 snapshot files plus snapshot.txt; nothing outside the submission)

$ (repo root) git diff --check        -> no output, exit=0
$ git diff --no-index --check /dev/null <each new file>  -> no whitespace errors reported
$ git diff --quiet cde39dd -- package.json package-lock.json  -> exit=0 (unchanged)
$ ls src scripts .claude/settings.json -> all "No such file or directory"; .claude/ contains only skills/

$ command -v codex   -> not found
$ claude --version   -> 2.1.198 (Claude Code)
$ claude --help | grep ...  -> --allowedTools, --max-budget-usd, --no-session-persistence,
  --output-format, -p/--print, --permission-mode (choices include "acceptEdits") all present
  (confirms design.md:153 claim)
$ ~/.nvm/versions/node/v24.13.1/bin/node -e "require('node:sqlite')"
(node:42734) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(confirms design.md:72 claim)
```

Toolchain compatibility (no installation):

```
$ npm view eslint-config-next@16.3.6 dependencies peerDependencies
dependencies = { globals: '16.4.0', 'typescript-eslint': '^8.46.0', 'eslint-plugin-react': '^7.37.0',
  'eslint-plugin-import': '^2.32.0', 'eslint-plugin-jsx-a11y': '^6.10.0', '@next/eslint-plugin-next': '16.3.6',
  'eslint-plugin-react-hooks': '^7.0.0', 'eslint-import-resolver-node': '^0.3.6',
  'eslint-import-resolver-typescript': '^3.5.2' }
peerDependencies = { eslint: '>=9.0.0', typescript: '>=3.3.1' }
$ npm view typescript-eslint@8.70.1 peerDependencies
{ eslint: '^8.57.0 || ^9.0.0 || ^10.0.0', typescript: '>=4.8.4 <6.1.0' }
$ npm view @typescript-eslint/parser@8.70.1 peerDependencies
{ eslint: '^8.57.0 || ^9.0.0 || ^10.0.0', typescript: '>=4.8.4 <6.1.0' }
$ npm view typescript-eslint version     -> 8.70.1 (latest)
$ npm view eslint-plugin-react peerDependencies version
peerDependencies = { eslint: '^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7' }  version = '7.37.5'
$ npm view eslint-plugin-react-hooks peerDependencies version
peerDependencies = { eslint: '... || ^9.0.0 || ^10.0.0' }  version = '7.1.1'
$ npm view eslint-plugin-import peerDependencies version
peerDependencies = { eslint: '^2 || ... || ^8 || ^9' }  version = '2.32.0'
$ npm view eslint-plugin-jsx-a11y peerDependencies version
peerDependencies = { eslint: '^3 || ... || ^8 || ^9' }  version = '6.10.2'
$ npm view @next/eslint-plugin-next@16.3.6 peerDependencies dependencies
{ 'fast-glob': '3.3.1', '@eslint-community/eslint-utils': '4.9.1' }   (no peers)
$ npm view typescript@7.0.2 main exports bin
exports = { '.': './lib/version.cjs', './unstable/...': ... }  bin = { tsc: 'bin/tsc' }
$ npm view next@16.3.6 peerDependencies -> react/react-dom '^18.2.0 || ... || ^19.0.0', '@playwright/test': '^1.51.1', ...
$ npm view next dist-tags -> latest: '16.3.6'
$ npm view typescript@6.0.3 version -> 6.0.3 ; eslint@9.39.5 version -> 9.39.5
$ npm view better-sqlite3@13.0.3 engines -> { node: '>=22' }
$ npm view socket.io version -> 4.8.4 ; tsx version -> 4.23.15 ; zod version -> 4.6.5 ; react version -> 19.3.0
all exit=0
```

Conclusion: the Q7 concern is plausible and correctly left as an open question requiring a user decision; version numbers in P1, P5, P6, P9, P11, P12 match the npm registry on 2026-09-26.

### Limitations

- Planning artifacts only; no application behavior was or could be tested. OpenSpec validation checks structure, not correctness of requirements.
- Compatibility conclusions are from published peer ranges, not from an install, `npm ls`, lint, or `next build` run (installation was out of scope).
- Codex is not installed, so Codex flags and Codex hook parity could not be verified by me either; I only confirmed they are left open.
- Claude Code SessionStart semantics (stdout added to context) were taken from the design; not exercised, since no hook exists yet.
- The user's decisions were checked against `docs/architecture.md` and the coordinator handoff; I had no access to the user's own words for the Socket.IO/SQLite/local-deployment decisions (see N2).
- Checks ran on system Node v22.22.1, not the project's Node 24.

### Verdict

**accepted** — all acceptance criteria and `openspec/config.yaml` rules are met; findings N1–N10 are non-blocking and may be addressed by the maker or in task 0.1 at the coordinator's discretion.

## Round 2

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker (same checker as round 1). Model: Claude Opus 5.5.
- Date: 2026-09-26.
- Reviewed snapshot: `docs/evidence/add-realtime-chat-room-spec/snapshot.txt` revision "round 2" (created 2026-09-26T07:10:21Z, base `cde39dd`). It lists 13 maker deliverables: the change directory, the evidence files, `docs/architecture.md`, `docs/testing.md`, `docs/evidence/README.md`, and `openspec/config.yaml`. All 13 hashes verified OK. The listed reference hash of `review.md` (`064ef783…`) matched the round-1 file before this section was appended, so the maker did not edit the review.
- Scope read: the maker's "Round 2" sections in `implementation.md` and `checks.txt`, the full change directory, `git diff cde39dd` for the four tracked docs, and `docs/evidence/setup-dev-dependencies/node24-runtime.txt` and `browser-smoke-approved.txt` (to check the Node claim).
- User decision under review (relayed by the coordinator): "так, приймаю всі рекомендації, ставимо claude -p" (2026-09-26). I had only the coordinator's relay; I did not see the user's message or the exact list of recommendations presented to the user.

### Resolution of round-1 findings

| Finding | Status | Evidence |
|---|---|---|
| N1 pending values in spec | Resolved | The values are now user decisions: `design.md:243-250` (Q1–Q6 resolved 2026-09-26). The spec needs no pending marker. |
| N2 decision source/date | Resolved | `design.md:47`, `:75-76` carry dates. `docs/architecture.md` now records Socket.IO, SQLite, and local single process as user decisions and drops "preliminary suggestions". `docs/evidence/README.md:55-61` gives the source. |
| N3 character unit | Resolved, with a caveat (N15) | New requirement `chat-room/spec.md:9-18`, `design.md:69`, tests in task 2.1 (`tasks.md:20`). |
| N4 clauses without scenarios | Resolved | Scenarios: nickname change `chat-room/spec.md:52-59`, line breaks `:73-75`, more than 100 missed `:162-164`, timeout `agent-loop/spec.md:65-67`. The project-root clause was redefined with a scenario (`agent-loop/spec.md:10`, `:24-26`) and is tested in task 1.4. |
| N5 same-order test | Resolved | `tasks.md:28` (4.1) and `:34` (5.2). |
| N6 scripts in task 1.2 | Resolved | `tasks.md:12-13`. |
| N7 Q7 wording | Resolved | `design.md:251`. |
| N8 loop weight | Resolved (simplified), but the simplification introduced blocking finding B1 | `agent-loop/spec.md:58-59`, `design.md:150`, `:168`. |
| N9 Origin | Resolved in principle, with weaknesses (N12) | `chat-room/spec.md:170-179`, `design.md:52`, tasks 4.1, 4.2, 5.2. |
| N10 Node 24.21.0 wording | Resolved and verified | `/tmp/node-v24.21.0-linux-x64/bin/node --version` prints `v24.21.0`. `node24-runtime.txt` records the official archive and checksum extracted to that path. `browser-smoke-approved.txt:1` says `Node runtime: v24.21.0`. `docs/testing.md` and `design.md:8` now describe this accurately. |

### User decisions and the mandatory checker

- Recorded with date and source: toolchain TypeScript 6.0.3 / ESLint 9.39.5 (`design.md:41`, `proposal.md:50`, `docs/architecture.md`; `package.json` and lock file unchanged, and task 1.1 performs the switch with version and `npm ls` checks); Q1–Q6 defaults; UTF-16 counting; same-origin restriction; loop simplification; `claude -p` default fixer (`agent-loop/spec.md:29`, `:33`; `design.md:149`; `openspec/config.yaml:20`). The quotation in `design.md:11` and `docs/evidence/README.md:61` matches the relay.
- P1–P18 and Q11 remain Proposals / Open, and task 0.1 gates them (`tasks.md:9`). Correct.
- The checker is mandatory in `tasks.md:3` ("a separate checker (a Claude Code subagent)"), `design.md:148` ("required checker"), and `docs/architecture.md` ("required checker"). "Green loop ≠ acceptance" appears in `agent-loop/spec.md:84-89`, `design.md:148`, and `tasks.md:20`. Codex review is optional in `tasks.md:3`, `design.md:149`, `docs/architecture.md`, and `docs/evidence/README.md:59`. One wording gap remains (N11).
- No code and nothing outside the submission: no `src/`, `scripts/`, or `.claude/settings.json`; `package.json` and `package-lock.json` unchanged since `cde39dd`.

### New findings

Blocking:

- **B1 (correctness, regression)** `design.md:168` — The no-progress fingerprint is "SHA-256 of `git status --porcelain` plus `git diff HEAD --binary`". Neither captures content changes to untracked files: porcelain prints only `?? path`, and `git diff HEAD` ignores untracked files. Round 1 included hashes of untracked files; round 2 dropped them. This breaks the normative rule in `agent-loop/spec.md:59` and `:69-71` ("working tree content is identical"). Concrete failure: in task 2.1, `src/lib/chat/schema.ts` is a new, untracked file. The first fixer run creates it, which counts as progress. If a second fixer run is needed and it edits `schema.ts` only, the fingerprint is unchanged, so the loop stops falsely with `no_progress` (exit 3) during the mandated real loop run. I reproduced this in a scratch repository: an untracked file edited from `v1` to `v2` gave the identical fingerprint `d7ffa919…` both times. Fix: include content hashes of untracked non-ignored files (for example, `git ls-files -o --exclude-standard -z | xargs -0 sha256sum`), and add a task 1.4 test where the fixer edits only an untracked file and the loop does not report `no_progress`.

Non-blocking:

- **N11 (checker wording)** `openspec/config.yaml:20` — This line was edited this round and still says "default checker a separate Claude Code subagent". The user stressed that the Claude subagent checker is mandatory, and `design.md` and `docs/architecture.md` say "required". "Default" suggests the checker could be swapped (for example, for Codex). Recommend "required checker a separate Claude Code subagent …; an optional Codex/ChatGPT review is extra evidence only". The old entry at `docs/evidence/README.md:52` says "default checker" too, but it is historical and superseded by `:59`.
- **N12 (security, Origin design)** `design.md:52`, `chat-room/spec.md:171`:
  - DNS rebinding is not stopped. A page on `http://evil.example:3000` whose DNS later resolves to `127.0.0.1` sends `Origin` host `evil.example:3000` and `Host: evil.example:3000`. They match, so the connection is accepted. The spec's "other web pages … cannot read or post messages" overclaims this. An allowlist of loopback hosts (`localhost`, `127.0.0.1`, `[::1]`, plus the configured `HOST`, with port) compared to the `Origin` host fixes it. Alternatively, record DNS rebinding as an accepted risk and soften the spec wording.
  - `Origin: null` (sandboxed iframes, `file:`) or any unparsable value makes `new URL(origin)` throw. The design must say such requests are rejected, not crash or pass. Add a test.
  - Accepting a missing `Origin` is sound for browsers: WebSocket handshakes and cross-origin XHR/fetch always send `Origin`. The scheme is ignored, which is acceptable locally.
- **N13 (labelling precision)** `design.md:52`, `:113`, `:150` — Implementation specifics are labelled "Accepted (user decision)": the Host-comparison and missing-`Origin` rule, E2E against a dev-mode server for `check:loop`, exactly four stop reasons, and removal of out-of-scope detection. The relayed decision covered "same-origin restriction" and "simplify the loop (fewer stop reasons, no next build per iteration)". If the coordinator's presented recommendations did not contain these specifics, split each into an accepted principle plus a Proposal. I cannot verify what was presented.
- **N14 (evidence accuracy)** `docs/evidence/README.md:59` — "accepted all recommendations … Specifically: Socket.IO …, SQLite …, local single-process deployment" folds earlier decisions into this message. The coordinator's list of recommendations accepted in this message does not include them. Minor attribution blur.
- **N15 (spec/design conflict: maxlength vs trimming)** `chat-room/spec.md:10`, `:82`, `:92-94`, `design.md:69`:
  - HTML `maxlength` limits the raw, untrimmed value. A message with surrounding spaces whose trimmed length is at most 1000 but whose raw length is over 1000 would be blocked, even though the spec says limits apply "after trimming".
  - With `maxlength=1000`, the "Oversized message is rejected in the browser … a message states the 1000-character limit" scenario cannot happen by typing or pasting, because the input truncates silently.
  - Decide: either no `maxlength` on the composer (validation message only), or state that the browser caps raw input and adjust the scenario.
- **N16 (clauses without scenarios or tests)** `agent-loop/spec.md:59` — "When interrupted, it MUST terminate its child processes" has no scenario, and task 1.4 no longer lists an interrupt test (round 1 had one). `chat-room/spec.md:124` — "SHALL scroll to a newly arrived message when the person is already viewing the newest message" has no scenario and no test (only the history-load scroll is covered at `:129` and in task 5.4).

Consistency: proposal, specs, design, tasks, `docs/architecture.md`, `docs/testing.md`, `openspec/config.yaml`, and `docs/evidence/README.md` agree on the `claude -p` default, `check:loop` plus `npm run check` as final gate, stop reasons and exit codes (spec, design, and task 1.4 match: 0/1/2/3/64), the log fields (`check_cmd`, `full_check_cmd` in the design log and in task 2.1), and TypeScript/ESLint versions. Exceptions are N11 and N14. No scope creep: the same-origin restriction is a security hardening the user accepted.

### Independent checks (round 2)

Run with `PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH` (`node --version` v24.21.0), OpenSpec via the local pinned 1.13.2.

```
$ (repo root) grep -E '^[0-9a-f]{64}' .../snapshot.txt | sha256sum -c -
13 maker deliverables: OK; reference review.md (pre-round-2 content): OK
exit=0

$ npm run --silent openspec -- validate add-realtime-chat-room --strict
Change 'add-realtime-chat-room' is valid
exit=0

$ npm run --silent openspec -- status --change add-realtime-chat-room --json
isPlanningComplete=True; artifacts ['done','done','done','done']
exit=0

$ npm run --silent openspec -- validate --all --strict
✓ change/add-realtime-chat-room
Totals: 1 passed, 0 failed (1 items)
exit=0

$ (repo root) git status --short
 M submissions/kostyasabada/docs/architecture.md
 M submissions/kostyasabada/docs/evidence/README.md
 M submissions/kostyasabada/docs/testing.md
 M submissions/kostyasabada/openspec/config.yaml
?? submissions/kostyasabada/docs/evidence/add-realtime-chat-room-spec/
?? submissions/kostyasabada/openspec/changes/add-realtime-chat-room/
(all inside the submission; all modified files are in the snapshot)

$ (repo root) git diff --check                              -> exit=0
$ git diff --no-index --check /dev/null <each new file>     -> no whitespace errors
$ git diff --quiet cde39dd -- package.json package-lock.json -> exit=0 (unchanged)
$ ls src scripts .claude/settings.json                       -> none exist

$ /tmp/node-v24.21.0-linux-x64/bin/node --version -> v24.21.0 (maker's /tmp claim confirmed)

B1 reproduction (scratch git repo in the session scratchpad):
$ echo v1 > new.ts; { git status --porcelain; git diff HEAD --binary; } | sha256sum
d7ffa9190f4a8ed6d7bd7818ff4ea230e921a651fa2ef44003d66efb99386fe0  -
$ echo v2 > new.ts; { git status --porcelain; git diff HEAD --binary; } | sha256sum
d7ffa9190f4a8ed6d7bd7818ff4ea230e921a651fa2ef44003d66efb99386fe0  -
```

### Limitations (round 2)

- I saw only the coordinator's relay of the user's decision, not the user's message or the list of recommendations as presented, so N13 is conditional.
- The Origin analysis is from browser and Socket.IO/engine.io behavior as I understand it. It was not exercised; no server exists yet.
- As in round 1: planning artifacts only; no install, lint, build, or E2E run; Codex not installed.

### Verdict (round 2)

**changes requested** — B1 must be fixed: the no-progress fingerprint must cover untracked file content, with a matching task 1.4 test. N11–N16 are non-blocking. N11 (the "required" checker wording in `openspec/config.yaml`) and N12 (DNS rebinding and `Origin: null`) are recommended in the same pass. After the fix, I will verify the updated snapshot and rerun the OpenSpec validation.

## Round 3

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker (same checker as rounds 1–2). Model: Claude Opus 5.5.
- Date: 2026-09-26.
- Reviewed snapshot: `snapshot.txt` revision "round 3" (created 2026-09-26T07:18:07Z, base `cde39dd`). It lists 13 maker deliverables, all verified OK. The listed reference hash of `review.md` (`5f1b85fa…`) matched the round-2 file before this section was appended, so the maker did not edit the review.
- Scope read: the maker's "Round 3" in `implementation.md`, the round-3 part and addendum of `checks.txt`, the full change directory (focused on changed passages), and `git diff cde39dd` for `docs/architecture.md`, `docs/evidence/README.md`, and `openspec/config.yaml`.
- Decision context used (coordinator relay): what was presented and accepted ("приймаю всі рекомендації") was TS 6.0.3 + ESLint 9.39.5; the Q1–Q6 table; UTF-16 counting; "restrict Socket.IO Origin so a foreign site cannot write to the chat"; "simplify the loop: 3–4 stop reasons instead of 8 and remove next build from each iteration"; the missing scenarios; the doc fixes. Earlier that day the user wrote "давай сокетіо". SQLite and local single process were stated as remaining as proposed, and the user did not object. `claude -p` was the user's explicit choice. Everything else is a proposal.

### Resolution of round-2 findings

| Finding | Status | Evidence |
|---|---|---|
| B1 no-progress fingerprint | Resolved | `design.md:173` hashes porcelain with `--untracked-files=all`, `git diff HEAD --binary`, and the content of untracked non-ignored files. Rule in `agent-loop/spec.md:59`, scenario `:73-75`, test in `tasks.md:14`. Reproduced (below): editing an untracked file, editing a name with a space or a newline, and deleting an untracked file each change the fingerprint. Edge-case remark in N20. |
| N11 checker wording | Resolved | `openspec/config.yaml:20` "required checker a separate Claude Code subagent …; an optional Codex/ChatGPT review is extra evidence only". |
| N12 Origin | Partly resolved | `Origin: null` and unparsable values are now rejected with parse errors caught (`design.md:53`, `chat-room/spec.md:193-195`), and the spec wording is softened. The DNS-rebinding claim is incorrect: see B2. |
| N13 labels | Resolved | The principles are labelled as user decisions (`design.md:52`, `:113`, `:154`). The mechanisms are Proposals P19–P22 (`design.md:53`, `:72`, `:117`, `:155`). Task 0.1 asks for P1–P22 and Q11 (`tasks.md:7`). `docs/architecture.md` and `docs/evidence/README.md` say the same. This matches the coordinator's account of what was presented. |
| N14 evidence attribution | Resolved | `docs/evidence/README.md` separates the earlier "let's go with Socket.IO" message, SQLite and local deployment accepted without objection, and the later message. Minor wording note in N21. |
| N15 maxlength | Resolved | No `maxlength`; a trimmed-length counter; no truncation (`chat-room/spec.md:10`, `:92-98`; `design.md:72` P20; `tasks.md:33-34`). The new 1020-raw/1000-trimmed scenario is good. |
| N16 interrupt and auto-scroll | Resolved | `agent-loop/spec.md:59`, `:77-79` with a PID-gone test in `tasks.md:14`. `chat-room/spec.md:135-141` with tests in `tasks.md:36`. |

### New findings

Blocking:

- **B2 (security claim incorrect; its test would pass falsely)** `design.md:53-54`, `chat-room/spec.md:183`, `:189-191`, `tasks.md:28`, `design.md:147`, `design.md:238`:
  - The design says "the allowlist rejects rebinding pages for the real-time endpoint, because their `Origin` names the attacker's host". It also accepts every request that has no `Origin`. Under the Fetch standard, browsers send `Origin` on a same-origin request only for non-GET/HEAD methods or WebSocket. A same-origin GET (response tainting "basic") carries no `Origin`.
  - After DNS rebinding, the attacker page at `http://evil.example:3000` is same-origin with the chat server. Its `fetch('/socket.io/?EIO=4&transport=polling')` handshake GET arrives with no `Origin`, passes `allowRequest`, and the page can read the `sid`.
  - Engine.io calls `allowRequest` only for the handshake. Requests that carry an existing `sid` (polling POSTs with the CONNECT and `message:send` packets, the upgrade) are not re-checked. So the page can read the history and post messages. That is the exact outcome the accepted principle ("a foreign site cannot write to the chat") and the spec wording ("pages from other origins … cannot connect") rule out.
  - The rebinding scenario and test (an explicit `Origin: http://evil.example:3000` header) do not model a real rebinding browser and would pass while the hole remains.
  - Fix options, all small:
    1. Also validate the `Host` header against the same host allowlist (`localhost`, `127.0.0.1`, `[::1]`, the configured `HOST`, with port) in `allowRequest`, and ideally for all HTTP requests. This is the standard rebinding defense. Add a scenario and test "handshake with no `Origin` and `Host: evil.example:<PORT>` is refused".
    2. Or drop the rebinding claim and record DNS rebinding as an accepted residual risk in D2 and the spec wording.
  - Basis: the Fetch standard's origin-header rules and my knowledge of engine.io's `verify()`/`allowRequest` flow. Not executed: no server exists, and I did not download engine.io sources. The maker's own open item ("whether `allowRequest` receives `Origin` for every transport") is related.

Non-blocking:

- **N17 (spec/design mismatch, wildcard host)** `chat-room/spec.md:183` allows "the configured host on the configured port" without the wildcard exception in `design.md:53` (`0.0.0.0`, `::` excluded). Align the spec.
- **N18 (allowlist normalization)** `design.md:53` builds entries as the string `http://<host>:<PORT>` and compares them with `new URL(origin).origin`. The serialized origin drops a default port (`http://localhost:80` becomes `http://localhost`) and lowercases the host, so the raw strings can mismatch when `PORT=80` or `HOST` has uppercase letters. Build the entries through `new URL(...).origin` as well.
- **N19 (spec depends on a pending proposal)** `chat-room/spec.md:10` normatively forbids truncation, which is P20, still pending in task 0.1. This is acceptable because task 0.1 says to update the specs if an answer changes the approach. Noted so that task 0.1's checker checks it.
- **N20 (fingerprint robustness)** `design.md:173`:
  - `git ls-files --others --exclude-standard -z | xargs -0 sha256sum` fails on a broken or unreadable untracked symlink or file. My reproduction: exit 123 with pipefail. Under `set -euo pipefail` that aborts the loop with an undocumented exit code. Recommend tolerating unreadable entries (for example, hash the `readlink` target for symlinks, or `|| true` with the error text included in the hash) and `xargs -r`.
  - Names with spaces or newlines, and deleted untracked files, are handled correctly (reproduced).
  - The exclusion of `loop-run.log` and `.agent-loop/` should be implemented as git pathspec excludes in all three commands, because `loop-run.log` is tracked on a rerun after it is committed.
- **N21 (wording)** `docs/architecture.md` says "The user selected SQLite" / "selected local deployment", and `design.md:75-76` "Accepted (user decision, 2026-09-26)". The coordinator's account is that these were accepted as proposed without objection. `docs/evidence/README.md` states this precisely; "accepted" would be more exact than "selected" in `architecture.md`. Cosmetic.

No regressions found in the loop spec, stop reasons and exit codes (0/1/2/3, 64, and 130 on interrupt, consistent across spec, design, and task 1.4), the log format, the mandatory checker rule (`tasks.md:3`, `design.md:148`, `config.yaml:20`, `architecture.md`), or the `claude -p` default. `proposal.md`, `specs/session-context-hook/spec.md`, and `docs/testing.md` are unchanged this round and still consistent.

### Independent checks (round 3)

Run with `PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH` (node v24.21.0), local pinned OpenSpec 1.13.2.

```
$ (repo root) grep -E '^[0-9a-f]{64}' .../snapshot.txt | sha256sum -c -
13 maker deliverables: OK; reference review.md (pre-round-3 content): OK

$ npm run --silent openspec -- validate add-realtime-chat-room --strict
Change 'add-realtime-chat-room' is valid
exit=0
$ npm run --silent openspec -- status --change add-realtime-chat-room --json
isPlanningComplete=True; artifacts ['done','done','done','done']; exit=0
$ npm run --silent openspec -- validate --all --strict
✓ change/add-realtime-chat-room — Totals: 1 passed, 0 failed; exit=0

$ (repo root) git status --short
 M submissions/kostyasabada/docs/architecture.md
 M submissions/kostyasabada/docs/evidence/README.md
 M submissions/kostyasabada/docs/testing.md
 M submissions/kostyasabada/openspec/config.yaml
?? submissions/kostyasabada/docs/evidence/add-realtime-chat-room-spec/
?? submissions/kostyasabada/openspec/changes/add-realtime-chat-room/
$ git diff --check -> exit=0; new files: no whitespace errors
$ git diff --quiet cde39dd -- package.json package-lock.json -> exit=0 (unchanged)
$ ls src scripts .claude/settings.json -> none exist

Fingerprint reproduction (scratch repo; fp = sha256 of porcelain --untracked-files=all + diff HEAD --binary + sorted sha256sum of untracked files; first 12 hex shown):
empty: abcfa6a9d4df
v1 (new untracked file): 81f98a8b3c79
v2 (edit it): 732d87c33990
"d/a b.ts" added: f7705a06ecc0   edited: 0dd28a5df21a
name with newline added: 2f57b0999d1b   edited: 466840e4563f
untracked file deleted: 8742efc728b0
broken untracked symlink: "sha256sum: broken: No such file or directory", pipeline exit=123
```

### Limitations (round 3)

- B2 is based on the Fetch standard and my knowledge of engine.io, not on an executed attack; there is no server yet, and I downloaded no package sources. The maker can disprove it by pointing to engine.io behavior that checks `Origin`/`Host` on post-handshake requests, or by a test that performs a no-`Origin` handshake with a foreign `Host`.
- Decision context comes from the coordinator's relay, not the user's messages.
- Planning artifacts only; no install, lint, build, or E2E run; Codex not installed.

### Verdict (round 3)

**changes requested** — B1 and N11, N13, N14, N15, N16 are resolved. B2 must be addressed: either add a `Host` allowlist check (with a no-`Origin`/foreign-`Host` test), or remove the DNS-rebinding protection claim and record rebinding as an accepted residual risk. N17–N21 are non-blocking; N17, N18, and N20 are cheap to fold into the same pass.

## Round 4

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker (same checker as rounds 1–3). Model: Claude Opus 5.5.
- Date: 2026-09-26.
- Reviewed snapshot: `snapshot.txt` revision "round 4" (created 2026-09-26T07:23:59Z, base `cde39dd`). All 13 maker deliverables verified OK. The reference hash of `review.md` matched the round-3 file before this section was appended.
- Scope read: the maker's "Round 4" in `implementation.md`, the round-4 part of `checks.txt`, the changed passages of `design.md` (D2/P19, D4, D6, D7, risks), `specs/chat-room/spec.md` (the "Local host and origin restriction" requirement), `tasks.md` (0.1, 1.4, 4.1, 4.2), `proposal.md`, and `git diff cde39dd -- docs/architecture.md`.
- Proportionality: judged as a small educational local chat. Real defects are blocking; polish is not.

### Resolution of round-3 findings

| Finding | Status | Evidence |
|---|---|---|
| B2 DNS-rebinding claim | Resolved (option 1, still Proposal P19) | `design.md:53-58`: `Host` allowlist on every request and upgrade, `Origin` check at the handshake, a correct explanation of rebinding, and residual risks. `chat-room/spec.md:182-217`: the realistic scenario (no `Origin`, foreign `Host`, both transports) and a foreign-`Host` page request. Red-first raw-HTTP tests on both transports in `tasks.md:29`, unit tests in `:28`, test design in `design.md:152`. See N22 for an implementation-ordering caveat. |
| N17 wildcard HOST | Resolved | Spec requirement text and scenario "Wildcard listen address adds no foreign hosts"; `design.md:54`; test in `tasks.md:29`. |
| N18 normalization | Resolved | `design.md:54`; spec "Host comparison is normalized"; tests for uppercase and `PORT=80` (`tasks.md:28-29`). I confirmed with Node 24.21.0: `new URL("http://LOCALHOST:3000").host` is `localhost:3000`, `localhost:80` becomes `localhost`, and `[::1]:3000` stays `[::1]:3000`. See N23 and N24 for edge cases. |
| N19 pending proposal gates the spec | Resolved | `tasks.md:7`: P19 and P20 explicitly gate the spec. |
| N20 fingerprint robustness | Resolved | `design.md:178`: pathspec excludes on all three commands; per-entry hashing (`readlink` for symlinks, SHA-256 for readable files, `unreadable:<path>` marker); `xargs -0 -r`. Tests in `tasks.md:14`. Reproduced (below): appending to a committed `loop-run.log` and writing under `.agent-loop/` leave the fingerprint unchanged; a broken symlink, retargeting it, and an unreadable file each change it without failing. |
| N21 wording | Resolved | `docs/architecture.md:15-16`: "accepted … as proposed and without objection". |

Consistency: `proposal.md:18`, `:38` now describe the host and origin restriction and match the spec. The D4 layout adds `src/server/host-policy.ts`. The risk list covers HMR (`design.md:244`). The loop spec, the stop reasons, the mandatory checker rule, and the `claude -p` default are unchanged and still consistent. `docs/architecture.md:18` still describes only the accepted Origin principle and calls the mechanism a proposal, which is correct. I found no stale "Same-origin real-time connections" wording.

### Soundness of the Host-on-every-request approach

- Next.js dev HMR: the HMR WebSocket (`/_next/webpack-hmr`) is opened by the page on its own host, so its `Host` is allowlisted. The dev E2E fixture uses `127.0.0.1:<PORT>`, which is allowlisted. No problem expected.
- Host without a port: when `PORT` is not 80, `Host: localhost` normalizes to `localhost` and is refused. That is correct, because browsers always send the non-default port. When `PORT=80`, both forms normalize to `localhost`.
- IPv6: `[::1]` is handled. For a configured unbracketed IPv6 `HOST`, see N23.
- Whether upgrade and request interception really precede engine.io: see N22.

### New findings

Blocking: none.

Non-blocking:

- **N22 (implementation ordering; the red-first tests would catch it)** `design.md:49` (P5 "attaches Socket.IO") vs `design.md:55` ("checks the `Host` header of every HTTP request and every upgrade request before passing it to … Socket.IO"). Engine.io's `attach()` does two things: it removes the server's existing `request` listeners and wraps them, so `/socket.io/` requests are handled by engine.io before any other listener; and it adds its own `upgrade` listener, which runs regardless of other upgrade listeners. With the usual `new Server(httpServer)` pattern, a `Host` check in the normal request handler never sees polling traffic. An upgrade check in a separate listener only works by destroying the socket first, which depends on listener order.
  - The design does not say how the ordering is achieved. Suggested (either or both):
    1. Also check `Host` inside `allowRequest`. Because a session id can only be obtained through the handshake, this alone closes rebinding for Socket.IO.
    2. Do not attach: route `/socket.io/` explicitly through `io.engine.handleRequest` / `io.engine.handleUpgrade` after the `Host` check.
  - Not blocking because task 4.2's red-first raw tests (a polling handshake and an upgrade with no `Origin` and a foreign `Host`) would fail against a naive implementation. Basis: my knowledge of engine.io's `attach()`; not executed.
- **N23 (IPv6 HOST value)** `design.md:54` builds entries with `new URL("http://" + host + ":" + PORT)`. For `HOST=::1` (unbracketed, the usual env form) this throws: I confirmed `new URL("http://::1:3000")` throws in Node 24.21.0. The config module should bracket IPv6 literals or reject them explicitly, and `config.test.ts` should cover it. `[::1]` itself is already allowlisted, so only the configured-host path is affected.
- **N24 (Host parsing leniency)** Normalizing an incoming `Host` with `new URL("http://" + value)` accepts `evil@localhost:3000` (host `localhost:3000`, username `evil`) and `localhost:3000/x`. I confirmed both. Browsers cannot send such `Host` values, and non-browser local clients are trusted anyway, so the impact is nil. For strictness, reject when `username`, `password`, `search`, or `hash` is set or `pathname !== "/"`.

### Independent checks (round 4)

Run with `PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH` (node v24.21.0), local pinned OpenSpec 1.13.2.

```
$ (repo root) grep -E '^[0-9a-f]{64}' .../snapshot.txt | sha256sum -c -
13 maker deliverables: OK; reference review.md (pre-round-4 content): OK

$ npm run --silent openspec -- validate add-realtime-chat-room --strict
Change 'add-realtime-chat-room' is valid
exit=0
$ npm run --silent openspec -- status --change add-realtime-chat-room --json
isPlanningComplete=True; artifacts ['done','done','done','done']; exit=0
$ npm run --silent openspec -- validate --all --strict
✓ change/add-realtime-chat-room — Totals: 1 passed, 0 failed; exit=0

$ (repo root) git status --short
 M submissions/kostyasabada/docs/architecture.md
 M submissions/kostyasabada/docs/evidence/README.md
 M submissions/kostyasabada/docs/testing.md
 M submissions/kostyasabada/openspec/config.yaml
?? submissions/kostyasabada/docs/evidence/add-realtime-chat-room-spec/
?? submissions/kostyasabada/openspec/changes/add-realtime-chat-room/
$ git diff --check -> exit=0; new files: no whitespace errors
$ git diff --quiet cde39dd -- package.json package-lock.json -> exit=0 (unchanged)
$ ls src scripts .claude/settings.json -> none exist

Fingerprint per design D7 (scratch repo with a committed docs/evidence/x/loop-run.log; pathspec
-- . ':(exclude)docs/evidence/x/loop-run.log' ':(exclude).agent-loop'; per-entry hashing):
base:                           e3b0c44298fc
committed loop-run.log appended: e3b0c44298fc  (unchanged, as intended)
file under .agent-loop/:         e3b0c44298fc  (unchanged, as intended)
broken untracked symlink:        aaf2d752b0af  (no failure)
symlink retargeted:              1c64f1c6289a
unreadable untracked file:       0e9ddb3a19f8  (no failure)

Host normalization (node -e, new URL("http://"+h)):
"LOCALHOST:3000" -> localhost:3000 ; "localhost" -> localhost ; "localhost:80" -> localhost ;
"[::1]:3000" -> [::1]:3000 ; "evil@localhost:3000" -> localhost:3000 (username=evil) ;
"localhost:3000/x" -> localhost:3000 (pathname=/x) ; new URL("http://::1:3000") throws
```

### Limitations (round 4)

- N22 rests on my knowledge of engine.io's `attach()` behavior; it was not executed (no server, no sources downloaded). Task 4.2's tests are the real verification.
- Decision context comes from the coordinator's relay.
- Planning artifacts only; no install, lint, build, or E2E run; Codex not installed.

### Verdict (round 4)

**accepted** — B2 and N17–N21 are resolved; no blocking findings remain. N22–N24 are non-blocking implementation notes for tasks 1.2, 4.1, and 4.2 (N22 is the most useful: also check `Host` in `allowRequest`, or route engine.io explicitly). They may be folded in now or handled by the implementing maker. The task's acceptance still requires the coordinator to record this final snapshot. Any later edit to these deliverables needs re-review.
