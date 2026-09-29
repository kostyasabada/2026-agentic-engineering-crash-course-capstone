'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ChatMessage } from '../../lib/chat/schema'
import { applyHistory, lastSeenIdOf, mergeMessages, type HistoryEvent } from './merge-messages'

/** Acknowledgement timeout of `message:send` (design D2). */
export const SEND_TIMEOUT_MS = 5_000

/** Upper bound of Socket.IO's reconnection backoff (design D2, Q5). */
const RECONNECTION_DELAY_MAX_MS = 2_000

/** Ack of `message:send` as sent by the server (design D2 contract). */
type SendAck =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: { code: 'invalid_nickname' | 'invalid_text' | 'server_error'; message: string } }

/** Outcome of a send for the composer: on failure, a message to show (the text is kept). */
export type SendResult = { ok: true } | { ok: false; error: string }

export type ChatSocket = {
  /** Messages ordered by server id, oldest first, each id once. */
  messages: ChatMessage[]
  /** Whether the socket is connected; sending is possible only then. */
  connected: boolean
  /** Sends `{ nickname, text }` and resolves when the server acknowledges it or the timeout passes. */
  send: (nickname: string, text: string) => Promise<SendResult>
}

const NOT_CONNECTED = 'Message not sent: not connected to the server.'
const TIMED_OUT = `Message not sent: the server did not confirm it within ${SEND_TIMEOUT_MS / 1000} seconds.`

/**
 * One Socket.IO connection for the chat room (design D2). The socket is created in an
 * effect, so nothing runs during server rendering, and it is closed on unmount.
 * - `history` (`replace` / `append`) and `message:new` are merged by id (merge-messages.ts);
 *   an accepted send's ack message is merged too, so the sender's own message is shown
 *   once even if the broadcast and the ack both arrive.
 * - The handshake `auth` is a function, so every reconnection sends the current highest
 *   id as `lastSeenId` and receives only the missed messages.
 * - Task 5.3 extends `connected` to the Connected / Reconnecting / Disconnected status
 *   from the manager's reconnect events; the listeners are registered here.
 */
export function useChatSocket(): ChatSocket {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const lastSeenIdRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    lastSeenIdRef.current = lastSeenIdOf(messages)
  }, [messages])

  useEffect(() => {
    // Same origin as the page; the server checks Host and Origin (design D2, P19).
    const socket = io({
      auth: (callback) => {
        const lastSeenId = lastSeenIdRef.current
        callback(lastSeenId === undefined ? {} : { lastSeenId })
      },
      reconnectionDelayMax: RECONNECTION_DELAY_MAX_MS,
    })
    socketRef.current = socket
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('history', (history: HistoryEvent) => setMessages((current) => applyHistory(current, history)))
    socket.on('message:new', (message: ChatMessage) => setMessages((current) => mergeMessages(current, [message])))
    return () => {
      socketRef.current = null
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [])

  const send = useCallback(async (nickname: string, text: string): Promise<SendResult> => {
    const socket = socketRef.current
    if (!socket?.connected) return { ok: false, error: NOT_CONNECTED }
    let ack: SendAck
    try {
      ack = await socket.timeout(SEND_TIMEOUT_MS).emitWithAck('message:send', { nickname, text })
    } catch {
      return { ok: false, error: TIMED_OUT }
    }
    if (!ack.ok) return { ok: false, error: `Message not sent: ${ack.error.message}` }
    setMessages((current) => mergeMessages(current, [ack.message]))
    return { ok: true }
  }, [])

  return { messages, connected, send }
}
