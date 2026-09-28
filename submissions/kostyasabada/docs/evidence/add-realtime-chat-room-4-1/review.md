# Task add-realtime-chat-room-4-1 — review

## Round 1

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker.
- Date: 2026-09-28.
- Runtime: Node v24.21.0 (`PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`).
- Reviewed snapshot: `snapshot.txt` revision 1 on base commit `e9cf4ed` (uncommitted working tree, nothing staged). `sha256sum -c` of all five listed entries: OK (`chat.controller.ts` fbdf9313…, `chat.controller.test.ts` c7f9abff…, `host-policy.ts` 4bedac3a…, `host-policy.test.ts` 977bec13…, `implementation.md` f262a0c1…). `checks.txt` (outside the snapshot) hashes to `19b5300a6821437e0bdb22541b00646dd72da06ab58f34468786bd9c657de00b`, matching the maker's stated final hash.
- Read: `AGENTS.md`, `docs/review-process.md`, task 4.1 in `tasks.md`, `design.md` D2 (contract table, P19, catch-up rule, residual risks) and D4 (controller boundaries, rules (a)–(c), boundary table), the relevant `specs/chat-room/spec.md` requirements (message validation, real-time delivery, ordering, connection/catch-up, local host and origin restriction), `src/lib/chat/schema.ts` (refinements), `src/server/chat/chat.service.ts`, `src/server/config.ts`, spec review N23/N24, all four new files in full, and the maker's `implementation.md`, `checks.txt`, `snapshot.txt`.

### Findings

