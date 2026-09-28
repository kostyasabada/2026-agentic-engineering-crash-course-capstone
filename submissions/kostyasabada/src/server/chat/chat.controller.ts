import type { Server, Socket } from 'socket.io'
import { sendMessageSchema, type ChatMessage } from '../../lib/chat/schema'
import type { ChatHistory, ChatService } from './chat.service'

/**
 * Socket.IO transport for the chat (design D2, D4). Knows Socket.IO and the shared
 * schema; persistence and the history/catch-up rule belong to the injected service.
 */

/** The single chat room every connection joins. */
export const CHAT_ROOM = 'chat'

/** Ack error codes of the `message:send` contract (design D2). */
export type SendErrorCode = 'invalid_nickname' | 'invalid_text' | 'server_error'

/** Ack of `message:send` (design D2). */
export type SendAck =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: { code: SendErrorCode; message: string } }

const INVALID_PAYLOAD_MESSAGE = 'Invalid message payload.'
const SERVER_ERROR_MESSAGE = 'The message could not be saved. Please try again.'

/**
 * Registers the chat `connection` handler on `io`: reads `lastSeenId` from the handshake
 * `auth`, joins the room, emits `history`, and handles `message:send`.
 */
export function registerChatController(io: Server, service: ChatService): void {
  io.on('connection', (socket) => {
    // Join and history read happen in the same tick as the synchronous service call, so
    // no broadcast can slip between them (design D2). The default in-memory adapter
    // joins synchronously.
    void socket.join(CHAT_ROOM)
    let history: ChatHistory
    try {
      history = service.historyFor(readLastSeenId(socket.handshake.auth))
    } catch (error) {
      // No history to send: log and close the underlying transport. The client sees
      // `transport close` and reconnects on its normal backoff, asking again with a new
      // handshake. (A server-side `socket.disconnect(true)` would give the client
      // `io server disconnect`, after which socket.io-client does not reconnect by itself.)
      // The server keeps running.
      console.error('Chat history could not be read', error)
      socket.conn.close()
      return
    }
    socket.emit('history', history)

    socket.on('message:send', (...args: unknown[]) => {
      // The ack is the last argument when the client passed one; it may be missing.
      const last = args.at(-1)
      const ack = typeof last === 'function' ? (args.pop() as (response: SendAck) => void) : undefined
      const response = handleSend(io, service, args[0])
      ack?.(response)
    })
  })
}

/** Rule (a) of design D4: only a non-negative safe integer counts; anything else is absent. */
function readLastSeenId(auth: Socket['handshake']['auth']): number | undefined {
  const value: unknown = typeof auth === 'object' && auth !== null ? (auth as Record<string, unknown>).lastSeenId : undefined
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function handleSend(io: Server, service: ChatService, payload: unknown): SendAck {
  const parsed = sendMessageSchema.safeParse(payload)
  if (!parsed.success) {
    // A nickname issue takes precedence over a text issue. An issue with an empty path
    // (a payload that is not an object) is reported as `invalid_text`: the contract has
    // no other client-error code (design D2), and the send cannot be accepted.
    const nicknameIssue = parsed.error.issues.find((issue) => issue.path[0] === 'nickname')
    if (nicknameIssue) return rejection('invalid_nickname', nicknameIssue.message)
    const textIssue = parsed.error.issues.find((issue) => issue.path[0] === 'text')
    return rejection('invalid_text', textIssue?.message ?? INVALID_PAYLOAD_MESSAGE)
  }

  let message: ChatMessage
  try {
    message = service.postMessage(parsed.data)
  } catch (error) {
    // Rule (c) of design D4: nothing is broadcast; the internal error is only logged.
    console.error('Chat message could not be stored', error)
    return rejection('server_error', SERVER_ERROR_MESSAGE)
  }

  // Stored before broadcast; the sender is in the room and receives it too.
  io.to(CHAT_ROOM).emit('message:new', message)
  return { ok: true, message }
}

function rejection(code: SendErrorCode, message: string): SendAck {
  return { ok: false, error: { code, message } }
}
