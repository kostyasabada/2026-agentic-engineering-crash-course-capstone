import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, SendMessageInput } from '../../lib/chat/schema'
import { createChatService, HISTORY_LIMIT } from './chat.service'
import type { MessageRepository, NewMessage } from './message.repository'

// The only limits the service may pass to the repository (the repository does not
// validate `limit`; a negative value would return every row). The fake throws on any
// other value so that misuse fails the test instead of silently returning data.
const LATEST_LIMITS = [100, 1]
const SINCE_LIMITS = [101]

type Call = { method: 'insert' | 'latest' | 'since'; args: unknown[] }

/** In-memory `MessageRepository` with `AUTOINCREMENT`-like ids and limit guards. */
class FakeMessageRepository implements MessageRepository {
  readonly rows: ChatMessage[] = []
  readonly calls: Call[] = []
  private nextId = 1

  insert(message: NewMessage): ChatMessage {
    this.calls.push({ method: 'insert', args: [message] })
    const stored = { id: this.nextId++, ...message }
    this.rows.push(stored)
    return { ...stored }
  }

  latest(limit: number): ChatMessage[] {
    this.calls.push({ method: 'latest', args: [limit] })
    if (!LATEST_LIMITS.includes(limit)) throw new Error(`unexpected latest limit ${limit}`)
    return this.rows.slice(-limit).map((row) => ({ ...row }))
  }

  since(lastSeenId: number, limit: number): ChatMessage[] {
    this.calls.push({ method: 'since', args: [lastSeenId, limit] })
    if (!SINCE_LIMITS.includes(limit)) throw new Error(`unexpected since limit ${limit}`)
    if (!Number.isSafeInteger(lastSeenId) || lastSeenId < 0) {
      throw new Error(`unexpected lastSeenId ${String(lastSeenId)}`)
    }
    return this.rows
      .filter((row) => row.id > lastSeenId)
      .slice(0, limit)
      .map((row) => ({ ...row }))
  }

  /** Stores messages numbered 1..count ("message 1" has id 1). */
  seed(count: number): void {
    for (let n = 1; n <= count; n++) {
      this.insert({ nickname: 'seed', text: `message ${n}`, createdAt: '2026-09-26T12:00:00.000Z' })
    }
    this.calls.length = 0
  }
}

const FIXED_TIME = '2026-09-26T12:00:00.123Z'
const fixedClock = () => new Date(FIXED_TIME)

function setup(count = 0) {
  const repository = new FakeMessageRepository()
  repository.seed(count)
  const service = createChatService(repository, { now: fixedClock })
  return { repository, service }
}

/** The ids 'from'..'to' inclusive. */
function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

function ids(messages: ChatMessage[]): number[] {
  return messages.map((message) => message.id)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('in-memory repository fake', () => {
  it('rejects limits the service must never pass', () => {
    const repository = new FakeMessageRepository()
    expect(() => repository.latest(-1)).toThrow('unexpected latest limit -1')
    expect(() => repository.latest(101)).toThrow('unexpected latest limit 101')
    expect(() => repository.since(0, 100)).toThrow('unexpected since limit 100')
    expect(() => repository.since(-1, 101)).toThrow('unexpected lastSeenId -1')
  })
})

describe('postMessage', () => {
  it('stores the input with createdAt from the injected clock and returns the stored message', () => {
    const { repository, service } = setup()
    const input: SendMessageInput = { nickname: 'Alice', text: 'Hello\nworld' }

    const message = service.postMessage(input)

    const expected = { id: 1, nickname: 'Alice', text: 'Hello\nworld', createdAt: FIXED_TIME }
    expect(message).toEqual(expected)
    expect(repository.rows).toEqual([expected])
    expect(repository.calls).toEqual([
      { method: 'insert', args: [{ nickname: 'Alice', text: 'Hello\nworld', createdAt: FIXED_TIME }] },
    ])
  })

  it('returns what the repository stored (repository-assigned id)', () => {
    const { service } = setup(41)
    expect(service.postMessage({ nickname: 'Bob', text: 'hi' }).id).toBe(42)
  })

  it('formats createdAt as ISO 8601 UTC with milliseconds regardless of the clock offset', () => {
    const repository = new FakeMessageRepository()
    const service = createChatService(repository, {
      now: () => new Date('2026-09-26T14:05:00+02:00'),
    })

    const { createdAt } = service.postMessage({ nickname: 'Alice', text: 'hi' })

    expect(createdAt).toBe('2026-09-26T12:05:00.000Z')
    expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('reads the clock once per message at the time of posting', () => {
    const repository = new FakeMessageRepository()
    const times = ['2026-09-26T12:00:00.001Z', '2026-09-26T12:00:00.002Z']
    const queue = [...times]
    const now = vi.fn(() => new Date(queue.shift() ?? 'clock called too often'))
    const service = createChatService(repository, { now })
    expect(now).not.toHaveBeenCalled()

    const first = service.postMessage({ nickname: 'A', text: 'one' })
    const second = service.postMessage({ nickname: 'B', text: 'two' })

    expect(now).toHaveBeenCalledTimes(2)
    expect([first.createdAt, second.createdAt]).toEqual(times)
  })

  it('uses the current time when no clock is injected', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-26T08:30:15.456Z'))
    const service = createChatService(new FakeMessageRepository())

    expect(service.postMessage({ nickname: 'A', text: 'x' }).createdAt).toBe('2026-09-26T08:30:15.456Z')
  })

  it('stores only nickname, text, and the server createdAt (no extra input fields)', () => {
    const { repository, service } = setup()
    const input = { nickname: 'A', text: 'x', id: 999, createdAt: '1999-01-01T00:00:00.000Z' }

    const message = service.postMessage(input as SendMessageInput)

    expect(message).toEqual({ id: 1, nickname: 'A', text: 'x', createdAt: FIXED_TIME })
    expect(repository.calls[0]?.args[0]).toEqual({ nickname: 'A', text: 'x', createdAt: FIXED_TIME })
  })

  it('lets repository errors propagate', () => {
    const repository = new FakeMessageRepository()
    const failure = new Error('disk full')
    repository.insert = () => {
      throw failure
    }
    const service = createChatService(repository, { now: fixedClock })

    expect(() => service.postMessage({ nickname: 'A', text: 'x' })).toThrow(failure)
  })
})

describe('historyFor without lastSeenId', () => {
  it('uses a history limit of 100', () => {
    expect(HISTORY_LIMIT).toBe(100)
  })

  it('returns replace with an empty list for an empty store', () => {
    const { service } = setup(0)
    expect(service.historyFor()).toEqual({ mode: 'replace', messages: [] })
  })

  it('returns replace with all messages, oldest first, when fewer than 100 are stored', () => {
    const { service } = setup(3)
    const history = service.historyFor()
    expect(history.mode).toBe('replace')
    expect(history.messages.map((m) => m.text)).toEqual(['message 1', 'message 2', 'message 3'])
  })

  it('returns replace with all 100 when exactly 100 are stored', () => {
    const { service } = setup(100)
    const history = service.historyFor()
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(1, 100))
  })

  it('returns replace with the latest 100, oldest first (messages 6 to 105 of 105)', () => {
    const { repository, service } = setup(105)
    const history = service.historyFor()
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(6, 105))
    expect(repository.calls).toEqual([{ method: 'latest', args: [100] }])
  })
})

