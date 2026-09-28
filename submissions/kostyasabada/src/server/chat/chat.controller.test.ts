import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { Server } from 'socket.io'
import {
  io as connect,
  type ManagerOptions,
  type Socket as ClientSocket,
  type SocketOptions,
} from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MESSAGE_MAX_LENGTH, NICKNAME_MAX_LENGTH, type ChatMessage } from '../../lib/chat/schema'
import { closeDatabase, openDatabase } from '../db/sqlite'
import { registerChatController, type SendAck } from './chat.controller'
import { createChatService, type ChatHistory, type ChatService } from './chat.service'
import { SqliteMessageRepository } from './message.repository'

// Integration tests of the chat controller (design D2, D4): a real Socket.IO server on an
// ephemeral port, socket.io-client, and the real chat service over SqliteMessageRepository
// on a temporary database file. No Next.js. Synchronization uses acks and events only.

const NOW = '2026-09-28T12:00:00.000Z'

let dir: string
let db: Database
let repository: SqliteMessageRepository
let realService: ChatService
let io: Server | undefined
let port: number
let clients: ClientSocket[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chat-controller-test-'))
  db = openDatabase(join(dir, 'chat.sqlite'))
  repository = new SqliteMessageRepository(db)
  realService = createChatService(repository, { now: () => new Date(NOW) })
  clients = []
  io = undefined
})