| ID | Severity | Location | Finding |
|---|---|---|---|
| F1 | Medium | `src/server/chat/chat.controller.ts:37-42`; `src/server/chat/chat.controller.test.ts:238-259`; `implementation.md:49` | On a `historyFor` failure the controller calls `socket.disconnect(true)`. The comment (lines 38-39) and `implementation.md` say the client then "reconnects with backoff and asks again". This is false for socket.io-client 4.8: a server-side disconnect gives the reason `io server disconnect` (the test pins it at line 251), and the client does not reconnect automatically. I checked this with a scratch script (real `socket.io` and `socket.io-client` from `node_modules`, `reconnectionDelay` 100 ms, 1.5 s wait). After `disconnect(true)` the server saw 1 connection and the client stayed disconnected. After `socket.conn.close()` the reason was `transport close`, the server saw 2 connections, and the client was connected again. So the stated rationale for maker decision (3) is wrong, and a real client would stay disconnected until the page reloads unless task 5.3 adds a manual `connect()`. The server does keep running (D4 rule (c) spirit), so this is not a crash. Fix: either change to a transport-level close so the client reconnects on its own (and update the test's expected reason), or keep `disconnect(true)` and correct the comment and `implementation.md`, stating that the client must call `connect()` after `io server disconnect`. Either way the user should confirm the choice. |
| F2 | Low | `src/server/chat/chat.controller.test.ts:276-282`; `implementation.md:46` | The test "broadcasts before acking, so the sender has the message when the ack arrives" checks `alice.messages` after `await send(...)`. Both frames usually arrive in one read and are dispatched before the `await` continuation runs, so the test does not pin the order. My mutants K1 (broadcast deferred with `setImmediate` after the ack) and K1c (broadcast in `queueMicrotask`, so the ack goes out first in the same tick) both survive: 53/53 pass. Only a 20 ms delay (K1b) is caught. A scratch script shows that a check inside the ack callback detects the swap: the message count at callback time is 0 for ack-then-broadcast and 1 for broadcast-then-ack. The production order is correct (`handleSend` emits before it returns, and the handler acks afterwards). Only the test and the "tested" claim are too weak. Fix: record `alice.messages.length` inside the ack callback (for example `socket.emit('message:send', payload, (ack) => …)`) and assert 1. |
| F3 | Low | `src/server/http/host-policy.ts:117-118` | The IPv4-mapped wildcard `HOST=::ffff:0.0.0.0` is not treated as a wildcard. `parseConfig` accepts it, and the policy adds `[::ffff:0:0]:3000`. I checked that Node listens on it as an IPv4 wildcard (connections via 127.0.0.1 and via the machine's LAN IPv4 both succeed). Impact is minimal. The added entry is an IP literal, so no DNS-rebinding page can produce it, and no LAN address is added. The spec names only `0.0.0.0` and `::` as wildcards. Optional: add `[::ffff:0:0]` to `WILDCARD_HOSTNAMES`, with a test. Not blocking. |
| F4 | Info | `src/server/http/host-policy.ts:125-144` | Leading-zero ports are accepted and normalized (`LOCALHOST:03000`, and a port with 100 000 leading zeros, both give `localhost:3000`). IPv4 shorthand is also accepted (`127.1`, `0x7f.1`, `2130706433`, `0177.0.0.1` give `127.0.0.1`). All of these are equivalent to own hosts. Node's default header size limit (16 KB) bounds real requests. No action. |

No other defects found. Points checked and found correct:

- Ack shapes and codes match D2 exactly.
- The broadcast goes to the room, sender included (maker mutant M1 kills it).
- `postMessage` is the only call inside `try`. `server_error` uses a fixed message and does not leak internals (my mutant K2 kills a leak).
- `lastSeenId` is accepted only when it is a non-negative safe integer (my mutant K4, `>= 0` changed to `> 0`, is killed by the spy test).
- A missing ack callback is safe: `ack?.()`, and an ack-only emit is answered.
- Extra fields are stripped by the zod object schema.
- The nickname-before-text precedence is computed explicitly.
- The controller imports only `socket.io` (type-only), the shared schema, and the service types.
- The host policy reuses `hostForUrl` from `config.ts` and duplicates no parsing.

### Test-quality assessment

- Every case in task 4.1 has a meaningful test; the maker's mapping table in `implementation.md` matches the test file.
- The sentinel barrier approach is sound. Socket.IO keeps packet order per connection. Any broadcast the rejected payload caused would reach each client before the later sentinel's `message:new`, and before Bob's own ack in the always-failing case. So "only the sentinel in `onAny` events" plus the stored rows prove that nothing was broadcast or stored. My mutant K3, which broadcasts rejected payloads, is killed by 20 cases.
- The ordering test uses four concurrent sends with no sleeps. It compares both clients' sequences with each other, with ascending ids, with the acks, and with the stored rows. It is robust.
- The tests close all handles. `afterEach` disconnects every client, awaits `io.close()` (which closes the `http.Server`), closes the DB, and removes the temp directory. Three runs finished in under 0.5 s with no hanging-process or unhandled-error output.

### Adversarial host-policy inputs (my own, run with `tsx` against the real module; default config `HOST=127.0.0.1`, `PORT=3000`)

`Host` → `normalizeHost` → `isAllowedHost`:

| Input | Normalized | Allowed | Assessment |
|---|---|---|---|
| `localhost.:3000` | `localhost.:3000` | false | Correct (conservative) |
| `LOCALHOST:03000`, `localhost:003000`, `[::1]:03000` | `localhost:3000` / `[::1]:3000` | true | Acceptable (F4) |
| `[::ffff:127.0.0.1]:3000`, `[::FFFF:7f00:1]:3000` | `[::ffff:7f00:1]:3000` | false | Correct (not in the spec allowlist) |
| `127.0.0.1:3000[SPACE]`, `127.0.0.1:3000<TAB>`, `localhost:3000\n`, `localhost:3000\r\nX: y` | null | false | Correct |
| `127.1:3000`, `0x7f.1:3000`, `2130706433:3000`, `0177.0.0.1:3000` | `127.0.0.1:3000` | true | Acceptable (F4; loopback literals) |
| `127.0.0.2:3000`, `sub.localhost:3000`, `.localhost:3000`, `localhost..:3000`, `-localhost:3000` | unchanged | false | Correct |
| `xn--localhost:3000`, `xn--nxasmq6b:3000` | unchanged | false | Correct |
| `lоcalhost:3000` (Cyrillic `о`) | null | false | Correct (shape check) |
| `localhost:+3000`, `localhost:3000.`, `[::1%25lo]:3000`, `localhost:65536` | null | false | Correct |
| `localhost:0`, `[::1]`, `LOCALHOST` | normalized | false | Correct (wrong port) |
| `[::1]:3000,evil.example:3000`, `localhost:3000, localhost:3000`, an array | null | false | Correct |
| `a`×100 000 + `:3000` | long name | false | Correct; 100 non-matching 100 000-character inputs took 35 ms in total (no ReDoS) |

`Origin` → `isAllowedOrigin`:

- Accepted: `HTTP://LOCALHOST:3000`, `hTtP://localhost:3000`, `http://127.1:3000`, `http://localhost:03000`, `http://[::1]:3000`.
- Rejected: `http://localhost:3000/`, `http://LOCALHOST:3000/`, `http://localhost.:3000`, `http://[::ffff:127.0.0.1]:3000`, `http://localhost:3000[SPACE]`, a value with a leading space, `http://localhost:3000\n`, `http:\\localhost:3000`, `http:///localhost:3000`, `http://localhost:3000.`, `blob:http://localhost:3000`, `file://`, and `http://` + `a`×100 000.
- All as intended.

Configured `HOST` (via `parseConfig`) → allowlist:

- No entry added: `0.0.0.0.`, `0.0`, `0x0`, `00.0.0.0`, `[0::0]`, `0:0::` (all wildcards). `127.0.0.1.` also adds nothing, because it normalizes to a duplicate of an existing entry.
- `LOCALHOST.` adds `localhost.:3000`. This is the configured name, so it is fine.
- `::ffff:0.0.0.0` adds `[::ffff:0:0]:3000` (F3).

### Independent checks (all run by me from `submissions/kostyasabada/`, Node v24.21.0)

| Check | Result |
|---|---|
| `sha256sum -c` of the snapshot entries | 5/5 OK |
| `sha256sum checks.txt` | `19b5300a…de00b`, matches the stated hash |
| `npx vitest run src/server/chat/chat.controller.test.ts src/server/http/host-policy.test.ts` ×3 | 160/160 each; 491 ms, 457 ms, 459 ms; exit 0 |
| Own mutants (hash-verified restore, all `restored identical: True`; final hashes fbdf9313… and 4bedac3a… re-checked) | K2 leak of the internal error text: killed (1). K3 broadcast of rejected payloads: killed (20). K4 `lastSeenId` 0 treated as absent: killed (1). K5 `[::]` removed from the wildcards: killed (3). K6 trailing `/` tolerated in `Origin`: killed (1). K1b ack first, broadcast 20 ms later: killed (1). K1 ack first, broadcast in `setImmediate`: survived (run twice). K1c ack first, broadcast in `queueMicrotask`: survived (F2). |
| Own lint probes (`eslint --stdin --stdin-filename`, project config) | Controller `import type { Database } from 'better-sqlite3'`: exit 1. Controller `import * as db from '../db'`: exit 1. Host policy `import … from '../../app/_chat/chat-room'`: exit 1. Controller `import … from '../http/host-policy'` (allowed): exit 0. |
| `npm run test:unit` | 7 files, 382 tests, 14.19 s, exit 0 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run check` | exit 0 (382 unit tests, `next build`, Playwright 2/2), wall time 24 s |
| `openspec validate --all --strict` | 1 passed, exit 0 |
| Narrow process check (`server.ts\|next …\|next-server\|playwright\|vitest`) | None before or after `npm run check`; no scratch server left running |
| `git diff --check` (tracked) | exit 0 |
| `git diff --no-index --check /dev/null <file>` for each of the 7 untracked files | exit 1 each (clean; 3 would mean whitespace errors) |
| `git status --short` | Only the 4-1 evidence directory, `chat.controller{,.test}.ts`, and `src/server/http/` untracked; 0 staged |
| `git log --oneline -1` | `e9cf4ed feat: add chat service with history and catch-up rules (task 3.2)` |

### Evidence honesty

- The red runs are genuine:
  - Run 1 fails with `Cannot find module` for both files.
  - In run 2 the host-policy stub throws while tests are collected: `policyFor()` at describe level in `host-policy.test.ts:141,185` makes vitest report "no tests", exit 1. This is still a real red result.
  - The controller no-op stub makes 53/53 tests time out.
- Every maker mutant M1–M8 shows `restored identical: True`, and my current hashes equal the snapshot.
- The two early lint and typecheck entries piped through `tail` without `pipefail`; `implementation.md:92` discloses this, and the later final entries use `pipefail`.
- The `[SPACE]` marker convention is explained in the header and visible in the calibration entry.
- The one header rewording is disclosed as `[DOCUMENTED EDIT]`.
- The only inaccurate statement is the reconnection claim in F1, and the "tested" claim for the ack order is overstated (F2).

### Maker decisions needing user confirmation — checker recommendation

1. **Non-object payloads get `invalid_text` with "Invalid message payload."** Recommend accepting it. It keeps the accepted three-code D2 contract, and the client shows an error and keeps the text. Only a modified client can send such payloads.
2. **When both fields are invalid, `invalid_nickname` wins.** Recommend accepting it. It is deterministic, tested, and low-stakes. The nickname is the precondition for sending.
3. **`historyFor` failure: log, disconnect, no history.** Needs a decision; see F1. I recommend a transport-level close (`socket.conn.close()`), so that the default client reconnects with its normal backoff (`reconnectionDelayMax: 2000`), and the test expecting `transport close`. The alternative is to keep `disconnect(true)`, correct the rationale, and have task 5.3 handle `io server disconnect` explicitly. Not logging-and-continuing without history is right, because the client would otherwise show a room without history.
4. **A valid send without an ack callback is still stored and broadcast.** Recommend accepting it. D2 makes the ack the sender's confirmation, not a condition of acceptance. Dropping the message would be surprising, and it is tested.
5. **IPv4 shorthand `127.1:3000` is accepted via URL normalization.** Recommend accepting it. These are loopback literals, so there is no DNS-rebinding vector, and browsers normalize such URLs before they send `Host`/`Origin`. Optionally pin it with one test (confirmed by my adversarial run). This needs no spec change.

### Limitations

- The controller tests and my probes used only the websocket transport. Polling and the actual wiring of the host policy are task 4.2.
- My reconnection and ack-order probes were standalone scratch scripts that used the project's `socket.io` 4.8.4 packages, not the project test suite. They ran briefly from the submission root and were deleted immediately. No project file was changed.
- The IPv4-mapped wildcard listen check (F3) was run on this Linux machine only.
- I did not repair, stage, commit, or tick anything.

### Verdict

**changes requested.**

- F1 (the reconnection behavior and its false rationale) must be resolved, and the user should decide on maker decision (3).
- F2 (a test that actually pins ack-after-broadcast) should be fixed in the same round.
- F3 and F4 are optional and do not block.
- All other acceptance criteria of task 4.1 are met, and all required checks pass.

## Round 2

- Checker: Claude Code general-purpose subagent (checker), separate from coordinator and maker (same checker as round 1).
- Date: 2026-09-28.
- Runtime: Node v24.21.0.
- Reviewed snapshot: `snapshot.txt` revision 2 on base `e9cf4ed`. `sha256sum -c` passes for all five entries:
  - `chat.controller.ts` 77df3db7…
  - `chat.controller.test.ts` 1af51a98…
  - `host-policy.ts` 8fb8749c…
  - `host-policy.test.ts` c3ff6536…
  - `implementation.md` 17e30467…

  `checks.txt` hashes to `21778832a17d411aecfce2b7d12a7b508e9978c4f16e3ec99dd5a8e1f254f583`, which matches the maker's stated final hash.
- User decision (relayed by the coordinator, 2026-09-28): "так, приймаю, виправляй" ("yes, I accept, fix it"). It accepts decisions (1), (2), (4) and (5), with (5) to be pinned by a test. Decision (3) is changed to a transport-level close. F2 and F3 are to be fixed; F4 needs no action. The Round 2 section of `implementation.md` records these decisions accurately.
- Read:
  - the Round 2 sections of `implementation.md` and `checks.txt`
  - `snapshot.txt` revision 2
  - `chat.controller.ts` in full
  - the changed parts of `chat.controller.test.ts` (`connectClient` options, the F1 and F2 tests)
  - the wildcard and shorthand changes in `host-policy.ts` and `host-policy.test.ts`

### Resolution of round-1 findings

| ID | Status | Evidence |
|---|---|---|
| F1 | Resolved | `chat.controller.ts:37-46` now logs the error, calls `socket.conn.close()` and returns. The comment states correctly why `disconnect(true)` would not reconnect.<br><br>The test at `chat.controller.test.ts:250-289` asserts reason `transport close`, no events before the reconnect, `history` on the same socket with no manual `connect()`, 2 server connections, 2 `historyFor` calls, one log line, and a following ack with id 3.<br><br>It synchronizes only on the `disconnect` event, the `history` promise and the ack. The 50/100 ms reconnection delays are client settings, not sleeps. It passed 5/5 runs in isolation (374–480 ms), and 3/3 in the full files.<br><br>Maker red run: fails on the round-1 code with `expected 'io server disconnect' to be 'transport close'`. Maker mutant R1 is killed, and so is my new mutant K7 (log and continue with an empty `replace` history, no close). |
| F2 | Resolved | `chat.controller.test.ts:304-316` reads `alice.messages.length` inside the ack callback and asserts 1. My mutants K1 (`setImmediate`) and K1c (`queueMicrotask`), which both survived in round 1, are now killed. |
| F3 | Resolved | `host-policy.ts:28-32` adds `[::ffff:0:0]` to `WILDCARD_HOSTNAMES`. `host-policy.test.ts:61-70` covers `::ffff:0.0.0.0`, `[::ffff:0:0]` and `::FFFF:0:0`, and refuses `Host: [::ffff:0:0]:3000`. Red on the round-1 code: 3 cases. Maker mutant R2 is killed. |
| F4 | No action (user decision) | Decision (5) is now pinned: `host-policy.test.ts:188-199` covers `127.1`, `0x7f.1`, `2130706433` and `0177.0.0.1` as `Host`, `Origin: http://127.1:3000`, and the refusal of `127.2:3000`. |

### Persistent-failure consequence

I checked this independently with a scratch script that ran the real `registerChatController`, a service whose `historyFor` always throws, and a client with the browser's `reconnectionDelayMax: 2000` and its other defaults. The script ran for 8 s from the submission root and was deleted afterwards.

- 8 connection attempts in 8 s.
- 8 server log lines, one per attempt.
- Gaps between attempts ranged from 690 to 1507 ms.

This is bounded and cheap for a local single-user demo, so I find it acceptable. It is disclosed in `implementation.md` under Round 2 "Changes".

### New findings

| ID | Severity | Location | Finding |
|---|---|---|---|
| R2-1 | Info | `implementation.md:54`, `:73`, `:102` | Three round-1 statements are superseded by the Round 2 section but are not marked as superseded, unlike line 49:<br><br>- IPv4 shorthand "not separately tested"<br>- the criteria row that still names the removed test "disconnects the client and keeps running…"<br>- the limitation "may need a user decision"<br><br>The Round 2 section is accurate and complete, so nothing is misreported overall. Optional cleanup; not blocking. |

No regressions found. My own mutants were all restored with hashes verified, and `chat.controller.ts` still hashes to 77df3db7… afterwards:

| Mutant | Change | Result |
|---|---|---|
| K1 | Broadcast in `setImmediate` after the ack | Killed |
| K1c | Broadcast in `queueMicrotask` after the ack | Killed |
| K7 | On a history failure, log and continue with an empty `replace` history, no close | Killed (the F1 test times out) |

The maker's round-2 log shows K1, K1c, K1b, R1–R3 and a re-run of M1–M8 on the round-2 files. Every mutant was killed and every restore was identical.

### Independent checks (round 2)

| Check | Result |
|---|---|
| `sha256sum -c` of the snapshot entries (checked before and after my runs) | 5/5 OK |
| `sha256sum checks.txt` | `21778832…f583`, matches |
| F1 test alone (`-t "closes the transport"`) ×5 | 5/5 pass, 374–480 ms |
| Both test files ×3 | 169/169 each, 524, 678 and 659 ms, exit 0 |
| `npm run test:unit` | 7 files, 391 tests, 14.00 s, exit 0 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run check` | exit 0 (391 unit tests, `next build`, Playwright 2/2), wall time 23 s |
| `openspec validate --all --strict` | 1 passed, exit 0 |
| Narrow process check (`server.ts\|next …\|next-server\|playwright\|vitest`, plus `tsx` after my probe) | None before or after |
| `git diff --check` (tracked) | exit 0 |
| `git diff --no-index --check /dev/null <file>` for each of the 8 untracked files (including this `review.md`) | exit 1 each (clean) |
| `git status --short` | Only the 4-1 evidence directory, `chat.controller{,.test}.ts` and `src/server/http/` untracked; 0 staged |
| `git log --oneline -1` | `e9cf4ed feat: add chat service with history and catch-up rules (task 3.2)` |

### Limitations (round 2)

- The reconnection test and my persistent-failure probe use the websocket transport only. The test uses short, test-only reconnection delays; my probe used the browser's `reconnectionDelayMax: 2000`, but only in Node, not in a browser.
- Wiring the host policy into requests, upgrades and `allowRequest` remains task 4.2.
- My scratch probe ran from the submission root and was deleted. No deliverable was changed.
- I did not repair, stage, commit or tick anything.

### Verdict (round 2)

**accepted** for snapshot revision 2.

- F1, F2 and F3 are resolved.
- F4 is closed by the user's decision and is now pinned by tests.
- R2-1 is informational only.
- All required checks pass.

Any later change to the four deliverables invalidates this acceptance for the changed files.
