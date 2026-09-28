# Task add-realtime-chat-room-4-1 — implementation

- Task: 4.1 in `openspec/changes/add-realtime-chat-room/tasks.md` (chat controller and host policy with red-first tests).
- Maker: Claude Code general-purpose subagent (maker), fresh scoped handoff from the coordinator.
- Base commit: `e9cf4ed`; uncommitted working tree, nothing staged. The task checkbox is not ticked (checker acceptance pending). Task 4.2 (`app.ts`, `server.ts`) is not touched.
- Snapshot: `snapshot.txt` (SHA-256 of the deliverables; this report and `checks.txt` are listed separately there). Current: revision 2 (round 2 below); the round-1 sections describe revision 1.
- Runtime: Node v24.21.0 via `PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`, npm 11.19.0 (first entry of `checks.txt`).

## Changes

- `src/server/chat/chat.controller.ts` (new): `registerChatController(io, service)`.
- `src/server/chat/chat.controller.test.ts` (new): 53 Vitest integration cases (real Socket.IO server on an ephemeral loopback port, `socket.io-client` with the websocket transport, the real chat service over `SqliteMessageRepository` on a temporary DB file; stubbed services only for failure cases; no Next.js).
- `src/server/http/host-policy.ts` (new): `createHostPolicy(config)`, `normalizeHost(value)`.
- `src/server/http/host-policy.test.ts` (new): 107 Vitest unit cases (the policy is built from `parseConfig`, so HOST/PORT go through the real config normalization).
- No other source, spec, design, task, or config file changed. No new dependencies.

## API

```ts
// src/server/chat/chat.controller.ts
export const CHAT_ROOM = 'chat'
export type SendErrorCode = 'invalid_nickname' | 'invalid_text' | 'server_error'
export type SendAck =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: { code: SendErrorCode; message: string } }
export function registerChatController(io: Server, service: ChatService): void

// src/server/http/host-policy.ts
export type HostPolicy = {
  readonly allowedHosts: ReadonlySet<string>
  readonly allowedOrigins: ReadonlySet<string>
  isAllowedHost(value: unknown): boolean
  isAllowedOrigin(value: unknown): boolean
}
export function normalizeHost(value: unknown): string | null
export function createHostPolicy(config: Pick<ServerConfig, 'host' | 'port'>): HostPolicy
```

Controller flow per connection: `socket.join('chat')` → `service.historyFor(readLastSeenId(handshake.auth))` → `emit('history', …)` → `on('message:send')`. Send flow: `sendMessageSchema.safeParse` → on failure ack the mapped error; else `service.postMessage(parsed.data)` in `try` → on throw log and ack `server_error`; else `io.to('chat').emit('message:new', message)` and then ack `{ ok: true, message }`.

## Design choices