afterEach(async () => {
  for (const client of clients) client.disconnect()
  if (io) await io.close() // also closes the attached http.Server
  if (db.open) closeDatabase(db)
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** Starts Socket.IO on an ephemeral loopback port with the controller registered. */
async function startServer(service: ChatService = realService): Promise<void> {
  const httpServer = createServer()
  io = new Server(httpServer, { serveClient: false })
  registerChatController(io, service)
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  port = (httpServer.address() as AddressInfo).port
}

type TestClient = {
  socket: ClientSocket
  /** The first `history` event of this connection. */
  history: Promise<ChatHistory>
  /** Every event except `history`, in arrival order. */
  events: Array<{ event: string; args: unknown[] }>
  /** `message:new` payloads in arrival order. */
  messages: ChatMessage[]
  /** Resolves once at least `count` `message:new` events have arrived. */
  waitForMessages(count: number): Promise<ChatMessage[]>
}

/**
 * Connects a new, independent client (own manager; no reconnection unless `options`
 * enables it) with the given `auth`.
 */
function connectClient(
  auth?: Record<string, unknown>,
  options: Partial<ManagerOptions & SocketOptions> = {},
): TestClient {
  const socket = connect(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    ...(auth === undefined ? {} : { auth }),
    ...options,
  })
  clients.push(socket)
  const events: TestClient['events'] = []
  const messages: ChatMessage[] = []
  const waiters: Array<{ count: number; resolve: (value: ChatMessage[]) => void }> = []

  const history = new Promise<ChatHistory>((resolve, reject) => {
    socket.once('history', resolve)
    socket.once('connect_error', reject)
  })
  socket.onAny((event: string, ...args: unknown[]) => {
    if (event === 'history') return
    events.push({ event, args })
    if (event !== 'message:new') return
    messages.push(args[0] as ChatMessage)
    for (const waiter of waiters.splice(0)) {
      if (messages.length >= waiter.count) waiter.resolve([...messages])
      else waiters.push(waiter)
    }
  })

  return {
    socket,
    history,
    events,
    messages,
    waitForMessages(count) {
      if (messages.length >= count) return Promise.resolve([...messages])
      return new Promise((resolve) => waiters.push({ count, resolve }))
    },
  }
}

/** Connects a client and waits for its history (the socket has joined the room by then). */
async function joined(auth?: Record<string, unknown>): Promise<TestClient> {
  const client = connectClient(auth)
  await client.history
  return client
}

/** Emits `message:send` with an ack and resolves with the ack. */
function send(client: TestClient, payload: unknown): Promise<SendAck> {
  return client.socket.emitWithAck('message:send', payload) as Promise<SendAck>
}

/** Stores `count` messages directly (message n has text `m<n>`). */
function seed(count: number): void {
  for (let n = 1; n <= count; n += 1) {
    realService.postMessage({ nickname: 'Seeder', text: `m${n}` })
  }
}

const ids = (messages: ChatMessage[]) => messages.map((message) => message.id)
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('history on connection', () => {
  it('sends replace with an empty list to the first client of an empty room', async () => {
    await startServer()
    const client = connectClient()
    expect(await client.history).toEqual({ mode: 'replace', messages: [] })
  })

  it('sends replace with the stored messages, oldest first, on first connect', async () => {
    seed(3)
    await startServer()
    const history = await connectClient().history
    expect(history.mode).toBe('replace')
    expect(history.messages).toEqual(repository.latest(100))
    expect(history.messages.map((message) => message.text)).toEqual(['m1', 'm2', 'm3'])
  })

  it('sends replace with the latest 100 when more are stored', async () => {
    seed(105)
    await startServer()
    const history = await connectClient().history
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(6, 105))
  })

  it('sends append with only the newer messages for a valid lastSeenId', async () => {
    seed(5)
    await startServer()
    const history = await connectClient({ lastSeenId: 3 }).history
    expect(history.mode).toBe('append')
    expect(ids(history.messages)).toEqual([4, 5])
    expect(history.messages.map((message) => message.text)).toEqual(['m4', 'm5'])
  })

  it('sends append with an empty list to an up-to-date client', async () => {
    seed(5)
    await startServer()
    expect(await connectClient({ lastSeenId: 5 }).history).toEqual({ mode: 'append', messages: [] })
  })

  it('sends replace with exactly messages 51 to 150 when lastSeenId is 10 and 11 to 150 were missed', async () => {
    seed(150)
    await startServer()
    const history = await connectClient({ lastSeenId: 10 }).history
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(51, 150))
    expect(history.messages[0]?.text).toBe('m51')
  })

  it('sends append with messages 11 to 110 when exactly 100 were missed', async () => {
    seed(110)
    await startServer()
    const history = await connectClient({ lastSeenId: 10 }).history
    expect(history.mode).toBe('append')
    expect(ids(history.messages)).toEqual(range(11, 110))
  })

  // With 105 messages, a valid lastSeenId 10 would give append 11–105; "absent" gives replace 6–105.
  it.each([
    ['a numeric string', '10'],
    ['a non-numeric string', 'abc'],
    ['null', null],
    ['negative', -1],
    ['fractional', 10.5],
    ['a boolean (non-integer)', true],
    ['an object (non-integer)', { id: 10 }],
    ['an array (non-integer)', [10]],
    ['above the safe integer range', Number.MAX_SAFE_INTEGER + 2],
  ])('treats a lastSeenId that is %s as absent (replace with the latest 100)', async (_label, lastSeenId) => {
    seed(105)
    await startServer()
    const history = await connectClient({ lastSeenId }).history
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(6, 105))
  })

  it('treats an empty auth object as an absent lastSeenId', async () => {
    seed(105)
    await startServer()
    const history = await connectClient({}).history
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(6, 105))
  })

  it('sends replace with the latest messages when lastSeenId is greater than the highest stored id', async () => {
    seed(30)
    await startServer()
    const history = await connectClient({ lastSeenId: 120 }).history
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(1, 30))
  })

  it('sends replace with the latest 100 when lastSeenId is greater than the highest id of 150', async () => {
    seed(150)
    await startServer()
    const history = await connectClient({ lastSeenId: 151 }).history
    expect(history.mode).toBe('replace')
    expect(ids(history.messages)).toEqual(range(51, 150))
  })

  it('passes a valid lastSeenId from the handshake to the service unchanged', async () => {
    const historyFor = vi.spyOn(realService, 'historyFor')
    await startServer()
    await connectClient({ lastSeenId: 0 }).history
    await connectClient({ lastSeenId: '7' }).history
    await connectClient().history
    expect(historyFor.mock.calls).toEqual([[0], [undefined], [undefined]])
  })

  it('closes the transport when reading the history fails, so the client reconnects on its own and gets the history', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    let historyCalls = 0
    const service: ChatService = {
      postMessage: (input) => realService.postMessage(input),
      historyFor: (lastSeenId) => {
        historyCalls += 1
        if (historyCalls === 1) throw new Error('history read failed')
        return realService.historyFor(lastSeenId)
      },
    }
    seed(2)
    await startServer(service)
    let connections = 0
    io?.on('connection', () => {
      connections += 1
    })
    // Reconnection enabled as in the browser client (short delays keep the test fast; the
    // test waits for events, not for time).
    const client = connectClient(undefined, { reconnection: true, reconnectionDelay: 50, reconnectionDelayMax: 100 })

    const reason = await new Promise<string>((resolve) => client.socket.once('disconnect', resolve))
    // `transport close` (not `io server disconnect`) makes socket.io-client reconnect by itself.
    expect(reason).toBe('transport close')
    expect(client.events).toEqual([])

    // No manual connect(): the client's own reconnection opens a second connection, which
    // receives the history.
    const history = await client.history
    expect(history).toEqual({ mode: 'replace', messages: repository.latest(100) })
    expect(connections).toBe(2)
    expect(historyCalls).toBe(2)
    expect(client.socket.connected).toBe(true)
    expect(errors).toHaveBeenCalledTimes(1)

    const ack = await send(client, { nickname: 'Alice', text: 'still up' })
    expect(ack).toMatchObject({ ok: true, message: { id: 3, text: 'still up' } })
  })
})

