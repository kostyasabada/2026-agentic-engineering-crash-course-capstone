# Loop brief: add-realtime-chat-room-2-1

Task: 2.1 in `openspec/changes/add-realtime-chat-room/tasks.md` (shared message schema). The maker has written red-first unit tests in `src/lib/chat/schema.test.ts`. Your job is to implement `src/lib/chat/schema.ts` so that these tests, lint, and the type check pass.

## Owned files

- `src/lib/chat/schema.ts` (new file; the only file you may create or edit)

Do not edit `src/lib/chat/schema.test.ts`, specifications, configuration (`package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`), or any other file. Do not add dependencies; `zod` 4.6.5 is already installed (`import { z } from 'zod'`). Do not commit, push, or stage anything.

## Rules to implement (accepted user decisions; source: `openspec/changes/add-realtime-chat-room/specs/chat-room/spec.md`)

- Character counting: every length limit is measured in UTF-16 code units (JavaScript `string.length`) after trimming leading and trailing whitespace with `String.prototype.trim` semantics. Do not count code points or graphemes. A U+20000 character counts as 2.
- Nickname: trimmed; 1 to 32 units long after trimming; only Unicode letters (`\p{L}`), Unicode decimal digits (`\p{Nd}`), the space character U+0020, hyphen `-`, underscore `_`, and period `.`. Tabs, line breaks, and every other character are rejected. The parsed value is the trimmed nickname.
- Message text: trimmed; 1 to 1000 units long after trimming; inner line breaks and inner spaces are preserved exactly; the parsed value is the trimmed text. Markup is plain text (no escaping or transformation).
- Send payload (`message:send`): an object `{ nickname, text }` validated with the two rules above; unknown extra fields (client ids, timestamps) are stripped (zod's default object behavior, not `strict`/`passthrough`). An invalid nickname must produce issues whose `path[0]` is `'nickname'`; an invalid text, issues whose `path[0]` is `'text'`.
- Validation messages (used by the UI later): the too-long nickname message mentions `32`; the disallowed-character nickname message names the allowed characters and contains the words `letters` and `digits` (for example: "Nickname may contain only letters, digits, spaces, hyphens (-), underscores (_), and periods (.)"); the too-long message text message mentions `1000`. Keep messages short and in English.

## Exports the tests expect

```ts
export const NICKNAME_MAX_LENGTH: 32 (number)
export const MESSAGE_MAX_LENGTH: 1000 (number)
export const nicknameSchema      // zod schema: string -> trimmed string
export const messageTextSchema   // zod schema: string -> trimmed string
export const sendMessageSchema   // zod object { nickname: nicknameSchema, text: messageTextSchema }
export type SendMessageInput     // exactly { nickname: string; text: string } (z.infer of sendMessageSchema)
export type ChatMessage          // exactly { id: number; nickname: string; text: string; createdAt: string } (createdAt: ISO 8601 UTC, server-assigned; design D2)
```

## Constraints

- Layer rule (ESLint-enforced): files under `src/lib/**` must not import from `src/server/**` or `src/app/**`. The schema is shared by browser and server code, so it must import only `zod`.
- Keep it small and readable: a single module, no classes, no new abstractions beyond the exports above. Use the constants in the schemas and messages instead of repeating the numbers.
- Verify with `npm run lint`, `npm run typecheck`, and `npm run test:unit`. The loop runs the full checks (including browser E2E) itself.

## References (read only if needed)

- `openspec/changes/add-realtime-chat-room/specs/chat-room/spec.md`: requirements "Character counting", "Nickname entry without registration", "Message validation".
- `openspec/changes/add-realtime-chat-room/design.md`: D2 (Socket.IO contract and `ChatMessage`), D4 (module layout: `src/lib/chat/schema.ts`; boundary rules), P11 (zod 4.6.5), Q1/Q2 (resolved nickname and message rules).
