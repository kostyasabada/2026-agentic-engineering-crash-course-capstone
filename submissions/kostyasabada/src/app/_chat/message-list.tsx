'use client'

import type { ChatMessage } from '../../lib/chat/schema'

/** Local time as `HH:MM` (design Q3), independent of the locale's time format. */
function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

type MessageListProps = {
  /** Ordered by server id, oldest first (see merge-messages.ts). */
  messages: readonly ChatMessage[]
}

/**
 * The conversation. Nicknames and texts are React text children only (no
 * `dangerouslySetInnerHTML`, Markdown, or links; design D4, Q6); `white-space: pre-wrap`
 * on the text keeps its line breaks. Messages exist only after the socket delivered them
 * in the browser, so the local time formatting never runs during server rendering.
 */
export function MessageList({ messages }: MessageListProps) {
  return (
    <ol className="message-list" aria-label="Messages">
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
