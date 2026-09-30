import { z } from 'zod'
import type { ChatMessage } from '../../lib/chat/schema'

/**
 * Shown when the server's `message:send` ack does not have the contract's shape (design D2).
 * The server may still have stored the message (its broadcast then shows it), so the text
 * says "not confirmed" rather than "not sent".
 */
export const INVALID_ACK = 'Message not confirmed: the server sent an invalid response.'

// Shape checks only (the server's zod schemas stay authoritative for the content rules).
const chatMessageShape = z.object({
  id: z.number().int(),
  nickname: z.string(),
  text: z.string(),
  createdAt: z.string(),
})

const sendAckShape = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), message: chatMessageShape }),
  z.object({ ok: z.literal(false), error: z.object({ message: z.string() }) }),
])

/** A send ack read for the composer: the accepted message, or the error text to show. */
export type SendAckResult = { ok: true; message: ChatMessage } | { ok: false; error: string }

/**
 * Reads an untrusted `message:send` ack (review finding F2 of task 5.2): a well-formed ok
 * ack yields its message (extra fields dropped), a well-formed error ack yields
 * `Message not sent: <server message>`, and anything else yields `INVALID_ACK`. Never throws.
 */
export function readSendAck(ack: unknown): SendAckResult {
  const parsed = sendAckShape.safeParse(ack)
  if (!parsed.success) return { ok: false, error: INVALID_ACK }
  if (!parsed.data.ok) return { ok: false, error: `Message not sent: ${parsed.data.error.message}` }
  return { ok: true, message: parsed.data.message }
}
