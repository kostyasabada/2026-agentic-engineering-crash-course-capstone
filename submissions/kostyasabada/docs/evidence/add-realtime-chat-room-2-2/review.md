# Task add-realtime-chat-room-2-2 — review

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker.
- Round: 1
- Date: 2026-09-27
- Node used for independent checks: v24.21.0 (`$HOME/.nvm/versions/node/v24.21.0/bin/node`, first on `PATH`; matches `.nvmrc`). `OPENSPEC_TELEMETRY=0`.
- Reviewed snapshot: `snapshot.txt` revision 1 (base commit `785bece`, uncommitted working tree, nothing staged). `sha256sum -c` from the repository root: all 9 entries OK (spec group: `tasks.md` `62b576a2…`, `spec.md` `ff5ad812…`, `design.md` `538ae592…`; code and evidence group: `schema.ts` `058aac9d…`, `schema.test.ts` `56f0a96b…`, `message.repository.test.ts` `67b25793…`, `docs/testing.md` `35d8b40f…`, `implementation.md` `b1d14a0e…`, `checks.txt` `2dd8d0da…`). This `review.md` is not part of the snapshot.
- Read: `AGENTS.md`, `docs/review-process.md`, the maker evidence (`implementation.md`, `checks.txt`, `snapshot.txt`), and the diffs against `785bece` of `tasks.md`, `specs/chat-room/spec.md`, `design.md` (Q2 and D2 ack codes), `src/lib/chat/schema.ts`, `src/lib/chat/schema.test.ts`, `src/server/chat/message.repository.test.ts`, and `docs/testing.md`; the runtime records in every earlier evidence directory (grep).
- User decisions: relayed by the coordinator in the handoff; this checker did not see the user's messages directly.

## Findings

No blocking or change-requiring findings.

- **F1 (low, observation; no change required)** `openspec/changes/add-realtime-chat-room/tasks.md:18`: the section title "Shared message schema (real task through the agent loop)" now also covers task 2.2, which is not loop-run. The task text itself says "done by a maker directly, not through the agent loop" (`tasks.md:21`), and `implementation.md` repeats it, so a reader is not misled about 2.2; the title still accurately describes why the section exists (2.1). Optional wording such as "(2.1 through the agent loop)" could be considered when the section is next edited.
- **F2 (info)** `docs/testing.md:48`: "That runtime was used for the setup and the tasks up to 2.1" is accurate for every task-level evidence directory before 3.1 (0.1, 1.1–1.6, 2.1, layered-arch, setup-dev-dependencies record `/tmp/node-v24.21.0-linux-x64` and v24.21.0). Minor exceptions exist that the sentence does not mention: the `add-realtime-chat-room-spec` round 1 ran the OpenSpec CLI on system Node v22.22.1 (its `implementation.md:60`), and the first 3.1 `checks.txt` entry printed versions with v22.22.1. Neither affects the claim that matters (which runtime the project checks used); 3.1's use of nvm 24.13.1 is recorded in its evidence as stated, and the nvm `v24.21.0` directory is dated 2026-09-27, matching the text. Accepted as is.
- **F3 (info)** Mutation "apply `isWellFormed()` before `.trim()`" survives all tests. This is an equivalent mutant, not a test gap: `trim()` only removes whitespace code units, which are never surrogates, so it cannot create or break a surrogate pair and the raw and trimmed values are equally well-formed. The spec wording ("the trimmed text MUST be well-formed") and the implementation on the trimmed value are consistent.

## Review focus results

