import { z } from 'zod'

/**
 * Shared chat message schema.
 *
 * Length limits are measured in UTF-16 code units (JavaScript `string.length`)
 * after trimming leading and trailing whitespace. This module imports only
 * `zod` so it can be shared by browser and server code (see the layer rule).
 */

/** Maximum nickname length in UTF-16 code units, after trimming. */
export const NICKNAME_MAX_LENGTH = 32

/** Maximum message text length in UTF-16 code units, after trimming. */
export const MESSAGE_MAX_LENGTH = 1000

// Allowed nickname characters: Unicode letters, each optionally followed by
// combining marks (a mark is allowed only after a letter or after another mark
// that follows a letter), Unicode decimal digits, the space U+0020, hyphen,
// underscore, and period. Everything else (tabs, line breaks, markup,
// punctuation, emoji, non-decimal digits, a leading mark, a mark after a
// non-letter) is rejected. The pattern also matches the empty string so that
// an empty nickname reports only the "required" issue.
const NICKNAME_PATTERN = /^(?:\p{L}\p{M}*|[\p{Nd} _.-])*$/u

const NICKNAME_EMPTY_MESSAGE = 'Nickname is required.'
const NICKNAME_TOO_LONG_MESSAGE = `Nickname must be at most ${NICKNAME_MAX_LENGTH} characters.`
const NICKNAME_CHARS_MESSAGE =
  'Nickname may contain only letters, digits, spaces, hyphens (-), underscores (_), and periods (.).'

const MESSAGE_EMPTY_MESSAGE = 'Message is required.'
const MESSAGE_TOO_LONG_MESSAGE = `Message must be at most ${MESSAGE_MAX_LENGTH} characters.`

// zod's built-in `.min()`/`.max()` count Unicode code points, so length is
// checked here against `String.prototype.length` (UTF-16 code units) instead.

/** Nickname: trimmed, 1 to 32 UTF-16 code units, allowed characters only. */
export const nicknameSchema = z
  .string()
  .trim()
  .refine((value) => value.length >= 1, NICKNAME_EMPTY_MESSAGE)
  .refine((value) => value.length <= NICKNAME_MAX_LENGTH, NICKNAME_TOO_LONG_MESSAGE)
  .refine((value) => NICKNAME_PATTERN.test(value), NICKNAME_CHARS_MESSAGE)

/** Message text: trimmed, 1 to 1000 UTF-16 code units, inner content preserved. */
export const messageTextSchema = z
  .string()
  .trim()
  .refine((value) => value.length >= 1, MESSAGE_EMPTY_MESSAGE)
  .refine((value) => value.length <= MESSAGE_MAX_LENGTH, MESSAGE_TOO_LONG_MESSAGE)

/**
 * `message:send` payload. Unknown extra fields (client ids, timestamps) are
 * stripped by zod's default object behavior.
 */
export const sendMessageSchema = z.object({
  nickname: nicknameSchema,
  text: messageTextSchema,
})

/** Parsed send payload: exactly `{ nickname, text }` with trimmed values. */
export type SendMessageInput = z.infer<typeof sendMessageSchema>

/**
 * A stored chat message broadcast over Socket.IO (design D2). `id` and
 * `createdAt` (ISO 8601 UTC) are assigned by the server.
 */
export type ChatMessage = {
  id: number
  nickname: string
  text: string
  createdAt: string
}