describe('broadcast of accepted messages', () => {
  it('delivers a message to another independent client and to the sender, and acks the sender', async () => {
    await startServer()
    const alice = await joined()
    const bob = await joined()

    const ack = await send(alice, { nickname: 'Alice', text: 'Hello Bob' })
    const expected: ChatMessage = { id: 1, nickname: 'Alice', text: 'Hello Bob', createdAt: NOW }
    expect(ack).toEqual({ ok: true, message: expected })
    expect(await bob.waitForMessages(1)).toEqual([expected])
    expect(await alice.waitForMessages(1)).toEqual([expected])
    expect(repository.latest(100)).toEqual([expected])
  })

  it('broadcasts before acking, so the sender has the message when the ack arrives', async () => {
    await startServer()
    const alice = await joined()
    // The count is read inside the ack callback, which socket.io-client runs synchronously
    // when the ack packet is dispatched; packets of one connection are dispatched in order.
    const { ack, messagesAtAck } = await new Promise<{ ack: SendAck; messagesAtAck: number }>((resolve) => {
      alice.socket.emit('message:send', { nickname: 'Alice', text: 'order' }, (response: SendAck) => {
        resolve({ ack: response, messagesAtAck: alice.messages.length })
      })
    })
    expect(ack.ok).toBe(true)
    expect(messagesAtAck).toBe(1)
    expect(alice.messages[0]?.text).toBe('order')
  })

  it('delivers the stored (trimmed) values, with line breaks preserved', async () => {
    await startServer()
    const alice = await joined()
    const bob = await joined()
    const ack = await send(alice, { nickname: '  Alice  ', text: '   one\ntwo\nthree   ' })
    expect(ack).toMatchObject({ ok: true, message: { nickname: 'Alice', text: 'one\ntwo\nthree' } })
    expect((await bob.waitForMessages(1))[0]).toMatchObject({ nickname: 'Alice', text: 'one\ntwo\nthree' })
  })

  it('accepts text at the limit and a valid surrogate pair', async () => {
    await startServer()
    const alice = await joined()
    const bob = await joined()
    const atLimit = 'x'.repeat(MESSAGE_MAX_LENGTH)
    const padded = `          ${atLimit}          `
    expect(await send(alice, { nickname: 'Alice', text: padded })).toMatchObject({ ok: true, message: { text: atLimit } })
    expect(await send(alice, { nickname: 'Alice', text: 'a😀b' })).toMatchObject({ ok: true, message: { text: 'a😀b' } })
    expect((await bob.waitForMessages(2)).map((message) => message.text)).toEqual([atLimit, 'a😀b'])
  })

  it('orders messages sent by two clients in quick succession identically on both, matching server ids', async () => {
    await startServer()
    const alice = await joined()
    const bob = await joined()

    // Both sends are emitted before either ack is awaited.
    const acks = await Promise.all([
      send(alice, { nickname: 'Alice', text: 'from Alice' }),
      send(bob, { nickname: 'Bob', text: 'from Bob' }),
      send(alice, { nickname: 'Alice', text: 'from Alice 2' }),
      send(bob, { nickname: 'Bob', text: 'from Bob 2' }),
    ])
    const onAlice = await alice.waitForMessages(4)
    const onBob = await bob.waitForMessages(4)

    expect(onAlice).toEqual(onBob)
    const receivedIds = ids(onAlice)
    expect(receivedIds).toEqual([...receivedIds].sort((a, b) => a - b))
    expect(new Set(receivedIds).size).toBe(4)
    const ackedMessages = acks.map((ack) => {
      if (!ack.ok) throw new Error('send failed')
      return ack.message
    })
    expect([...ackedMessages].sort((a, b) => a.id - b.id)).toEqual(onAlice)
    expect(repository.latest(100)).toEqual(onAlice)
  })

  it('ignores client-supplied ids, timestamps, and other extra fields', async () => {
    seed(2)
    await startServer()
    const alice = await joined()
    const bob = await joined()
    const ack = await send(alice, {
      nickname: 'Alice',
      text: 'hi',
      id: 999,
      createdAt: '2000-01-01T00:00:00.000Z',
      timestamp: 1,
      clientId: 'abc',
    })
    const expected: ChatMessage = { id: 3, nickname: 'Alice', text: 'hi', createdAt: NOW }
    expect(ack).toEqual({ ok: true, message: expected })
    const [received] = await bob.waitForMessages(1)
    expect(received).toEqual(expected)
    expect(Object.keys(received ?? {}).sort()).toEqual(['createdAt', 'id', 'nickname', 'text'])
    expect(repository.latest(1)).toEqual([expected])
  })

  it('stores and broadcasts a valid message sent without an ack callback, and keeps running', async () => {
    await startServer()
    const alice = await joined()
    const bob = await joined()
    alice.socket.emit('message:send', { nickname: 'Alice', text: 'no ack' })
    expect((await bob.waitForMessages(1))[0]).toMatchObject({ id: 1, text: 'no ack' })
    expect((await alice.waitForMessages(1))[0]).toMatchObject({ id: 1, text: 'no ack' })
    expect(await send(alice, { nickname: 'Alice', text: 'after' })).toMatchObject({ ok: true, message: { id: 2 } })
  })
})