- **Error-code mapping (D2 contract, three codes only).** Any issue whose path starts with `nickname` → `invalid_nickname` (so nickname takes precedence when both fields are invalid; the precedence is computed explicitly, not taken from zod's issue order); otherwise an issue under `text` → `invalid_text`; an issue with an empty path (payload `null`, a string, a number, an array, or no payload at all) → `invalid_text` with the message `Invalid message payload.`. Reason: D2 defines no fourth client-error code, and adding one would change the accepted contract; `invalid_text` makes the client show a send error and keep the text. The ack `message` is the schema's message (e.g. `Message is required.`) or zod's type message. **Possible user decision:** a separate `invalid_payload` code would need a D2 change.
- **Lone surrogates.** Rejected by the schema (task 2.2) and mapped to `invalid_text` (text) or `invalid_nickname` (nickname); tested for high and low surrogates in text and a surrogate in the nickname.
- **Missing ack.** The handler takes `...args`; the ack is the last argument only if it is a function. Without an ack a valid message is still stored and broadcast (the ack is simply not called) and an invalid one is dropped; an ack-only emit (no payload) is answered with `invalid_text`. No crash in any case (tested).
- **Broadcast before ack.** `message:new` is emitted to the room (sender included) before the ack, so the sender already holds the message when the ack arrives (tested); stored before broadcast because `postMessage` is synchronous.
- **`lastSeenId` (rule (a)).** Only `typeof value === 'number' && Number.isSafeInteger(value) && value >= 0` counts; anything else (string, `null`, negative, fractional, boolean, object, array, above the safe range, missing) is passed to the service as `undefined`. The service repeats the check (task 3.2); a spy test pins that the controller itself passes `undefined`, so the controller check is not masked by the service's.
- **Service failure in `postMessage` (rule (c)).** Caught, logged with `console.error`, ack `server_error` with a fixed client message (`The message could not be saved. Please try again.`); the internal error text is not sent (tested). Only `postMessage` is inside the `try`, so a broadcast problem after a successful store is not misreported as `server_error`.
- **Service failure in `historyFor` (not specified by D2/D4).** Logged, the socket is disconnected (`disconnect(true)`), no `history` is sent, and the server keeps running; the client's reconnection retries. Tested. **Open for the user/checker:** this behavior is the maker's choice for an unspecified case. **[Superseded in round 2]** The claim that the client reconnects after `disconnect(true)` was false: socket.io-client gets `io server disconnect` and does not reconnect by itself (review F1). Round 2 closes the transport instead; see below.
- **Join and history in one tick.** `socket.join` on the default in-memory adapter is synchronous; `void` marks the ignored `Promise | void` return. With a future asynchronous adapter this would need to be awaited (D2 ordering argument).
- **Host policy normalization.** Allowlist entries and incoming values both go through `new URL("http://" + value).host` (lowercase, default port 80 omitted, IPv6 bracketed and compressed). Before parsing, incoming values must match a strict shape: letters/digits/dots/hyphens or a bracketed IPv6 literal, optionally `:` and a decimal port. This rejects userinfo (`evil@localhost:3000`), paths (`localhost:3000/x`, `\`), queries, fragments (also empty `?`/`#`, which `new URL` drops silently), whitespace, empty ports, and percent-encoding (spec review N24). Origins must start with `http://` (scheme case-insensitive) followed by such a host with nothing after it (a trailing `/` is rejected; browsers never send one).
- **Configured HOST (N23).** `createHostPolicy` takes the output of `parseConfig` (IPv6 without brackets) and re-brackets it with the existing `hostForUrl` from `config.ts`; no parsing is duplicated. The wildcard test runs on the normalized hostname (`0.0.0.0`, `[::]`), so `0`, `[::]`, and `0:0:0:0:0:0:0:0` are wildcards too. A configured host that cannot be normalized throws at startup (unreachable after `parseConfig`).
- **Missing Origin.** `isAllowedOrigin(undefined)` is `false`; accepting a handshake without an `Origin` (after the Host check) is the composition root's decision in task 4.2, as D2 describes. Documented in the type's doc comment.
- **IPv4 shorthand.** `127.1:3000` or `0x7f.1:3000` normalize to `127.0.0.1:3000` via the URL parser and are accepted. They are loopback addresses, and a DNS-rebinding page carries its own domain name in `Host`, so this does not widen the attack surface; not separately tested.

## Criteria → tests

`src/server/chat/chat.controller.test.ts`:

| Criterion | Test(s) |
|---|---|
| History `replace` on first connect | "sends replace with an empty list to the first client of an empty room"; "sends replace with the stored messages, oldest first, on first connect"; "sends replace with the latest 100 when more are stored" |
| Broadcast to another independent client and to the sender | "delivers a message to another independent client and to the sender, and acks the sender"; "broadcasts before acking, so the sender has the message when the ack arrives"; "delivers the stored (trimmed) values, with line breaks preserved"; "accepts text at the limit and a valid surrogate pair" |
| Two clients in quick succession: same order on both, matching server ids | "orders messages sent by two clients in quick succession identically on both, matching server ids" (four sends emitted before any ack is awaited; synchronized by acks and event counts, no sleeps) |
| Empty / whitespace / oversized text and invalid nickname rejected, ack error to sender only, nothing stored or broadcast | "rejects %s with an ack error to the sender only; nothing is stored or broadcast" (20 cases: empty, whitespace-only, 1001 after trimming, lone high/low surrogate, missing/non-string text, empty/whitespace/too-long/markup/lone-surrogate/missing/non-string nickname, both invalid, `{}`, `null`, string, number, array payload); "reports the schema message for the rejected field"; "rejects an ack-only emit (no payload) with invalid_text". Negative delivery is checked with a sentinel barrier: a later valid send from the same client must be the only event on every connection (`onAny`) and the only stored row. |
| Client ids/timestamps ignored | "ignores client-supplied ids, timestamps, and other extra fields" (id, createdAt from the server clock, exact key set, stored row) |
| Catch-up `append` with `lastSeenId` | "sends append with only the newer messages for a valid lastSeenId"; "sends append with an empty list to an up-to-date client"; "sends append with messages 11 to 110 when exactly 100 were missed" |
| `replace` with exactly 51–150 for `lastSeenId` 10 after 11–150 missed | "sends replace with exactly messages 51 to 150 when lastSeenId is 10 and 11 to 150 were missed" |
| Non-integer, negative, fractional, `null`, string `lastSeenId` treated as absent | "treats a lastSeenId that is %s as absent (replace with the latest 100)" (numeric string, non-numeric string, null, negative, fractional, boolean, object, array, above safe range; 105 stored so that absent → replace 6–105 differs from a valid 10 → append 11–105); "treats an empty auth object as an absent lastSeenId"; "passes a valid lastSeenId from the handshake to the service unchanged" (spy) |
| `lastSeenId` above the highest id → `replace` with the latest 100 | "sends replace with the latest messages when lastSeenId is greater than the highest stored id" (30 stored, 120); "sends replace with the latest 100 when lastSeenId is greater than the highest id of 150" |
| Stubbed `postMessage` throws → `server_error` ack, no `message:new`, server keeps running | "acks server_error, broadcasts nothing, and keeps running when postMessage throws" (a following connection and valid send succeed; the valid message is the only event on all three connections); "acks server_error when postMessage always throws, for every attempt" |
| Missing ack callback does not crash (review note) | "stores and broadcasts a valid message sent without an ack callback, and keeps running"; "drops an invalid payload sent without an ack callback without crashing" |
| `historyFor` failure (maker addition) | "disconnects the client and keeps running when reading the history fails" |

`src/server/http/host-policy.test.ts`:

| Criterion | Test(s) |
|---|---|
| Allowlist from `localhost`, `127.0.0.1`, `[::1]` | "allows localhost, 127.0.0.1, and [::1] on the configured port by default (HOST=127.0.0.1)" |
| Non-wildcard `HOST` added | "adds a non-wildcard HOST on the configured port"; "adds a LAN IPv4 HOST, which is then trusted (accepted residual risk)"; "adds an IPv6 HOST given unbracketed or bracketed …"; "does not duplicate an entry when HOST is one of the default hosts" |
| Wildcard `0.0.0.0` / `::` adds nothing | "adds nothing for the wildcard HOST %j" (`0.0.0.0`, `::`, `[::]`, `0:0:0:0:0:0:0:0`, `0`; also Host `0.0.0.0:<port>`/LAN address refused, own hosts accepted) |
| Normalization of uppercase hosts | "normalizes an uppercase HOST to lowercase"; normalizeHost cases `LOCALHOST:3000`, `LocalHost:3000`; isAllowedHost `LOCALHOST:3000`; isAllowedOrigin `http://LOCALHOST:3000`, `HTTP://localhost:3000` |
| Normalization of `PORT=80` | "omits the default port 80 from entries (PORT=80)"; "compares with PORT=80 in normalized form" (Host and Origin); normalizeHost `localhost:80` → `localhost` |
| `null`, missing, unparsable values | normalizeHost/isAllowedHost/isAllowedOrigin "rejects %j" (`null`, `undefined`, `''`, `'null'`, numbers, arrays, objects, `not a url`, `%%%`, `[::1`, `localhost:99999`, …) |
| Userinfo, path, query, fragment rejected (N24) | "rejects %j" for `evil@localhost:3000`, `user:pw@localhost:3000`, `localhost:3000/x`, `localhost:3000/`, `localhost:3000?x`, `localhost:3000?`, `localhost:3000#x`, `localhost:3000#`, `localhost:3000\x`, `localhost:3000@evil.example`, and the Origin equivalents |
| IPv6 handling (N23) | `[::1]:3000` and `[0:0:0:0:0:0:0:1]:3000` accepted; unbracketed `::1:3000` rejected; configured IPv6 HOST via `parseConfig` |

## Checks (all in `checks.txt`, in execution order)

- Red run 1 (both files, before any implementation file existed): each fails with `Cannot find module`, exit 1.
- Red run 2 (temporary stubs with the final exports; bodies throw or do nothing): host-policy fails at collection (`Tests no tests`), exit 1; controller 53 of 53 fail (timeouts waiting for history/acks), exit 1. The stubs were then overwritten by the implementation.
- Green attempt 1: host-policy 107/107, controller 53/53, exit 0 each (no failing green attempt occurred). Lint and typecheck exit 0 (these two early entries pipe through `tail` without `pipefail`; the final entries use `pipefail`).
- Mutation checks (helper `mut41.py`, body at the end of `checks.txt`; exact single-occurrence replacement, restore from the original bytes, SHA-256 before/after compared): M1 broadcast only to others, M2 skip validation, M3 wildcard HOST added, M4 no normalization, M5 no shape check (N24), M6 `lastSeenId` passed through unchecked, M7 service error not caught, M8 text issue takes precedence. All 8 mutants fail their test file (vitest exit 1) and every restore is identical (`restored identical: True`).
- Boundary probes (`eslint --stdin --stdin-filename`, project config): `chat.controller.ts` importing `better-sqlite3`, `./message.repository` (value import, and also `import type`), and `../db/sqlite` fail with exit 1; `host-policy.ts` importing `../../app/page` and `../app` fails with exit 1; allowed imports (socket.io type, schema, service type; `../config`) and the same restricted imports in `chat.controller.test.ts` pass with exit 0. `--print-config` of both files shows the expected effective option sets. Probe sources were written to a temporary file under `/tmp` and removed.
- Final: both new test files twice (160/160 each run), `npm run test:unit` (7 files, 382 tests), `npm run lint`, `npm run typecheck`, and `npm run check` (lint, typecheck, unit, `next build`, Playwright 2/2) all exit 0; narrow process check (`server.ts|next …|playwright|vitest`) shows none before and after.
- Whitespace: `git diff --check` (tracked) and `git diff --no-index --check /dev/null <file>` per untracked file, calibrated once on a scratch file with a trailing space (exit 3) and a clean one (exit 1); final newline check.

## Known limitations

- The Host/Origin checks are not wired yet: `host-policy.ts` is only unit-tested here; applying it to requests, upgrades, and `allowRequest` is task 4.2 (`app.ts`), including the missing-Origin acceptance.
- The controller tests use only the websocket transport; polling is covered by the task 4.2 tests and E2E.
- The `historyFor` failure behavior and the `invalid_text` mapping for non-object payloads are maker choices within the D2 contract (see Design choices); they may need a user decision.
- Controller tests assert that `console.error` was called in failure cases but do not pin the log text.

## Round 2 (after review round 1: findings F1–F4)

- Maker: the same Claude Code general-purpose subagent (maker) as round 1, returned to by the coordinator. Snapshot: `snapshot.txt` revision 2 (base `e9cf4ed`).
- **User decision, 2026-09-28**, relayed by the coordinator. The user answered the coordinator's recommendations with "так, приймаю, виправляй" (Ukrainian; translated: "yes, I accept, fix it"). This accepts:
  - (1) **Non-object payload → `invalid_text`.** A payload that is not an object (`null`, a string, a number, an array, or none at all) is rejected with `invalid_text` and the message "Invalid message payload." D2 keeps its three codes.
  - (2) **Both fields invalid → `invalid_nickname`.** The nickname error takes precedence.
  - (4) **Valid send without an ack callback is still processed.** It is stored and broadcast; the ack is simply not called.
  - (5) **IPv4 loopback shorthand is accepted.** `127.1`, `0x7f.1`, `2130706433`, and `0177.0.0.1` normalize to `127.0.0.1` through the URL parser. A new test pins this.
  - (3) **Changed.** When `historyFor` throws, the controller closes the transport (`socket.conn.close()`) instead of `socket.disconnect(true)`.
  - **F2 and F3 are fixed; F4 needs no action.**

### Changes

- **`chat.controller.ts` (F1, decision 3).** On a `historyFor` failure the controller logs the error, calls `socket.conn.close()`, and sends no `history`.
  - The client then sees `transport close` and reconnects on its normal backoff. It retries with a fresh handshake that carries its current `lastSeenId`.
  - The round-1 rationale ("the client reconnects with backoff" after `disconnect(true)`) was false. `disconnect(true)` gives the client `io server disconnect`, and socket.io-client does not reconnect automatically after that. The checker demonstrated this with a scratch script, and this round's red run (below) confirms it.
  - The code comment now states both facts.
  - Trade-off: if `historyFor` keeps failing, the client keeps reconnecting on backoff (`reconnectionDelayMax: 2000` in the browser, design D2). Each attempt is logged once on the server.
- **`chat.controller.test.ts` (F1).** The test "closes the transport when reading the history fails, so the client reconnects on its own and gets the history" replaces the round-1 test.
  - Setup: the stub's first `historyFor` call throws and later calls delegate to the real service. 2 messages are seeded. The client has reconnection enabled (`reconnectionDelay` 50 ms, `reconnectionDelayMax` 100 ms), and `connectClient` gained an optional client-options parameter for this.
  - Assertions:
    - the disconnect reason is `transport close`
    - no event arrives before the reconnect
    - `history` arrives on the same client socket without a manual `connect()`, equal to `replace` with the stored messages
    - the server saw exactly 2 connections, and `historyFor` was called twice
    - the client is connected, and one error was logged
    - a following send is acked with id 3

  Synchronization uses events only (`disconnect`, `history`, ack); there are no sleeps.
- **`chat.controller.test.ts` (F2).** "broadcasts before acking, so the sender has the message when the ack arrives" now reads `alice.messages.length` inside the ack callback (`socket.emit(..., callback)`) and asserts 1. socket.io-client runs the callback synchronously when it dispatches the ack packet, and it dispatches the packets of one connection in order.
- **`host-policy.ts` (F3).** `[::ffff:0:0]` (the IPv4-mapped `0.0.0.0`) is added to the wildcard hostnames.
- **`host-policy.test.ts` (F3, decision 5).**
  - The wildcard cases gain `::ffff:0.0.0.0`, `[::ffff:0:0]`, and `::FFFF:0:0`, and `[::ffff:0:0]:3000` is refused as a `Host`.
  - A new block "IPv4 shorthand (user decision 2026-09-28)" checks that `127.1:3000`, `0x7f.1:3000`, `2130706433:3000`, and `0177.0.0.1:3000` normalize to `127.0.0.1:3000` and are allowed, that `Origin: http://127.1:3000` is allowed, and that `127.2:3000` is refused.
  - Totals: host-policy 116 tests; the controller stays at 53.

### Criteria → tests (round-2 additions)

| Criterion | Test(s) |
|---|---|
| `historyFor` failure: transport close, automatic reconnect, history on the second connection (decision 3, F1) | "closes the transport when reading the history fails, so the client reconnects on its own and gets the history" |
| Broadcast strictly before the ack (F2) | "broadcasts before acking, so the sender has the message when the ack arrives" |
| IPv4-mapped wildcard adds nothing (F3) | "adds nothing for the wildcard HOST %j" with `::ffff:0.0.0.0`, `[::ffff:0:0]`, `::FFFF:0:0` |
| IPv4 shorthand accepted (decision 5) | "accepts the loopback shorthand Host %j as 127.0.0.1:3000"; "accepts the loopback shorthand Origin http://127.1:3000"; "does not accept a shorthand for a non-loopback address" |

### Round-2 checks (in `checks.txt` under "Round 2")

- **Red run.** The changed tests ran against the unchanged round-1 implementation; the entry records the round-1 hashes fbdf9313… and 4bedac3a…. 4 failed, 165 passed, exit 1:
  - the F1 test failed with `expected 'io server disconnect' to be 'transport close'`
  - 3 F3 wildcard cases failed (`[::ffff:0:0]:3000` was added)

  The F2 and shorthand tests passed on the correct round-1 code, as expected, because they pin existing behavior. The mutants below show that they fail when that behavior breaks.
- **Green attempt 1.** 169/169, exit 0.
- **Mutants.** Helper `mut42.py`; single exact replacement, restore from the original bytes, SHA-256 compared. All restores were identical (controller 77df3db7…, host-policy 8fb8749c…). All of these fail with vitest exit 1:
  - K1: broadcast deferred with `setImmediate`, killed by the F2 test
  - K1c: broadcast in `queueMicrotask`, so the ack goes out first in the same tick; killed by the F2 test
  - K1b: broadcast 20 ms after the ack, killed by the F2 test
  - R1: back to `disconnect(true)`, killed by the F1 test
  - R2: `[::ffff:0:0]` removed from the wildcards, killed by 3 F3 cases
  - R3: shorthand rejected; 11 failures, including the 5 shorthand tests. The mutant also breaks IPv6 compression, so it is broader than the shorthand alone.

  The round-1 mutants M1–M8 were re-run on the round-2 files. All were killed, and all restores were identical.
- **Final.** All exit 0:
  - both files 3 times (169/169 each)
  - `npm run test:unit` (7 files, 391 tests)
  - `npm run lint`
  - `npm run typecheck`
  - `npm run check` (lint, typecheck, unit, `next build`, Playwright 2/2)

  The narrow process check found nothing before or after. All round-2 entries use `set -o pipefail`.
- **Whitespace.** `git diff --check` and `git diff --no-index --check /dev/null <file>` per untracked file (the calibration from round 1 applies), plus a final newline check. This is the last entry in `checks.txt`.

### Remaining limitations

- The controller tests still use only the websocket transport. Wiring the host policy into requests, upgrades, and `allowRequest` is task 4.2.
- Reconnection was tested with test-only short delays, not with the browser client's settings (task 5.3).
