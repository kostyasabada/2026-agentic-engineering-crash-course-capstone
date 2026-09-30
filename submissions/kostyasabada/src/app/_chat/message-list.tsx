'use client'

import { useLayoutEffect, useRef, type UIEvent } from 'react'
import type { ChatMessage } from '../../lib/chat/schema'

/** Shown once the history has arrived and the room has no messages (chat-room spec, "Empty room"). */
export const EMPTY_HINT = 'No messages yet.'

/**
 * The list counts as "at the bottom" (viewing the newest message) while its remaining scroll
 * distance is at most this many pixels, so sub-pixel rounding and a few pixels of manual
 * scrolling do not stop the auto-scroll.
 */
const AT_BOTTOM_THRESHOLD_PX = 16

/** Local time as `HH:MM` (design Q3), independent of the locale's time format. */
function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

type MessageListProps = {
  /** Ordered by server id, oldest first (see merge-messages.ts). */
  messages: readonly ChatMessage[]
  /** Whether the first `history` event has arrived; the empty-room hint is shown only then. */
  historyLoaded: boolean
}

/**
 * The conversation. Nicknames and texts are React text children only (no
 * `dangerouslySetInnerHTML`, Markdown, or links; design D4, Q6); `white-space: pre-wrap`
 * on the text keeps its line breaks. Messages exist only after the socket delivered them
 * in the browser, so the local time formatting never runs during server rendering.
 *
 * Scrolling (design Q4): the list is its own scroll container (globals.css), focusable with
 * the keyboard (`tabIndex={0}`: arrow keys, Page Up/Down, Home/End; Tab moves on). The
 * newest message is at the bottom. After every change of the messages (the history on
 * join, a new message, a catch-up) the list is scrolled to the bottom if it was at the
 * bottom before the change (`atBottomRef`, updated by the person's scrolling); otherwise its
 * scroll position is left where the person put it. This applies to the person's own sent
 * messages too. A new list (first render, or after the room was empty) starts at the bottom.
 */
export function MessageList({ messages, historyLoaded }: MessageListProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const atBottomRef = useRef(true)

  // Runs after the DOM update and before the browser paints, so the new content is never
  // shown at the old position first.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) {
      atBottomRef.current = true
      return
    }
    if (atBottomRef.current) list.scrollTop = list.scrollHeight
  }, [messages])

  function handleScroll(event: UIEvent<HTMLOListElement>) {
    const list = event.currentTarget
    atBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= AT_BOTTOM_THRESHOLD_PX
  }

  if (messages.length === 0) {
    return historyLoaded ? <p className="message-list__empty">{EMPTY_HINT}</p> : null
  }

  return (
    <ol ref={listRef} className="message-list" aria-label="Messages" tabIndex={0} onScroll={handleScroll}>
      {messages.map((message) => {
        const createdAt = new Date(message.createdAt)
        return (
          <li key={message.id} className="message">
            <p className="message__meta">
              <span className="message__author">{message.nickname}</span>{' '}
              <time dateTime={message.createdAt} title={createdAt.toLocaleString()}>
                {formatTime(createdAt)}
              </time>
            </p>
            <p className="message__text">{message.text}</p>
          </li>
        )
      })}
    </ol>
  )
}
