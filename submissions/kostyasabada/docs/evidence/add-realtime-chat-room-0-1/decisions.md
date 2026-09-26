# Decisions: add-realtime-chat-room-0-1

Task 0.1 "Decisions gate" in `openspec/changes/add-realtime-chat-room/tasks.md`. Date: 2026-09-26. Source: the coordinator's conversation with the user, relayed to this maker by the coordinator. The question below is the coordinator's summary of what was presented, not a verbatim copy of the table the user saw.

## Question as presented

The coordinator presented the full list of design proposals P1–P22 plus open question Q11, grouped in a table, and asked whether to accept all or change something:

| Item | Proposal as presented (details in `design.md`) |
|---|---|
| P1 | Next.js 16.3.6 with the App Router; React and React DOM 19.3.0 |
| P2 | TypeScript `strict` plus `noUncheckedIndexedAccess` |
| P3 | Server Components by default; `'use client'` only for the interactive chat subtree |
| P4 | npm as package manager |
| P5 | `socket.io` / `socket.io-client` 4.8.4 on the same HTTP server, `destroyUpgrade: false` |
| P6 | `tsx` 4.23.15 runs `server.ts` in dev and production |
| P7 | Socket.IO events `message:send`, `message:new`, `history`, validated with zod |
| P8 | Database catch-up by `lastSeenId` instead of connection state recovery |
| P19 | `Host` allowlist on every request plus `Origin` check at the handshake |
| P9 / Q11 | SQLite driver `better-sqlite3` 13.0.3 |
| P11 | `zod` 4.6.5 shared schema |
| P10 | Module layout (design D4) |
| P20 | No HTML `maxlength`; live `n/1000` counter |
| P12 | ESLint 9 flat config with `eslint-config-next` |
| P13 | Vitest for unit and Node-level integration tests |
| P14 | npm scripts list (design D5) |
| P15 | Playwright configuration (design D6) |
| P16 | Agent loop interface (design D7) |
| P17 | `claude -p` with scoped permissions, `--max-budget-usd` 2 per run, no commit/push permission |
| P21 | `check:loop` per iteration, full `npm run check` once when green |
| P22 | Four stop reasons |
| P18 | `SessionStart` hook configuration (design D8) |

The coordinator pointed out P9 (SQLite driver) as the only real trade-off, recommending `better-sqlite3`, and P17's $2 per iteration (up to $10 per loop run with the default 5 iterations) as adjustable.

## User's reply

Verbatim (Ukrainian):

> приймаю всі, закоміть правило

English translation: "I accept all, commit the rule".

Scope: the first clause ("I accept all") answers this question. The second clause ("commit the rule") refers to a separate, already completed commit of the commit approval rule (task `setup-commit-approval`); it is not part of this task and does not authorize any commit of this task's changes.

## Resulting decisions

Each item is accepted as proposed in `openspec/changes/add-realtime-chat-room/design.md` (user decision, 2026-09-26, task 0.1):

| Item | Decision |
|---|---|
| P1 | Accepted as proposed |
| P2 | Accepted as proposed |
| P3 | Accepted as proposed |
| P4 | Accepted as proposed |
| P5 | Accepted as proposed |
| P6 | Accepted as proposed |
| P7 | Accepted as proposed |
| P8 | Accepted as proposed |
| P9 | Accepted as proposed (`better-sqlite3` 13.0.3) |
| P10 | Accepted as proposed |
| P11 | Accepted as proposed |
| P12 | Accepted as proposed |
| P13 | Accepted as proposed |
| P14 | Accepted as proposed |
| P15 | Accepted as proposed |
| P16 | Accepted as proposed |
| P17 | Accepted as proposed (budget default unchanged: $2 per Claude run) |
| P18 | Accepted as proposed |
| P19 | Accepted as proposed (the Host/Origin requirement's mechanism is unchanged, so no spec update) |
| P20 | Accepted as proposed (the chat-room spec's no-truncation rule is unchanged, so no spec update) |
| P21 | Accepted as proposed |
| P22 | Accepted as proposed |
| Q11 | Resolved: `better-sqlite3` 13.0.3 |

No answer changes the approach, so proposal, specs, and tasks need no update. Open questions Q8 (Codex `SessionStart` parity), Q10 (retention), and Q12 (E2E technique for catch-up while the server stays up) remain open and deferrable; they were not part of this question.
