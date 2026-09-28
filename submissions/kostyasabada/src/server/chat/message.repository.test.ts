import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../db/sqlite'
import { SqliteMessageRepository, type NewMessage } from './message.repository'

let dir: string
let openHandles: Database[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chat-repo-test-'))
  openHandles = []
})

afterEach(() => {
  for (const db of openHandles) if (db.open) closeDatabase(db)
  rmSync(dir, { recursive: true, force: true })
})

/** Opens a database in the test's temporary directory and tracks it for closing. */
function open(path = join(dir, 'chat.sqlite')): Database {
  const db = openDatabase(path)
  openHandles.push(db)
  return db
}

/** Message number `n` with a distinct nickname, text, and millisecond timestamp. */
function message(n: number): NewMessage {
  return {
    nickname: `user${n}`,
    text: `message ${n}`,
    createdAt: new Date(Date.UTC(2026, 8, 26, 12, 0, 0, n)).toISOString(),
  }
}

function insertMany(repo: SqliteMessageRepository, count: number): void {
  for (let n = 1; n <= count; n++) repo.insert(message(n))
}

describe('SqliteMessageRepository', () => {
  it('assigns increasing ids and returns the stored message', () => {
    const repo = new SqliteMessageRepository(open())
    const first = repo.insert(message(1))
    const second = repo.insert(message(2))
    expect(first).toEqual({ id: 1, ...message(1) })
    expect(second).toEqual({ id: 2, ...message(2) })
    expect(second.id).toBeGreaterThan(first.id)
  })

  it('never reuses the id of a deleted newest row (AUTOINCREMENT)', () => {
    const db = open()
    const repo = new SqliteMessageRepository(db)
    repo.insert(message(1))
    const newest = repo.insert(message(2))
    // Test-only raw delete; the repository does not expose deletion.
    const deleted = db.prepare('DELETE FROM messages WHERE id = ?').run(newest.id)
    expect(deleted.changes).toBe(1)
    const next = repo.insert(message(3))
    expect(next.id).toBeGreaterThan(newest.id)
    expect(repo.latest(100).map((m) => m.id)).toEqual([1, next.id])
  })

  it('stores and returns the given createdAt unchanged', () => {
    const repo = new SqliteMessageRepository(open())
    const createdAt = '2026-09-26T12:00:00.123Z'
    const stored = repo.insert({ nickname: 'Ann', text: 'hi', createdAt })
    expect(stored.createdAt).toBe(createdAt)
    expect(repo.latest(1)).toEqual([{ id: stored.id, nickname: 'Ann', text: 'hi', createdAt }])
  })

  it('latest(100) after 105 inserts returns messages 6-105 oldest first', () => {
    const repo = new SqliteMessageRepository(open())
    insertMany(repo, 105)
    const latest = repo.latest(100)
    expect(latest).toHaveLength(100)
    expect(latest.map((m) => m.id)).toEqual(Array.from({ length: 100 }, (_, i) => i + 6))
    expect(latest[0]).toEqual({ id: 6, ...message(6) })
    expect(latest[99]).toEqual({ id: 105, ...message(105) })
  })

  it('latest(100) returns all messages oldest first when there are fewer than 100', () => {
    const repo = new SqliteMessageRepository(open())
    expect(repo.latest(100)).toEqual([])
    insertMany(repo, 3)
    expect(repo.latest(100)).toEqual([1, 2, 3].map((n) => ({ id: n, ...message(n) })))
  })

  it('since(lastSeenId, 101) returns only newer rows oldest first', () => {
    const repo = new SqliteMessageRepository(open())
    insertMany(repo, 10)
    expect(repo.since(7, 101)).toEqual([8, 9, 10].map((n) => ({ id: n, ...message(n) })))
    expect(repo.since(0, 101).map((m) => m.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(repo.since(10, 101)).toEqual([])
    expect(repo.since(99, 101)).toEqual([])
  })

  it('since(lastSeenId, 101) stops at the limit, taking the oldest newer rows', () => {
    const repo = new SqliteMessageRepository(open())
    insertMany(repo, 150)
    const rows = repo.since(10, 101)
    expect(rows.map((m) => m.id)).toEqual(Array.from({ length: 101 }, (_, i) => i + 11))
  })

  it('keeps control characters in text unchanged', () => {
    const repo = new SqliteMessageRepository(open())
    const text = 'a\u0000b\u0007c\u001Fd\u007Fe\r\nf'
    const stored = repo.insert({ ...message(1), text })
    expect(stored.text).toBe(text)
    expect(repo.latest(1)[0]?.text).toBe(text)
  })

  it('records the driver behavior for lone surrogates: replaced by U+FFFD', () => {
    // Observed behavior of better-sqlite3 13.0.3, not a spec rule: strings are
    // converted to UTF-8, and a lone surrogate becomes U+FFFD. insert() returns
    // the stored row, so the returned and later read texts agree. Since task
    // 2.2 the shared schema rejects such text upstream (reported to the sender
    // as `invalid_text`, design D2), so accepted messages never reach the
    // repository with lone surrogates; this test only records the driver
    // behavior below that validation.
    const repo = new SqliteMessageRepository(open())
    const stored = repo.insert({ ...message(1), text: 'a\uD800b\uDC00c' })
    expect(stored.text).toBe('a�b�c')
    expect(repo.latest(1)[0]?.text).toBe('a�b�c')
    const pair = repo.insert({ ...message(2), text: 'a😀b' })
    expect(pair.text).toBe('a😀b')
  })
})

describe('openDatabase', () => {
  it('keeps data after closing and reopening the file', () => {
    const path = join(dir, 'chat.sqlite')
    const first = open(path)
    const written = [1, 2, 3].map((n) => new SqliteMessageRepository(first).insert(message(n)))
    closeDatabase(first)
    expect(first.open).toBe(false)

    const reopened = new SqliteMessageRepository(open(path))
    expect(reopened.latest(100)).toEqual(written)
    expect(reopened.insert(message(4)).id).toBe(4)
  })

  it('creates the schema idempotently when the same file is opened twice', () => {
    const path = join(dir, 'chat.sqlite')
    const first = open(path)
    new SqliteMessageRepository(first).insert(message(1))
    // A second handle on the same file while the first is still open.
    const second = open(path)
    const tables = second
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'")
      .all()
    expect(tables).toHaveLength(1)
    expect(new SqliteMessageRepository(second).latest(100)).toEqual([{ id: 1, ...message(1) }])
    closeDatabase(second)
    closeDatabase(first)
    // And again after both handles were closed.
    expect(new SqliteMessageRepository(open(path)).latest(100)).toEqual([{ id: 1, ...message(1) }])
  })

  it('creates a missing parent directory', () => {
    const path = join(dir, 'missing', 'nested', 'chat.sqlite')
    expect(existsSync(join(dir, 'missing'))).toBe(false)
    const repo = new SqliteMessageRepository(open(path))
    repo.insert(message(1))
    expect(existsSync(path)).toBe(true)
  })

  it('uses WAL journal mode', () => {
    const db = open()
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
  })
})
