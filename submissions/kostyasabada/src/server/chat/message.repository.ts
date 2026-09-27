import type { Database, Statement } from 'better-sqlite3'
import type { ChatMessage } from '../../lib/chat/schema'

/** A message to store; the database assigns `id`, the service assigns `createdAt`. */
export type NewMessage = Omit<ChatMessage, 'id'>

/**
 * Chat message storage (design D3–D4). Synchronous on purpose: the history
 * read and the live broadcast happen in the same tick (design D2).
 */
export interface MessageRepository {
  /** Stores the message and returns it as stored, with the assigned `id`. */
  insert(message: NewMessage): ChatMessage
  /** The newest `limit` messages, ordered oldest first. */
  latest(limit: number): ChatMessage[]
  /** Up to `limit` messages with `id > lastSeenId`, ordered oldest first. */
  since(lastSeenId: number, limit: number): ChatMessage[]
}

type MessageRow = { id: number; nickname: string; text: string; created_at: string }

const COLUMNS = 'id, nickname, text, created_at'

function toMessage(row: MessageRow): ChatMessage {
  return { id: row.id, nickname: row.nickname, text: row.text, createdAt: row.created_at }
}

/** `MessageRepository` over an open connection from `openDatabase` (src/server/db/sqlite.ts). */
export class SqliteMessageRepository implements MessageRepository {
  private readonly insertStatement: Statement<[string, string, string], MessageRow>
  private readonly latestStatement: Statement<[number], MessageRow>
  private readonly sinceStatement: Statement<[number, number], MessageRow>

  constructor(db: Database) {
    // RETURNING yields the row as stored, so the returned message matches what
    // later reads return (the driver stores text as UTF-8).
    this.insertStatement = db.prepare<[string, string, string], MessageRow>(
      `INSERT INTO messages (nickname, text, created_at) VALUES (?, ?, ?) RETURNING ${COLUMNS}`,
    )
    this.latestStatement = db.prepare<[number], MessageRow>(
      `SELECT ${COLUMNS} FROM (SELECT ${COLUMNS} FROM messages ORDER BY id DESC LIMIT ?) ORDER BY id ASC`,
    )
    this.sinceStatement = db.prepare<[number, number], MessageRow>(
      `SELECT ${COLUMNS} FROM messages WHERE id > ? ORDER BY id ASC LIMIT ?`,
    )
  }

  insert({ nickname, text, createdAt }: NewMessage): ChatMessage {
    const row = this.insertStatement.get(nickname, text, createdAt)
    if (row === undefined) throw new Error('INSERT ... RETURNING returned no row')
    return toMessage(row)
  }

  latest(limit: number): ChatMessage[] {
    return this.latestStatement.all(limit).map(toMessage)
  }

  since(lastSeenId: number, limit: number): ChatMessage[] {
    return this.sinceStatement.all(lastSeenId, limit).map(toMessage)
  }
}
