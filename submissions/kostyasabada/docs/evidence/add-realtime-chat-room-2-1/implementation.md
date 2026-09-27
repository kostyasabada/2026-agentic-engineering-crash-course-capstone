# Implementation: add-realtime-chat-room-2-1

Task: 2.1 in `openspec/changes/add-realtime-chat-room/tasks.md` (shared message schema, first real task run through the agent loop). Date: 2026-09-26. Base commit: `3034b72`. Nothing staged or committed; the task checkbox is not ticked.

## Identities

- Maker: Claude Code general-purpose subagent (maker), running as Opus 5.5 (`claude-opus-5-5`).
- Fixer: `claude -p` (Claude Code CLI 2.1.198) launched by `scripts/agent-loop.sh`; authenticated through the user's claude.ai subscription (`claude auth status`: `"authMethod": "claude.ai"`). The model the fixer used is not shown in its text output.
- Runtime: Node v24.21.0 (`/tmp/node-v24.21.0-linux-x64/bin`), npm 11.19.0, zod 4.6.5.

## Changes

| File | Author | Content |
|---|---|---|
| `src/lib/chat/schema.test.ts` | maker (red-first; post-loop tests in rounds 1–4) | 90 Vitest tests in revision 4 (70 in revision 1, see below; additions under Rounds 2–4) |
| `src/lib/chat/schema.ts` | fixer (iteration 1); post-loop maker edits to `NICKNAME_PATTERN` and its comment only (round 1: `+` → `*`; round 2: combining marks; round 3: marks only after a letter; unchanged in round 4) | `NICKNAME_MAX_LENGTH`, `MESSAGE_MAX_LENGTH`, `nicknameSchema`, `messageTextSchema`, `sendMessageSchema`, types `SendMessageInput`, `ChatMessage` |
| `docs/evidence/add-realtime-chat-room-2-1/loop-brief.md` | maker | brief given to the fixer |
| `docs/evidence/add-realtime-chat-room-2-1/loop-run.log` | written by `scripts/agent-loop.sh`, unedited | run record |
| `docs/evidence/add-realtime-chat-room-2-1/checks.txt` | maker, via helper `rec21.sh` | every command with output and exit code |
| `docs/evidence/add-realtime-chat-room-2-1/implementation.md`, `snapshot.txt` | maker | this report and the snapshot |
| `openspec/changes/add-realtime-chat-room/specs/chat-room/spec.md`, `design.md` (Q1) | maker (rounds 2–4, user decisions of 2026-09-27) | nickname character rule; see Rounds 2–4 |

Exported API (decided in the tests, consistent with D2/D4): the controller (task on `chat.controller.ts`) can validate `message:send` with `sendMessageSchema` and map `issues[0].path[0]` (`'nickname'` / `'text'`) to `invalid_nickname` / `invalid_text`; the UI can use `nicknameSchema`, `messageTextSchema`, the limit constants (for the `n/1000` counter), and the English issue messages; `ChatMessage` is the D2 payload type.

## Tests (`src/lib/chat/schema.test.ts`, 70 tests in revision 1; rounds 2, 3, 4 add 9, 7, 4, see below)

