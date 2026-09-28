# Task add-realtime-chat-room-2-2 — implementation report

- Task: `openspec/changes/add-realtime-chat-room/tasks.md`, task 2.2 (left unticked; ticking needs checker acceptance).
- Maker: Claude Code general-purpose subagent (maker), fresh subagent with a scoped handoff from the coordinator.
- Date: 2026-09-27. Runtime: Node v24.21.0 from `~/.nvm/versions/node/v24.21.0/bin` (recorded in `checks.txt`).
- Base commit: `785bece`. Nothing staged or committed. Not run through the agent loop.
- Snapshot: `snapshot.txt` in this directory (SHA-256 per file, two commit groups).

## User decisions (relayed by the coordinator)

- 2026-09-27, in Ukrainian: "встанови сам, сурогати відхиляти окремим завданням" (translated: "install it yourself, reject surrogates as a separate task"). "Install it yourself" referred to the Node runtime; the second part is this task. The recommendation it answered: reject message text with lone UTF-16 surrogates in the shared schema with `invalid_text`, using `String.prototype.isWellFormed()`, spec first; pin the existing nickname rejection with a test. Recorded in `design.md` Q2.
- The user then asked to commit the previous task and start this one, including the fix of the stale Node runtime path in `docs/testing.md`.

## Acceptance criteria and where they are met

| Criterion (task 2.2) | Where |
|---|---|
| Spec: lone surrogate in message text rejected with `invalid_text`; valid pair accepted | `specs/chat-room/spec.md`, requirement "Message validation" (one sentence) and scenarios "Message with a lone surrogate is rejected by the server" and "Message with a valid surrogate pair is accepted" |
| Spec: nickname with a lone surrogate rejected | Scenario "Nickname with a lone surrogate is rejected by the server" (`invalid_nickname`); the requirement text is unchanged because its character classes already exclude surrogates |
| Decision recorded with date and quote + translation | `design.md` Q2, "Refined (user decision, 2026-09-27, task 2.2)" |
| Task added under section 2, unticked | `tasks.md` 2.2 |
| Red-first tests: lone high, lone low, reversed pair, edges after trimming, valid pair accepted, pair counts as two units at the 1000 limit, `text` path, nickname rejected under `nickname` path | `src/lib/chat/schema.test.ts` (new tests in `nicknameSchema`, `messageTextSchema`, `sendMessageSchema`) |
| Red run recorded | `checks.txt`, section "red run": 10 failed, 98 passed, exit 1 |
| Minimal implementation with `isWellFormed()` on the trimmed text | `src/lib/chat/schema.ts`: one `.refine` after the length refines, new message constant, doc comments |
| Repository test comment updated, driver behavior still recorded | `src/server/chat/message.repository.test.ts` (comment only) |
| Mutation check with hash-verified restore | `checks.txt`, section "Mutation check": 10 failed, exit 1; hash before = after |
| `docs/testing.md` runtime note corrected | "Setup history" paragraph, one line changed |
| Checks green, OpenSpec strict validation | `checks.txt`, final sections |

## Changes

Group "spec":

- `openspec/changes/add-realtime-chat-room/tasks.md`: new unticked task 2.2.
- `openspec/changes/add-realtime-chat-room/specs/chat-room/spec.md`: well-formedness sentence in "Message validation", two message scenarios, one nickname scenario.
- `openspec/changes/add-realtime-chat-room/design.md`: Q2 refinement with the user decision.

Group "code and evidence":

- `src/lib/chat/schema.ts`: `messageTextSchema` gains `.refine((value) => value.isWellFormed(), MESSAGE_MALFORMED_MESSAGE)` with the message "Message contains an invalid character (an unpaired UTF-16 surrogate)."; the nickname pattern comment notes that lone surrogates (`\p{Cs}`) are rejected. The nickname schema is unchanged.
- `src/lib/chat/schema.test.ts`: 18 new test cases (4 nickname, 12 message text, 2 payload path; 90 before, 108 after).
- `src/server/chat/message.repository.test.ts`: comment on the lone-surrogate test.
- `docs/testing.md`: the runtime history now says the `/tmp` runtime served setup and tasks up to 2.1 and was removed when `/tmp` was cleaned, task 3.1 used nvm's Node 24.13.1, and the pinned Node 24.21.0 was installed with nvm on 2026-09-27 at `~/.nvm/versions/node/v24.21.0/bin` (used from task 2.2 on). The history claims were checked against earlier evidence by grepping each task directory for the runtime paths.
- `docs/evidence/add-realtime-chat-room-2-2/implementation.md`, `checks.txt`, `snapshot.txt`.

## Design choices

- Issue policy: every refine runs (zod's default), as for nicknames. An empty or whitespace-only text is well-formed after trimming, so it still reports only the "required" issue (tested). A short text with a lone surrogate reports one issue; an over-limit text with a lone surrogate reports both the limit and the surrogate issue (tested). A 1001-unit text made of a valid pair reports only the limit issue (tested).
- The check runs on the trimmed value. `trim()` does not remove surrogates, so a lone surrogate at either edge is still rejected (tested).
- The schema only reports issues under the `text` path; mapping to the ack code `invalid_text` belongs to the controller (task 4.1, design D2). The spec states the code because the user decision named it.

## Checks (details and exact output in `checks.txt`)

| Check | Result |
|---|---|
| `node --version` | v24.21.0 |
| `openspec validate add-realtime-chat-room --strict` and `validate --all --strict` (after the spec group and at the end) | exit 0 |
| Red run: `npx vitest run src/lib/chat/schema.test.ts` before `schema.ts` changed | 10 failed, 98 passed, exit 1 (the other 8 new cases: 4 nickname, 1 nickname path, valid pair, pair at the limit, whitespace-only; passed already, as expected, because they pin existing behavior) |
| `npx vitest run src/lib/chat/schema.test.ts src/server/chat/message.repository.test.ts` | 121 passed, exit 0 |
| Mutation: remove the `isWellFormed` line | 10 failed, exit 1; file restored, SHA-256 identical |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run check` | exit 0 (191 unit tests, 2 E2E tests), 30 s |
| Leftover processes (`server.ts`, `next`, `playwright`, `vitest` patterns) | none |
| `git diff --check`, `git diff --no-index --check` per untracked file, final newline | see the last section of `checks.txt` |

## Limitations

- The browser UI and the controller do not exist yet, so the `invalid_text` code and the server-side scenarios are only exercised at the schema level; tasks 4.1 and 5.2 cover the controller and UI.
- The user decisions are relayed by the coordinator; this maker did not see the user's messages directly.
- The Node 24.21.0 nvm installation and its checksum verification were done by the coordinator and are not re-verified here beyond `node --version`.