describe('historyFor with lastSeenId', () => {
  it('returns append with only the newer messages when fewer than 100 were missed', () => {
    const { service } = setup(12)
    expect(service.historyFor(10)).toEqual({
      mode: 'append',
      messages: [
        { id: 11, nickname: 'seed', text: 'message 11', createdAt: '2026-09-26T12:00:00.000Z' },
        { id: 12, nickname: 'seed', text: 'message 12', createdAt: '2026-09-26T12:00:00.000Z' },
      ],
    })
  })

  it('returns append with exactly 100 messages when exactly 100 were missed', () => {
    const { service } = setup(110)
    const history = service.historyFor(10)
    expect(history.mode).toBe('append')
    expect(ids(history.messages)).toEqual(range(11, 110))
  })

  it('returns replace with the latest 100 when 101 were missed', () => {
    const { service } = setup(111)
    const history = service.historyFor(10)
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(12, 111))
  })

  it('returns replace with exactly messages 51 to 150 when lastSeenId is 10 and 11 to 150 were missed', () => {
    const { service } = setup(150)
    const history = service.historyFor(10)
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(51, 150))
  })

  it('returns append with none when nothing was missed', () => {
    const { service } = setup(30)
    expect(service.historyFor(30)).toEqual({ mode: 'append', messages: [] })
  })

  it('treats lastSeenId 0 as valid: append with everything when at most 100 are stored', () => {
    const { service } = setup(30)
    const history = service.historyFor(0)
    expect(history.mode).toBe('append')
    expect(ids(history.messages)).toEqual(range(1, 30))
  })

  it('returns append with none for lastSeenId 0 and an empty store', () => {
    const { service } = setup(0)
    expect(service.historyFor(0)).toEqual({ mode: 'append', messages: [] })
  })

  it('returns replace with the latest 100 when lastSeenId is greater than the highest stored id', () => {
    const { service } = setup(30)
    const history = service.historyFor(120)
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(1, 30))
  })

  it('returns replace with the latest 100 (not all) when lastSeenId is greater than the highest of 150', () => {
    const { service } = setup(150)
    const history = service.historyFor(151)
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(51, 150))
  })

  it('returns replace with an empty list when lastSeenId is positive and the store is empty', () => {
    const { service } = setup(0)
    expect(service.historyFor(120)).toEqual({ mode: 'replace', messages: [] })
  })

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['null', null],
    ['string', '5'],
  ])('defensively treats a %s lastSeenId as absent (replace with the latest 100)', (_, value) => {
    const { repository, service } = setup(105)
    const history = service.historyFor(value as unknown as number)
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(6, 105))
    expect(repository.calls).toEqual([{ method: 'latest', args: [100] }])
  })

  it('lets repository errors propagate', () => {
    const repository = new FakeMessageRepository()
    const failure = new Error('database is locked')
    repository.since = () => {
      throw failure
    }
    repository.latest = () => {
      throw failure
    }
    const service = createChatService(repository, { now: fixedClock })

    expect(() => service.historyFor()).toThrow(failure)
    expect(() => service.historyFor(5)).toThrow(failure)
  })
})
