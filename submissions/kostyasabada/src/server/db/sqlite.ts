import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import BetterSqlite3, { type Database } from 'better-sqlite3'

// `AUTOINCREMENT` guarantees that ids are never reused, even after the newest
// row is deleted (design D3). `created_at` has no default: the chat service
// assigns it (ISO 8601 UTC).
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`

/**
 * Opens the SQLite database at `path` (resolved against the working directory),
 * creating its parent directory if missing, enabling WAL journal mode, and
 * creating the schema idempotently (design D3). The default `synchronous`
 * setting (`FULL`) is kept.
 */
export function openDatabase(path: string): Database {
  mkdirSync(dirname(path), { recursive: true })
  const db = new BetterSqlite3(path)
  try {
    db.pragma('journal_mode = WAL')
    db.exec(SCHEMA)
  } catch (error) {
    db.close()
    throw error
  }
  return db
}

/** Closes a connection opened by `openDatabase`. */
export function closeDatabase(db: Database): void {
  db.close()
}
