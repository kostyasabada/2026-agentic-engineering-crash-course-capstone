import type { ChatMessage } from '../../lib/chat/schema'

/** Payload of the server's `history` event (design D2). */
export type HistoryEvent = {
  mode: 'replace' | 'append'
  messages: ChatMessage[]
}

/**
 * Merges `incoming` into `current`: one entry per server id (a later copy of an id
 * replaces an earlier one, so the server's content wins), ordered by id, oldest first
 * (chat-room spec: ordered by the server identifier, never shown twice). Pure; the inputs
 * are not changed.
 */
export function mergeMessages(current: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>()
  for (const message of current) byId.set(message.id, message)
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/**
 * Applies a `history` event: `replace` shows only the server's messages (first
 * connection, more than 100 missed, or a stale last seen id); `append` adds the missed
 * messages to the current list.
 */
export function applyHistory(current: readonly ChatMessage[], history: HistoryEvent): ChatMessage[] {
  return mergeMessages(history.mode === 'replace' ? [] : current, history.messages)
}

/** The highest message id in the list (sent as `lastSeenId` on reconnection), if any. */
export function lastSeenIdOf(messages: readonly ChatMessage[]): number | undefined {
  let highest: number | undefined
  for (const message of messages) if (highest === undefined || message.id > highest) highest = message.id
  return highest
}
