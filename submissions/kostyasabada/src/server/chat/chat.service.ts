import type { ChatMessage, SendMessageInput } from '../../lib/chat/schema'
// Type-only import: the SQLite implementation in the same module is not loaded by the
// service at runtime (design D4).
import type { MessageRepository } from './message.repository'

/** Number of messages in a full history (spec: "Recent history for a joining client"). */
export const HISTORY_LIMIT = 100

/** Payload of the `history` event (design D2). */
export type ChatHistory = {
  mode: 'replace' | 'append'
  messages: ChatMessage[]
}

export type ChatService = {
  /**
   * Stores a message and returns it as stored. `input` must already be parsed with
   * `sendMessageSchema` (trimmed and validated); the controller does that and maps
   * validation failures to ack error codes (design D2, D4). Repository errors propagate.
   */
  postMessage(input: SendMessageInput): ChatMessage
  /**
   * The history/catch-up rule of design D2 for a (re)connecting client. Repository
   * errors propagate.
   */
  historyFor(lastSeenId?: number): ChatHistory
}

export type ChatServiceOptions = {
  /** Clock for `createdAt`; defaults to the current time. */
  now?: () => Date
}

// Fetching one more than the history limit tells "at most 100 missed" apart from
// "more than 100 missed" without counting rows.
const CATCH_UP_PROBE_LIMIT = HISTORY_LIMIT + 1

/**
 * Chat business rules (design D2–D4). Depends only on the `MessageRepository`
 * interface; knows neither Socket.IO nor SQLite.
 */
export function createChatService(
  repository: MessageRepository,
  { now = () => new Date() }: ChatServiceOptions = {},
): ChatService {
  const replaceWithLatest = (): ChatHistory => ({
    mode: 'replace',
    messages: repository.latest(HISTORY_LIMIT),
  })

  return {
    postMessage({ nickname, text }) {
      // Server-assigned timestamp: ISO 8601 UTC with milliseconds (design D3, rule (e)).
      return repository.insert({ nickname, text, createdAt: now().toISOString() })
    },

    historyFor(lastSeenId) {
      // The controller already treats anything but a non-negative integer as absent
      // (rule (a)); the service repeats the check so that no other caller can pass
      // NaN, a negative, or a fractional id to the repository.
      if (lastSeenId === undefined || !Number.isSafeInteger(lastSeenId) || lastSeenId < 0) {
        return replaceWithLatest()
      }

      const missed = repository.since(lastSeenId, CATCH_UP_PROBE_LIMIT)
      if (missed.length > HISTORY_LIMIT) return replaceWithLatest()
      if (missed.length > 0) return { mode: 'append', messages: missed }

      // Nothing newer: either the client is up to date, or its lastSeenId is greater
      // than the highest stored id (database reset), which is treated as absent (rule (b)).
      const highestId = repository.latest(1)[0]?.id ?? 0
      if (lastSeenId > highestId) return replaceWithLatest()
      return { mode: 'append', messages: [] }
    },
  }
}