describe('rejection of invalid payloads', () => {
  const valid = { nickname: 'Alice', text: 'hi' }
  const cases: Array<[string, unknown, 'invalid_nickname' | 'invalid_text']> = [
    ['empty text', { ...valid, text: '' }, 'invalid_text'],
    ['whitespace-only text', { ...valid, text: ' \t\n\r\n  ' }, 'invalid_text'],
    ['oversized text (1001 after trimming)', { ...valid, text: ` ${'x'.repeat(MESSAGE_MAX_LENGTH + 1)} ` }, 'invalid_text'],
    ['text with a lone high surrogate', { ...valid, text: 'a\uD800b' }, 'invalid_text'],
    ['text with a lone low surrogate', { ...valid, text: 'a\uDC00b' }, 'invalid_text'],
    ['missing text', { nickname: 'Alice' }, 'invalid_text'],
    ['non-string text', { ...valid, text: 42 }, 'invalid_text'],
    ['empty nickname', { ...valid, nickname: '' }, 'invalid_nickname'],
    ['whitespace-only nickname', { ...valid, nickname: '   ' }, 'invalid_nickname'],
    ['too-long nickname', { ...valid, nickname: 'n'.repeat(NICKNAME_MAX_LENGTH + 1) }, 'invalid_nickname'],
    ['nickname with markup', { ...valid, nickname: '<b>Al</b>' }, 'invalid_nickname'],
    ['nickname with a lone surrogate', { ...valid, nickname: 'Al\uD800' }, 'invalid_nickname'],
    ['missing nickname', { text: 'hi' }, 'invalid_nickname'],
    ['non-string nickname', { ...valid, nickname: null }, 'invalid_nickname'],
    ['both fields invalid (nickname takes precedence)', { nickname: '', text: '' }, 'invalid_nickname'],
    ['empty object (nickname takes precedence)', {}, 'invalid_nickname'],
    ['a null payload', null, 'invalid_text'],
    ['a string payload', 'hi', 'invalid_text'],
    ['a number payload', 7, 'invalid_text'],
    ['an array payload', [valid], 'invalid_text'],
  ]

  it.each(cases)('rejects %s with an ack error to the sender only; nothing is stored or broadcast', async (_label, payload, code) => {
    await startServer()
    const alice = await joined()
    const bob = await joined()

    const ack = await send(alice, payload)
    expect(ack).toEqual({ ok: false, error: { code, message: expect.any(String) } })
    if (!ack.ok) expect(ack.error.message.length).toBeGreaterThan(0)

    // Barrier: a later valid message is delivered on each connection after anything the
    // rejected one could have caused, so only the sentinel may have arrived.
    const sentinel = await send(alice, { nickname: 'Alice', text: 'sentinel' })
    expect(sentinel).toMatchObject({ ok: true, message: { id: 1, text: 'sentinel' } })
    await bob.waitForMessages(1)
    await alice.waitForMessages(1)
    expect(bob.events).toEqual([{ event: 'message:new', args: [expect.objectContaining({ text: 'sentinel' })] }])
    expect(alice.events).toEqual([{ event: 'message:new', args: [expect.objectContaining({ text: 'sentinel' })] }])
    expect(repository.latest(100).map((message) => message.text)).toEqual(['sentinel'])
  })

  it('reports the schema message for the rejected field', async () => {
    await startServer()
    const alice = await joined()
    expect(await send(alice, { nickname: 'Alice', text: '   ' })).toEqual({
      ok: false,
      error: { code: 'invalid_text', message: 'Message is required.' },
    })
    expect(await send(alice, { nickname: '', text: 'hi' })).toEqual({
      ok: false,
      error: { code: 'invalid_nickname', message: 'Nickname is required.' },
    })
  })

  it('rejects an ack-only emit (no payload) with invalid_text', async () => {
    await startServer()
    const alice = await joined()
    const ack = (await alice.socket.emitWithAck('message:send')) as SendAck
    expect(ack).toMatchObject({ ok: false, error: { code: 'invalid_text' } })
    expect(repository.latest(100)).toEqual([])
  })

  it('drops an invalid payload sent without an ack callback without crashing', async () => {
    await startServer()
    const alice = await joined()
    const bob = await joined()
    alice.socket.emit('message:send', { nickname: '', text: '' })
    alice.socket.emit('message:send')
    alice.socket.emit('message:send', null)
    const sentinel = await send(alice, { nickname: 'Alice', text: 'sentinel' })
    expect(sentinel).toMatchObject({ ok: true, message: { id: 1 } })
    await bob.waitForMessages(1)
    expect(bob.events).toHaveLength(1)
    expect(repository.latest(100).map((message) => message.text)).toEqual(['sentinel'])
  })
})

