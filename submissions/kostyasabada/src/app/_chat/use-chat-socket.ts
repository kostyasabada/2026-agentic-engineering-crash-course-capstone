'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ChatMessage } from '../../lib/chat/schema'
import { applyHistory, lastSeenIdOf, mergeMessages, type HistoryEvent } from './merge-messages'
import { readSendAck } from './send-ack'

/** Acknowledgement timeout of `message:send` (design D2). */
export const SEND_TIMEOUT_MS = 5_000

/** Upper bound of Socket.IO's reconnection backoff (design D2, Q5). */
const RECONNECTION_DELAY_MAX_MS = 2_000

/** Connection state shown to the person (chat-room spec, design D2 and Q5); the exact label texts. */
export type ConnectionStatus = 'Connected' | 'Reconnecting' | 'Disconnected'

/** Outcome of a send for the composer: on failure, a message to show (the text is kept). */
export type SendResult = { ok: true } | { ok: false; error: string }

export type ChatSocket = {
  /** Messages ordered by server id, oldest first, each id once. */
  messages: ChatMessage[]
  /** Whether a `history` event has arrived since the page loaded (the room's state is known). */
  historyLoaded: boolean
  /** The current connection status. */
  status: ConnectionStatus
  /** Whether the socket is connected (`status === 'Connected'`); sending is possible only then. */
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
 * - Status (design D2): `connect` → `Connected`. On `disconnect`, `socket.active` tells
 *   whether socket.io-client will reconnect by itself: yes (`transport close`, `ping
 *   timeout`, e.g. a stopped server) → `Reconnecting`; no (`io server disconnect`, a
 *   session ended by the server) → `Disconnected`, terminal until the page is reloaded,
 *   because D2 maps "reconnection not attempted" to `Disconnected` and the server ends a
 *   session only deliberately (its controller closes the transport instead, so its clients
 *   reconnect). The manager's `reconnect_attempt` → `Reconnecting` (also while the first
 *   connection is retried) and `reconnect_failed` (attempts exhausted; with the default
 *   unlimited attempts this does not happen) → `Disconnected`; a `connect_error` after which
 *   the socket is no longer active (a server middleware refused it) → `Disconnected`.
 *   Before the first connection the status is `Disconnected`. The manager listeners are
 *   registered and removed in the same effect as the socket's.
 * - Reconnection uses Socket.IO's backoff, capped at 2 s (`reconnectionDelayMax`, design
 *   D2 and Q5); nothing is queued while offline (the composer disables sending).
 */
export function useChatSocket(): ChatSocket {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus>('Disconnected')
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
    const manager = socket.io
    const onReconnectAttempt = () => setStatus('Reconnecting')
    const onReconnectFailed = () => setStatus('Disconnected')
    socket.on('connect', () => setStatus('Connected'))
    socket.on('disconnect', () => setStatus(socket.active ? 'Reconnecting' : 'Disconnected'))
    socket.on('connect_error', () => {
      if (!socket.active) setStatus('Disconnected')
    })
    manager.on('reconnect_attempt', onReconnectAttempt)
    manager.on('reconnect_failed', onReconnectFailed)
    socket.on('history', (history: HistoryEvent) => {
      setMessages((current) => applyHistory(current, history))
      setHistoryLoaded(true)
    })
    socket.on('message:new', (message: ChatMessage) => setMessages((current) => mergeMessages(current, [message])))
    return () => {
      socketRef.current = null
      socket.removeAllListeners()
      manager.off('reconnect_attempt', onReconnectAttempt)
      manager.off('reconnect_failed', onReconnectFailed)
      socket.disconnect()
    }
  }, [])

  const send = useCallback(async (nickname: string, text: string): Promise<SendResult> => {
    const socket = socketRef.current
    if (!socket?.connected) return { ok: false, error: NOT_CONNECTED }
    let rawAck: unknown
    try {
      rawAck = await socket.timeout(SEND_TIMEOUT_MS).emitWithAck('message:send', { nickname, text })
    } catch {
      return { ok: false, error: TIMED_OUT }
    }
    // The ack is untrusted input: a malformed one is a failure, never an exception.
    const ack = readSendAck(rawAck)
    if (!ack.ok) return ack
    setMessages((current) => mergeMessages(current, [ack.message]))
    return { ok: true }
  }, [])

  return { messages, historyLoaded, status, connected: status === 'Connected', send }
}