- Limits: constants are 32 and 1000; the test character U+20000 has `length` 2.
- Nickname: valid value unchanged; trimming (`'  Alice_1  '` → `'Alice_1'`, mixed whitespace); allowed characters (inner space, `-`, `.`, `_`, Cyrillic, CJK, `ë` + digit, Arabic-Indic digit `٣`, `.-_`); empty and whitespace-only (4 cases) rejected; an empty nickname yields exactly one issue that does not mention the character rule (post-loop); exact limits 1 and 32 accepted, 33 rejected with a message containing `32`; 32/33 characters surrounded by spaces (length after trimming); 16 × U+20000 (32 units) accepted, 17 × U+20000 (34 units) rejected with `32` in the message; disallowed characters (`<script>`, `bob@home`, `/`, emoji, inner tab, inner line break, apostrophe) rejected; the character message contains `letters` and `digits`; non-strings rejected.
- Message text: valid value unchanged; `'   hi there   '` → `'hi there'`; empty and whitespace-only (5 cases incl. tabs and CR/LF) rejected; exact limits 1 and 1000 accepted, 1001 rejected with `1000` in the message; 1000 characters + 10 spaces on each side (1020 raw) accepted as the 1000-character trimmed text; 1001 trimmed with padding rejected; inner `\n` and `\r\n` preserved; surrounding line breaks trimmed, inner line breaks and spaces kept; markup kept verbatim; a 1000-unit message with an astral character accepted; 500 × U+20000 (1000 units) accepted; a 1001-unit message with an astral character rejected; 501 × U+20000 (1002 units, 501 code points) rejected; non-strings rejected.
- `sendMessageSchema`: valid payload returns trimmed values; extra fields (`id`, `createdAt`, `clientId`) stripped (exact keys checked); invalid nickname → issue paths `['nickname']`; invalid text → `['text']`; missing fields and non-object payloads rejected.
- Types (`expectTypeOf`, checked by `tsc`): `SendMessageInput` equals `{ nickname: string; text: string }`; `ChatMessage` equals `{ id: number; nickname: string; text: string; createdAt: string }`.

Maker interpretations of spec wording (stated in the brief and tested): "spaces" means U+0020 only (inner tabs and line breaks are rejected); "Unicode digits" means `\p{Nd}` (decimal digits). Neither changes a user decision; the checker should confirm they are acceptable readings.

## Acceptance criteria mapping