describe('service failures', () => {
  it('acks server_error, broadcasts nothing, and keeps running when postMessage throws', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const service: ChatService = {
      historyFor: (lastSeenId) => realService.historyFor(lastSeenId),
      postMessage: (input) => {
        if (input.text === 'fail me') throw new Error('database is locked')
        return realService.postMessage(input)
      },
    }
    await startServer(service)
    const alice = await joined()
    const bob = await joined()

    const ack = await send(alice, { nickname: 'Alice', text: 'fail me' })
    expect(ack).toEqual({ ok: false, error: { code: 'server_error', message: expect.any(String) } })
    if (!ack.ok) {
      expect(ack.error.message.length).toBeGreaterThan(0)
      // The internal error text is not sent to the client.
      expect(ack.error.message).not.toContain('database is locked')
    }
    expect(errors).toHaveBeenCalled()

    // The server keeps running: a following connection and a valid send succeed, and the
    // valid message is the first and only message:new on every connection.
    const carol = await joined()
    const next = await send(carol, { nickname: 'Carol', text: 'still up' })
    expect(next).toMatchObject({ ok: true, message: { id: 1, text: 'still up' } })
    for (const client of [alice, bob, carol]) {
      await client.waitForMessages(1)
      expect(client.events).toEqual([{ event: 'message:new', args: [expect.objectContaining({ text: 'still up' })] }])
    }
    expect(repository.latest(100).map((message) => message.text)).toEqual(['still up'])
  })

  it('acks server_error when postMessage always throws, for every attempt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const service: ChatService = {
      historyFor: (lastSeenId) => realService.historyFor(lastSeenId),
      postMessage: () => {
        throw new Error('disk full')
      },
    }
    await startServer(service)
    const alice = await joined()
    const bob = await joined()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await send(alice, { nickname: 'Alice', text: 'hi' })).toMatchObject({
        ok: false,
        error: { code: 'server_error' },
      })
    }
    // A new connection still gets its history.
    expect(await connectClient().history).toEqual({ mode: 'replace', messages: [] })
    // Barrier for Bob: his own round trip is answered after anything broadcast to him earlier.
    expect(await send(bob, { nickname: 'Bob', text: 'hi' })).toMatchObject({ ok: false, error: { code: 'server_error' } })
    expect(alice.events).toEqual([])
    expect(bob.events).toEqual([])
  })
})