1. Spec-first coherence: task 2.2 (`tasks.md:21`), the "Message validation" requirement (`spec.md:102`) and the scenarios `spec.md:56` (nickname, `invalid_nickname`), `spec.md:132` (lone surrogate, `invalid_text`) and the following valid-pair scenario, and `design.md:320` Q2 refinement agree. The design record gives the date, the Ukrainian quote, the translation, and the clarification that "install it yourself" referred to Node; the reason (better-sqlite3 turns lone surrogates into U+FFFD, recorded in task 3.1) matches `message.repository.test.ts`. Only the rejection itself and its code `invalid_text` (named in the recommendation the user answered) are presented as the user decision; the nickname pin is described as task work, not as a decision. `invalid_nickname` / `invalid_text` match the ack codes in `design.md:69` (D2). The snapshot splits the spec group (`tasks.md`, `spec.md`, `design.md`) from code and evidence, and `checks.txt` shows strict validation after the spec group and before any code change. OpenSpec strict validation passes.
2. Schema: `src/lib/chat/schema.ts:59` adds `.refine((value) => value.isWellFormed(), …)` after `.trim()`, so it applies to the trimmed text and reports under `text` in `sendMessageSchema` (tested). Issue sets: empty/whitespace-only gives only "required" (the empty string is well-formed; tested); short malformed gives exactly one issue; over-limit and malformed gives both (tested); 998 + emoji (1000 units) accepted, 999 + emoji (1001) gives only the limit issue. The nickname schema is unchanged (comment only at `schema.ts:19-24`) and rejects lone surrogates through `NICKNAME_PATTERN` (`schema.ts:25`), pinned under the `nickname` path. No other behavior changed: the diff is one constant, one refine, and comments; all 191 unit tests pass.
3. Tests: 18 new cases (90 to 108). The red run in `checks.txt` ran with `schema.ts` unchanged (verified by `git diff --quiet` in the same entry): 10 failed, 98 passed, exit 1, and the failing names are exactly the 10 rejection/issue/path cases. The 8 cases that passed already (4 nickname, nickname path, valid pair, pair at the limit, whitespace-only) are acknowledged in `implementation.md` as pinning existing behavior. My own mutations (below) confirm the tests discriminate.
4. `docs/testing.md`: only line 48 changed (`git diff` shows one line removed, one added); its claims match the evidence as described in F2.
5. Section title: see F1 (low).
6. Evidence honesty and proportionality: `checks.txt` entries are produced by a recorder script whose body is included; my reruns reproduce the reported results (121 targeted tests, 191 unit + 2 E2E, 30 s). `implementation.md` discloses the relayed decisions, the unverified coordinator-side nvm install, and that controller/UI coverage is deferred to 4.1 and 5.2. The change is small and proportional to the task.

## Independent checks (Node v24.21.0)

| Check | Result |
|---|---|
| `node --version` | v24.21.0 |
| `sha256sum -c` of the 9 snapshot entries (from the repository root) | all OK |
| `openspec validate add-realtime-chat-room --strict` | valid, exit 0 |
| `openspec validate --all --strict` | 1 passed, 0 failed, exit 0 |
| `npx vitest run src/lib/chat/schema.test.ts src/server/chat/message.repository.test.ts` | 2 files, 121 passed, exit 0 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run check` | exit 0 (191 unit tests, 2 E2E tests), 30 s |
| Mutation B: replace `isWellFormed()` with a regex that detects only unpaired high surrogates | 2 failed, 106 passed (the lone-low-surrogate cases) |
| Mutation C: move the `isWellFormed` refine before `.trim()` | 108 passed; equivalent mutant (F3) |
| Mutation D: `value.length > 0 && value.isWellFormed()` (empty text also reports the surrogate issue) | 2 failed, 106 passed (issue-set tests for empty/whitespace-only) |
| Restore after mutations | `schema.ts` SHA-256 `058aac9d…` before and after, identical; backup in the checker scratchpad, removed |
| Maker mutation (remove the refine) | not rerun; recorded in `checks.txt` as 10 failed, hash restored |
| Leftover processes (`server.ts`, `next (build\|start\|dev)`, `next-server`, `playwright`, `vitest`) | none |
| `git status --short` | the 7 modified files and `?? docs/evidence/add-realtime-chat-room-2-2/`; nothing staged |
| `git diff --check` | exit 0 |
| `git diff --no-index --check /dev/null <file>` for `checks.txt`, `implementation.md`, `snapshot.txt` | exit 1 each (clean; no whitespace errors) |
| `git log --oneline -1` | `785bece feat: add SQLite message repository (task 3.1)` |
| Evidence runtime grep (`node --version` outputs and runtime paths per evidence directory) | consistent with `docs/testing.md:48` (F2) |

## Limitations

- The `invalid_text` / `invalid_nickname` ack codes and the "server rejects, nothing stored or broadcast" parts of the new scenarios are only exercised at the schema level; the controller (4.1) and UI (5.2) do not exist yet.
- The user decisions were relayed by the coordinator; I did not see the user's messages.
- The nvm installation of Node 24.21.0 (and any checksum verification) was done by the coordinator and was not re-verified beyond `node --version` and the directory date.

## Verdict

accepted