| Criterion (task 2.1) | Evidence |
|---|---|
| Red-first tests for all listed rule categories | tests above; `checks.txt` entries 18:50:56Z (first vitest attempt; the recorded `[exit 0]` is the pipe's `tail`, output shows the failed suite) and 18:51:05Z (with `pipefail`: `npx vitest run src/lib/chat/schema.test.ts` exit 1, `Cannot find module './schema'`; `npm run lint` exit 0; `npm run typecheck` exit 2) |
| Failing `npm run check:loop` recorded | `checks.txt` 18:51:21Z entry: exit 2 at the type check (3 s); the loop's own iteration 0 repeats it (exit 2) |
| `loop-brief.md` written | `docs/evidence/add-realtime-chat-room-2-1/loop-brief.md` |
| Loop launched as specified, default agent `claude` | `checks.txt` entry `scripts/agent-loop.sh --task-id add-realtime-chat-room-2-1 --brief docs/evidence/add-realtime-chat-room-2-1/loop-brief.md` (no other flags) |
| Log header shows `check_cmd="npm run check:loop"` and `full_check_cmd="npm run check"` | first line of `loop-run.log` |
| Footer shows the actual stop reason | `=== run end=2026-09-26T18:56:13Z stop_reason=checks_passed fixer_runs=1 exit=0` |
| `loop-run.log` unedited | not touched by the maker; `git diff --no-index --check /dev/null` clean (see checks) |
| `npm run check` exits 0 on the final snapshot | `checks.txt` post-loop entry: exit 0 (140 unit tests, 2 E2E) |
| Checker review and rerun | revision 1 accepted (`review.md` round 1), revision 3 accepted (`review.md` round 2); revision 4 pending |

## Loop summary

- One run, launched once: start 2026-09-26T18:51:44Z, end 18:56:13Z; wall time 269 s (measured by the maker's command); loop exit code 0; stop reason `checks_passed`.
- Iteration 0: `npm run check:loop` exit 2, fail, 3 s (type check: missing module).
- Iteration 1: fixer exit 0, 220 s; `check:loop` exit 0, 22 s; `full_check` (`npm run check`) exit 0, 24 s.
- Fixer runs used: 1 of 5. Default limits unchanged (5 iterations, 900 s per run, `--max-budget-usd 2`).
- `changed_files` in the log lists all untracked files (the script's informational list includes every untracked non-ignored file, so the pre-existing `schema.test.ts`, `loop-brief.md`, and `checks.txt` appear). Corrected in round 2 (checker finding 3): the round-1 text cited modification times, but the maker's post-loop test edit later changed the mtime of `schema.test.ts` (now after the run), and the earlier mtime was not recorded in `checks.txt`, so that argument cannot be reproduced. The evidence that the fixer did not edit the tests is indirect: (1) the iteration-0 type errors in `loop-run.log` cite lines 251 and 257 of the pre-loop test file, which in revision 1 were at lines 258 and 264, exactly the 7 lines of the post-loop test block; (2) the iteration-1 unit run (`.agent-loop/.../iter-1-check.txt`) reports 139 tests (69 schema + 70 others), and the maker's post-loop red run reports 69 passed + 1 new failing; (3) the fixer's own summary states that it touched only `schema.ts`; `loop-brief.md` has no later edit by anyone and `checks.txt` is written only by the maker's helper. No pre-run hash of the test file was recorded, so this is corroboration, not proof.
- The fixer reported that its first attempt used zod's `.max()` and failed the astral tests; the maker confirmed independently that zod 4.6.5 `z.string().max(32)` accepts 17 × U+20000 (34 UTF-16 units) and `max(1000)` accepts 501 × U+20000, i.e. zod counts code points, so the fixer's switch to `.refine((v) => v.length <= MAX)` is required by the spec (probe in `checks.txt`).
- Cost/usage: not visible. The fixer runs with `--output-format text` and `--no-session-persistence`; neither the log nor the fixer output (`.agent-loop/add-realtime-chat-room-2-1/20260926T185144Z-182994/iter-1-agent.txt`, git-ignored, kept locally, not part of the snapshot) reports tokens or cost. The configured cap per fixer run was `--max-budget-usd 2`; the actual spend is unknown.
- Git after the loop: `git log --oneline -1` is still `3034b72`; nothing staged.

## Post-loop edits by the maker

1. `src/lib/chat/schema.test.ts`: added the test "reports only the empty-nickname issue for an empty nickname, not a character issue". Reason: the maker's review found that an empty or whitespace-only nickname produced two issues, "Nickname is required." and the allowed-characters message, because the character pattern used `+` and so also failed on the empty string; the UI would show a misleading message. Recorded red first (1 failed, 69 passed).
2. `src/lib/chat/schema.ts`: `NICKNAME_PATTERN` changed from `/^[\p{L}\p{Nd} _.-]+$/u` to `/^[\p{L}\p{Nd} _.-]*$/u` with a comment line explaining why; the empty case is still rejected by the length refinement. Then 70/70 passed and `npm run check` exit 0.

No other changes to the fixer's code. Review notes on the fixer's code: imports only `zod` (layer rule satisfied, lint clean); trimming uses zod's `.trim()` (`String.prototype.trim`); limits use the constants; `z.object` default strip; `ChatMessage` is a plain type (no runtime schema is needed yet). A too-long nickname that also contains disallowed characters reports both issues, which is accurate.

## Checks on revision 1 (all in `checks.txt`; later revisions under Rounds 2–4)

- `npx vitest run src/lib/chat/schema.test.ts`: exit 0, 70 passed.
- `npm run check`: exit 0 (lint, typecheck, 140 unit tests in 3 files, `next build`, 2 Playwright tests), 24 s.
- `npm run check:loop`: exit 0, 21 s.
- `npm run lint`: exit 0. `npm run typecheck`: exit 0.
- No leftover `next`/`playwright`/`tsx`/`vitest`/`agent-loop`/`claude -p` processes.
- Whitespace: `git diff --check` and `git diff --no-index --check /dev/null <file>` for every new file, plus single final newline (see the last entries of `checks.txt`). The first final whitespace run failed (exit 1) only on `checks.txt`, because the calibration entry recorded git's echo of a probe line with a trailing space; that space (and its echo in the failed run) is shown as `[SPACE]`, a documented edit noted in the header of `checks.txt`. The rerun is the last entry.

## Limitations

- A green loop is not acceptance. The checker accepted revision 1 (`review.md`, round 1) and revision 3 (`review.md`, round 2); revision 2 was never reviewed (superseded); revision 4 is pending review.
- Fixer cost and model are not visible in the text output.
- Nicknames with combining marks (for example a decomposed `é`, or scripts that rely on `\p{M}`) are rejected by the literal spec rule "Unicode letters, digits"; not changed here because it would alter an accepted rule. Superseded: on 2026-09-27 the user decided to allow combining marks only after a letter (accepted wording quoted in Round 3; the round-2 phrase "after a base character" was an imprecise relay, corrected in round 3; spec wording clarified in round 4).
- The 16 vs. 17 × U+20000 browser-side part of the "Character counting" scenario is covered only at the shared-schema level; browser behavior belongs to the UI tasks.
- Deferred (user decision, 2026-09-27; checker finding 4): `scripts/agent-loop.sh` lists every untracked non-ignored file in `changed_files`, not only files the fixer changed (design D7 describes "`git diff --name-only` plus new untracked files"). Not changed in this task; planned as a separate later task.

## Round 2 (2026-09-27)

Input: checker round 1 in `review.md` (verdict accepted for revision 1; findings 1–5) and user decisions of 2026-09-27, relayed by the coordinator: the user replied "так" ("yes") to the recommendations (a) allow combining marks `\p{M}` in nicknames, but not as the first character after trimming, keeping the 32 UTF-16-unit limit; (b) keep digits as `\p{Nd}` and pin it with tests for `a²` and `Ⅻ`; (c) keep U+0020 as the only inner space; (d) correct the mtime claim (finding 3); (e) defer finding 4. All round-2 work is maker post-loop work; the loop was not rerun, and `loop-run.log` and `loop-brief.md` are unchanged (their hashes equal revision 1).

### Step 1: specification (separable "spec" group in `snapshot.txt`)

- `openspec/changes/add-realtime-chat-room/specs/chat-room/spec.md`: the nickname requirement now allows Unicode letters (`\p{L}`), combining marks (`\p{M}`) that are not the first character of the trimmed nickname, decimal digits of any script (`\p{Nd}`), U+0020, `-`, `_`, `.`, and states that other digit-like characters and other inner whitespace are not allowed. New scenarios: "Nickname with combining marks is accepted" (`प्रिया`, decomposed `José`), "Nickname starting with a combining mark is rejected" (U+0301 + `abc`), "Nickname with a non-decimal digit is rejected" (`a²`).
- `openspec/changes/add-realtime-chat-room/design.md` Q1: a "Refined (user decision, 2026-09-27 ...)" sentence records the user's "так" and decisions (a)–(c).
- `openspec validate add-realtime-chat-room --strict` exit 0; `openspec validate --all --strict` exit 0 (`checks.txt`).
- `docs/architecture.md` and `docs/evidence/README.md` do not repeat the nickname character rule (checked with `grep`), so they were not changed.

### Step 2: code (separable "code" group)

- Red first: added 9 tests to `src/lib/chat/schema.test.ts` (79 total): accepted `प्रिया` (written as `\u092A\u094D\u0930\u093F\u092F\u093E`), decomposed `José` (`Jose\u0301`), several marks after one base letter; rejected `a²`, `Ⅻ`, a leading U+0301, a lone U+0301, a leading mark after trimming (`'  \u0301abc  '`); 16 × (`e` + U+0301) = 32 units accepted and 33 units rejected. Against the unchanged revision-1 `schema.ts` (hash `237366d1…`): 4 failed, 75 passed. The `a²`/`Ⅻ`/leading-mark tests passed already; they pin the rule rather than drive the change.
- `src/lib/chat/schema.ts`: only `NICKNAME_PATTERN` and its comment changed, from `/^[\p{L}\p{Nd} _.-]*$/u` to `/^(?!\p{M})[\p{L}\p{M}\p{Nd} _.-]*$/u`. The pattern still matches the empty string, so an empty nickname keeps a single "required" issue. Validation messages are unchanged ("letters" covers letters with their marks).
- Mutation check (in place, restored from a copy, `sha256sum -c` `OK`): removing the lookahead fails 3 tests; removing `\p{M}` from the class fails 4; `\p{Nd}` → `\p{N}` fails 2 (`a²`, `Ⅻ`); the round-1 survivors are now killed.

### Round 2 checks (all in `checks.txt`)

- `npx vitest run src/lib/chat/schema.test.ts`: exit 0, 79 passed.
- `npm run lint` exit 0; `npm run typecheck` exit 0.
- `npm run check`: exit 0 in 40 s (149 unit tests in 3 files, `next build`, 2 Playwright tests).
- No leftover processes; HEAD `3034b72`; nothing staged; whitespace checks for tracked and untracked files at the end of `checks.txt`.
- The maker's scratchpad had been cleared between rounds; the helper `rec21.sh` was recreated byte-for-byte from the body recorded in `checks.txt` (noted there).

### Round 2 open issues

- Checker review of revision 2 is pending. (Superseded: revision 2 was never reviewed; revision 3 replaced it.)
- A combining mark directly after a space, hyphen, underscore, period, or digit is accepted: the accepted rule forbids only a leading mark. Not tightened, because that would go beyond the user's decision. Superseded in round 3: the accepted wording was "only after a letter"; such marks are now rejected.
- Checker finding 5 (empty issue `path` for a non-object payload; control characters and lone surrogates in message text) is informational for the controller and repository tasks; not changed here.
- Finding 4 stays deferred (see Limitations).

## Round 3 (2026-09-27)

Input: the coordinator corrected the round-2 relay. The recommendation the user accepted with "так" was, verbatim: "Дозволити `\p{M}`, але лише після літери: нік не може починатися зі знака" ("Allow `\p{M}`, but only after a letter: a nickname cannot start with a mark"); the round-2 relay's "only after a base character" was imprecise. Rule implemented: a combining mark is allowed only immediately after a letter or after another mark that itself follows a letter; a mark at the start or after a space, `-`, `_`, `.`, or a digit is rejected. Maker post-loop work; the loop was not rerun; `loop-run.log` and `loop-brief.md` are unchanged (hashes `9e131b91…`, `2e67d3ca…` rechecked in `checks.txt`); `review.md` not edited.

### Step 1: specification ("spec" group)

- `specs/chat-room/spec.md`: the nickname requirement now says a combining mark is allowed only immediately after a letter or after another mark that follows a letter, so it must not start the trimmed nickname or follow a space, hyphen, underscore, period, or digit (replaces "so every mark follows a base character"). New scenario "Combining mark after a space or digit is rejected" (`a`, space, U+0301, `b`; `1` + U+0301).
- `design.md` Q1 refined sentence, item (a): quotes the accepted Ukrainian wording with its translation and notes that the round-2 "base character" relay was imprecise and was corrected in round 3.
- `openspec validate add-realtime-chat-room --strict` exit 0; `openspec validate --all --strict` exit 0.

### Step 2: code ("code and evidence" group)

- Red first: 7 tests added to the disallowed-characters table in `schema.test.ts` (86 total): a mark after a space, an ASCII digit, a non-ASCII digit (`٣`), a hyphen, an underscore, a period, and two marks after a digit. Against the revision-2 `schema.ts` (hash `7253a2bf…`): 7 failed, 79 passed. Existing accepted cases (`प्रिया`, decomposed `José`, several marks after one letter, 16 × (e + U+0301)) are kept and still pass.
- `schema.ts`: only `NICKNAME_PATTERN` and its comment changed, to `/^(?:\p{L}\p{M}*|[\p{Nd} _.-])*$/u`: the nickname is a sequence of units, each a letter followed by zero or more marks, or one of the other allowed characters. This expresses the rule directly instead of the suggested lookahead; the alternatives are disjoint, so matching stays linear (probe: 1,000,001- and 1,000,002-unit inputs rejected in under 500 ms). The empty string still matches, so an empty nickname keeps the single "required" issue. `प्रिया` passes because its vowel signs and virama are `\p{M}` directly after `\p{L}`.
- Mutation check (in place; restored and verified with `sha256sum -c` `OK`): revision-2 rule (only a leading mark forbidden) fails 7 tests; marks allowed anywhere fails 10; no marks fails 4; `\p{Nd}` → `\p{N}` fails 2. The first attempt at the last two mutants did not apply (sed used `|` as the delimiter, which also appears in the pattern; recorded in `checks.txt`), and they were rerun with `#` as the delimiter.

### Round 3 checks (all in `checks.txt`)

- `npx vitest run src/lib/chat/schema.test.ts`: exit 0, 86 passed.
- `npm run lint` exit 0; `npm run typecheck` exit 0.
- `npm run check`: exit 0 in 36 s (156 unit tests in 3 files, `next build`, 2 Playwright tests).
- No leftover processes; HEAD `3034b72`; nothing staged; whitespace checks at the end of `checks.txt`.

### Round 3 open issues

- Checker review of revision 3 is pending. (Superseded: accepted in `review.md` round 2.)
- A mark after a letter is accepted regardless of script pairing (for example a Devanagari sign after a Latin letter); the accepted rule does not restrict this.
- Finding 4 stays deferred; finding 5 remains informational for later tasks.

## Round 4 (2026-09-27)

Input: checker `review.md` round 2 (verdict accepted for revision 3; low findings 1–3, informational finding 4) and the user's decision of 2026-09-27, relayed by the coordinator: "так, виправляй і потім коміть" ("yes, fix and then commit"). Maker post-loop work; the loop was not rerun; `loop-run.log`, `loop-brief.md`, and `review.md` were not edited (hashes rechecked in `checks.txt`). No behavior change: `schema.ts` is byte-identical to revision 3 (`4716d78f…`).

- **Finding 1 (spec wording), "spec" group:** `specs/chat-room/spec.md` nickname requirement now says "a combining mark is allowed only as part of a run of one or more combining marks that directly follows a letter (any number of marks may follow a letter)", replacing "immediately after a letter or after another combining mark that itself follows a letter". `design.md` Q1 item (a), which paraphrased the rule, uses the same "run of combining marks that directly follows a letter" wording; the verbatim Ukrainian quote and its translation are unchanged. All 49 scenarios kept (45 at `3034b72` + 4 added in rounds 2–3). `openspec validate add-realtime-chat-room --strict` exit 0; `--all --strict` exit 0.
- **Finding 2 (test gap), "code and evidence" group:** added rejected rows for ZWJ (`a\u200Db`), ZWNJ (`a\u200Cb`), and U+202E RIGHT-TO-LEFT OVERRIDE (`a\u202Eb`), and an accepted row with three marks after one letter (`a\u0301\u0308\u0323`) to pin "any number of marks" from finding 1. Honest red-first note: these are pinning tests; against the unchanged revision-3 `schema.ts` they passed immediately (90 passed, 0 failed). Their value is shown by mutation (restored from a copy, `sha256sum -c` `OK`): adding `\p{Cf}` to the character class fails the 3 format-character rows (3 failed, 87 passed); limiting marks to `\p{M}{0,2}` fails the three-marks row (1 failed, 89 passed).
- **Finding 3 (stale sentences):** updated the Changes table (test count, the post-loop edits to `schema.ts`, and a row for the spec/design files), the acceptance-mapping review row, the Limitations review sentence, and the combining-mark limitation (now points to the "only after a letter" wording and the round-3 correction). The round-2 and round-3 "review pending" open issues are kept as history and marked superseded rather than deleted.
- Informational finding 4 (invisible and enclosing marks after a letter are accepted) matches the accepted rule; no change.

### Round 4 checks (all in `checks.txt`)

- `npx vitest run src/lib/chat/schema.test.ts`: exit 0, 90 passed.
- `npm run lint` exit 0; `npm run typecheck` exit 0.
- `npm run check`: exit 0 in 38 s (160 unit tests in 3 files, `next build`, 2 Playwright tests).
- No leftover processes; HEAD `3034b72`; nothing staged; whitespace checks for tracked and untracked files at the end of `checks.txt`.

### Round 4 open issues

- Checker review of revision 4 is pending. After acceptance the user has approved committing (the coordinator shows `git status --short` and `git diff --stat` first; two commits, spec first, per the `snapshot.txt` groups).
- Consequence of the accepted rule (checker finding 2, round 2): spellings that need ZWJ/ZWNJ (some Devanagari conjunct forms, Persian with ZWNJ) are rejected; the ordinary forms are accepted.
- Finding 4 of round 1 (loop `changed_files`) stays deferred; round-1 finding 5 stays informational for later tasks.
