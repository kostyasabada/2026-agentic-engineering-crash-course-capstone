import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { request, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect as tcpConnect, createServer as createTcpServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Duplex } from 'node:stream'
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createApp, nextUpgradeHandler, type App, type NextHandlers } from './app'
import type { SendAck } from './chat/chat.controller'
import type { ChatHistory } from './chat/chat.service'
import { SqliteMessageRepository } from './chat/message.repository'
import { parseConfig } from './config'
import { closeDatabase, openDatabase } from './db/sqlite'

// Node tests of the composition root (design D4, D6; task 4.2): the whole server stack from
// `createApp` on an ephemeral loopback port with a temporary SQLite file and stub Next.js
// handlers, driven with raw HTTP requests whose `Host` and `Origin` headers are set
// explicitly (browsers cannot set `Host`). No Next.js build is involved.

type RequestStub = Mock<(req: IncomingMessage, res: ServerResponse) => Promise<void>>
type UpgradeStub = Mock<(req: IncomingMessage, socket: Duplex, head: Buffer) => Promise<void>>

let dir: string
let dbPath: string
let port: number
let app: App | undefined
let handleRequest: RequestStub
let handleUpgrade: UpgradeStub
let openSockets: Array<Socket | Duplex>
let clients: ClientSocket[]

const POLLING = '/socket.io/?EIO=4&transport=polling'
const WEBSOCKET = '/socket.io/?EIO=4&transport=websocket'

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'chat-app-test-'))
  dbPath = join(dir, 'chat.sqlite')
  port = await freePort()
  handleRequest = vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('next page')
  })
  handleUpgrade = vi.fn(async () => {})
  openSockets = []
  clients = []
  app = undefined
})

afterEach(async () => {
  for (const client of clients) client.disconnect()
  for (const socket of openSockets) socket.destroy()
  if (app) await app.close()
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** A port that was free a moment ago (the allowlist needs the port before listening). */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createTcpServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))))
    })
  })
}

/**
 * Creates the app from the given environment (PORT is the free port, CHAT_DB_PATH the
 * temporary file) and listens on 127.0.0.1. The listen address does not matter for the
 * policy, which only looks at the headers, so `HOST=0.0.0.0` cases also listen on loopback.
 */
async function startApp(env: Record<string, string> = {}, next: Partial<NextHandlers> = {}): Promise<App> {
  const config = parseConfig({ PORT: String(port), CHAT_DB_PATH: dbPath, ...env })
  const created = createApp({ config, next: { handleRequest, handleUpgrade, ...next } })
  app = created
  await new Promise<void>((resolve, reject) => {
    created.httpServer.once('error', reject)
    created.httpServer.listen(port, '127.0.0.1', () => resolve())
  })
  return created
}

type HttpResult = { status: number; headers: IncomingHttpHeaders; body: string }

/** A raw HTTP request with exactly the given headers (`host` included; no default Host). */
function httpRequest(path: string, headers: Record<string, string>, method = 'GET'): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers, setHost: false, agent: false }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

type UpgradeResult =
  | { kind: 'upgraded'; status: number; socket: Duplex }
  | { kind: 'response'; status: number; body: string }
  | { kind: 'error'; message: string }

/** A raw WebSocket upgrade request with exactly the given extra headers. */
function upgradeRequest(path: string, headers: Record<string, string>): Promise<UpgradeResult> {
  return new Promise((resolve) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      setHost: false,
      agent: false,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...headers,
      },
    })
    req.on('upgrade', (res, socket) => {
      openSockets.push(socket)
      resolve({ kind: 'upgraded', status: res.statusCode ?? 0, socket })
    })
    req.on('response', (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (body += chunk))
      res.on('end', () => resolve({ kind: 'response', status: res.statusCode ?? 0, body }))
      res.on('error', () => resolve({ kind: 'response', status: res.statusCode ?? 0, body }))
    })
    req.on('error', (error) => resolve({ kind: 'error', message: error.message }))
    req.end()
  })
}

/** Sends raw bytes over TCP and resolves with everything received until the server closes. */
function rawExchange(data: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = tcpConnect(port, '127.0.0.1', () => socket.write(data))
    openSockets.push(socket)
    let received = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => (received += chunk))
    socket.on('close', () => resolve(received))
    socket.on('error', reject)
  })
}

/** Resolves once the socket is closed by the other side (or immediately if it already is). */
function closed(socket: Duplex): Promise<void> {
  if (socket.destroyed) return Promise.resolve()
  return new Promise((resolve) => socket.once('close', () => resolve()))
}

const own = () => `127.0.0.1:${port}`
const evil = () => `evil.example:${port}`

/** The accepted polling handshake: an engine.io OPEN packet with a session id. */
function expectPollingAccepted(result: HttpResult): string {
  expect(result.status).toBe(200)
  expect(result.body).toMatch(/^0\{"sid":"[^"]+"/)
  return (JSON.parse(result.body.slice(1)) as { sid: string }).sid
}

/** Asserts that the server is still up: a valid polling handshake and GET / succeed. */
async function expectStillServing(): Promise<void> {
  expectPollingAccepted(await httpRequest(POLLING, { host: own() }))
  expect((await httpRequest('/', { host: own() })).status).toBe(200)
}

describe('Host check on every HTTP request', () => {
  it('refuses GET / with Host: evil.example:<PORT> with 403 without calling Next.js', async () => {
    await startApp()
    const result = await httpRequest('/', { host: evil() })
    expect(result.status).toBe(403)
    expect(result.body).toBe('Forbidden\n')
    expect(result.headers.connection).toBe('close')
    expect(handleRequest).not.toHaveBeenCalled()
  })

  it('serves GET / through Next.js with an own Host', async () => {
    await startApp()
    const result = await httpRequest('/', { host: own() })
    expect(result).toMatchObject({ status: 200, body: 'next page' })
    expect(handleRequest).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a missing Host', undefined],
    ['an empty Host', ''],
    ['an unparsable Host', 'local host:1'],
    ['a Host with userinfo', `evil@127.0.0.1:0`],
    ['a Host with a path', `127.0.0.1:0/x`],
    ['a Host on another port', '127.0.0.1:1'],
  ])('refuses GET / with %s with 403', async (_label, value) => {
    await startApp()
    const host = value?.replace(':0', `:${port}`)
    const result = await httpRequest('/', host === undefined ? {} : { host })
    expect(result.status).toBe(403)
    expect(handleRequest).not.toHaveBeenCalled()
  })

  it('refuses a raw HTTP/1.0 request without Host with 403', async () => {
    await startApp()
    const response = await rawExchange('GET / HTTP/1.0\r\n\r\n')
    expect(response).toMatch(/^HTTP\/1\.1 403 Forbidden\r\n/)
    expect(handleRequest).not.toHaveBeenCalled()
  })

  it('refuses a polling request of an existing session with a foreign Host', async () => {
    await startApp()
    const sid = expectPollingAccepted(await httpRequest(POLLING, { host: own() }))
    const result = await httpRequest(`${POLLING}&sid=${sid}`, { host: evil() })
    expect(result.status).toBe(403)
    expect(result.body).toBe('Forbidden\n')
  })
})

describe('Socket.IO handshake: Host and Origin (design D2, Proposal P19)', () => {
  it('refuses a polling handshake without Origin and with Host: evil.example:<PORT> (403, no session)', async () => {
    const started = await startApp()
    const result = await httpRequest(POLLING, { host: evil() })
    expect(result.status).toBe(403)
    expect(result.body).toBe('Forbidden\n')
    expect(started.io.engine.clientsCount).toBe(0)
  })

  it('refuses a websocket handshake without Origin and with Host: evil.example:<PORT> (403, no session)', async () => {
    const started = await startApp()
    const result = await upgradeRequest(WEBSOCKET, { host: evil() })
    expect(result).toEqual({ kind: 'response', status: 403, body: '' })
    expect(started.io.engine.clientsCount).toBe(0)
    expect(handleUpgrade).not.toHaveBeenCalled()
  })

  it.each([
    ['a foreign origin', 'http://evil.example'],
    ['a foreign origin with the own port', 'http://evil.example:0'],
    ['Origin: null', 'null'],
    ['an unparsable origin', 'http://[bad'],
    ['a non-URL origin', '%%%'],
    ['an https origin of an own host', 'https://127.0.0.1:0'],
  ])('refuses a polling handshake with an own Host and %s (403) and keeps running', async (_label, value) => {
    const started = await startApp()
    const result = await httpRequest(POLLING, { host: own(), origin: value.replace(':0', `:${port}`) })
    // engine.io answers a refused `allowRequest` on polling with 403 and a JSON body.
    expect(result.status).toBe(403)
    expect(JSON.parse(result.body)).toEqual({ code: 4, message: 'Origin not allowed' })
    expect(started.io.engine.clientsCount).toBe(0)
    await expectStillServing()
  })

  it.each([
    ['a foreign origin', 'http://evil.example'],
    ['Origin: null', 'null'],
    ['an unparsable origin', 'http://[bad'],
  ])('refuses a websocket handshake with an own Host and %s (400) and keeps running', async (_label, value) => {
    const started = await startApp()
    const result = await upgradeRequest(WEBSOCKET, { host: own(), origin: value })
    // engine.io's abortUpgrade always answers 400 Bad Request, with the reason as the body.
    expect(result).toEqual({ kind: 'response', status: 400, body: 'Origin not allowed' })
    expect(started.io.engine.clientsCount).toBe(0)
    await expectStillServing()
  })

  it('accepts a polling and a websocket handshake without Origin and with Host: 127.0.0.1:<PORT>', async () => {
    await startApp()
    expectPollingAccepted(await httpRequest(POLLING, { host: own() }))
    const upgraded = await upgradeRequest(WEBSOCKET, { host: own() })
    expect(upgraded).toMatchObject({ kind: 'upgraded', status: 101 })
  })

  it('accepts Host: LOCALHOST:<PORT> (normalized) on both transports and for GET /', async () => {
    await startApp()
    const host = `LOCALHOST:${port}`
    expectPollingAccepted(await httpRequest(POLLING, { host }))
    expect(await upgradeRequest(WEBSOCKET, { host })).toMatchObject({ kind: 'upgraded', status: 101 })
    expect((await httpRequest('/', { host })).status).toBe(200)
  })

  it.each(['localhost', '127.0.0.1'])('accepts Origin: http://%s:<PORT> on both transports', async (name) => {
    await startApp()
    const headers = { host: `${name}:${port}`, origin: `http://${name}:${port}` }
    expectPollingAccepted(await httpRequest(POLLING, headers))
    expect(await upgradeRequest(WEBSOCKET, headers)).toMatchObject({ kind: 'upgraded', status: 101 })
  })

  it('delivers the history to a socket.io-client without Origin on 127.0.0.1 (both transports)', async () => {
    const started = await startApp()
    for (const transports of [['polling'], ['websocket']]) {
      const client = connectClient(`http://127.0.0.1:${port}`, { transports, forceNew: true, reconnection: false })
      clients.push(client)
      const history = await new Promise<ChatHistory>((resolve, reject) => {
        client.once('history', resolve)
        client.once('connect_error', reject)
      })
      expect(history).toEqual({ mode: 'replace', messages: [] })
    }
    expect(started.io.engine.clientsCount).toBe(2)
  })

  it('refuses a socket.io-client with a foreign Origin', async () => {
    await startApp()
    const client = connectClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin: 'http://evil.example' },
    })
    clients.push(client)
    const error = await new Promise<Error>((resolve) => client.once('connect_error', resolve))
    expect(error.message).toBe('websocket error')
    expect(client.connected).toBe(false)
  })

  describe('with HOST=0.0.0.0 (wildcard)', () => {
    it('refuses Host: 0.0.0.0:<PORT> on GET / and both transports', async () => {
      await startApp({ HOST: '0.0.0.0' })
      const host = `0.0.0.0:${port}`
      expect((await httpRequest('/', { host })).status).toBe(403)
      expect((await httpRequest(POLLING, { host })).status).toBe(403)
      expect(await upgradeRequest(WEBSOCKET, { host })).toEqual({ kind: 'response', status: 403, body: '' })
      expect(handleRequest).not.toHaveBeenCalled()
    })

    it('still accepts localhost, 127.0.0.1, and [::1]', async () => {
      await startApp({ HOST: '0.0.0.0' })
      for (const name of ['localhost', '127.0.0.1', '[::1]']) {
        expectPollingAccepted(await httpRequest(POLLING, { host: `${name}:${port}` }))
      }
    })
  })
})

describe('upgrade dispatcher', () => {
  it('passes a non-Socket.IO upgrade with an own Host to the Next.js upgrade handler', async () => {
    await startApp()
    const pending = upgradeRequest('/custom-ws', { host: own() })
    await vi.waitFor(() => expect(handleUpgrade).toHaveBeenCalledTimes(1))
    const [req, socket] = handleUpgrade.mock.calls[0]!
    expect(req.url).toBe('/custom-ws')
    expect(socket.destroyed).toBe(false)
    socket.destroy()
    expect(await pending).toMatchObject({ kind: 'error' })
  })

  it('does not pass a Socket.IO upgrade to the Next.js upgrade handler', async () => {
    await startApp()
    expect(await upgradeRequest(WEBSOCKET, { host: own() })).toMatchObject({ kind: 'upgraded', status: 101 })
    expect(handleUpgrade).not.toHaveBeenCalled()
  })

  it.each([
    ['Host: evil.example:<PORT>', () => ({ host: evil() })],
    ['a missing Host', () => ({})],
  ])('refuses a non-Socket.IO upgrade with %s with 403 before any Next.js listener acts', async (_label, headers) => {
    // Next.js registers its own `upgrade` listener on the HTTP server on the first request
    // (`setupWebSocketHandler` in next/dist/server/next.js). The stub does the same, so the
    // test sees what that listener would get: an already destroyed socket.
    const selfRegistered = vi.fn((_req: IncomingMessage, socket: Duplex) => socket.destroyed)
    let registered = false
    const started = await startApp({}, {
      handleRequest: vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
        if (!registered) {
          registered = true
          started.httpServer.on('upgrade', selfRegistered)
        }
        res.end('next page')
      }),
    })
    expect((await httpRequest('/', { host: own() })).status).toBe(200)

    const result = await upgradeRequest('/_next/hmr', headers())
    expect(result).toEqual({ kind: 'response', status: 403, body: '' })
    expect(handleUpgrade).not.toHaveBeenCalled()
    expect(selfRegistered).toHaveBeenCalledTimes(1)
    expect(selfRegistered.mock.results[0]).toEqual({ type: 'return', value: true })
  })

  it('refuses a raw HTTP/1.0 upgrade without Host with 403', async () => {
    await startApp()
    const response = await rawExchange(
      'GET /socket.io/?EIO=4&transport=websocket HTTP/1.0\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' +
        'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n',
    )
    expect(response).toMatch(/^HTTP\/1\.1 403 Forbidden\r\n/)
  })
})

describe('nextUpgradeHandler (upgrades Next.js does not own are closed)', () => {
  it('in production, answers every non-Socket.IO upgrade with 404 and closes it without calling Next.js', async () => {
    const inner: UpgradeStub = vi.fn(async () => {})
    await startApp({}, { handleUpgrade: nextUpgradeHandler({ dev: false, handleUpgrade: inner }) })
    for (const path of ['/custom-ws', '/_next/hmr']) {
      expect(await upgradeRequest(path, { host: own() })).toEqual({ kind: 'response', status: 404, body: '' })
    }
    expect(inner).not.toHaveBeenCalled()
  })

  it('in development, passes /_next/ upgrades (HMR) to Next.js and closes all others with 404', async () => {
    const inner: UpgradeStub = vi.fn(async () => {})
    await startApp({}, { handleUpgrade: nextUpgradeHandler({ dev: true, handleUpgrade: inner }) })
    expect(await upgradeRequest('/custom-ws', { host: own() })).toEqual({ kind: 'response', status: 404, body: '' })
    expect(inner).not.toHaveBeenCalled()

    const pending = upgradeRequest('/_next/hmr', { host: own() })
    await vi.waitFor(() => expect(inner).toHaveBeenCalledTimes(1))
    const [req, socket] = inner.mock.calls[0]!
    expect(req.url).toBe('/_next/hmr')
    expect(socket.destroyed).toBe(false)
    socket.destroy()
    await pending
  })
})

describe('close()', () => {
  it('disconnects Socket.IO clients, stops listening, and closes the database', async () => {
    const started = await startApp()
    const client = connectClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    })
    clients.push(client)
    await new Promise<ChatHistory>((resolve) => client.once('history', resolve))
    const ack = (await client.emitWithAck('message:send', { nickname: 'Ann', text: 'kept' })) as SendAck
    expect(ack.ok).toBe(true)
    // WAL mode: the -wal file exists while a connection is open and is removed when the
    // last connection closes, so its absence afterwards shows that the app closed its own.
    expect(existsSync(`${dbPath}-wal`)).toBe(true)
    const disconnected = new Promise<string>((resolve) => client.once('disconnect', resolve))

    await started.close()

    expect(await disconnected).toBe('transport close')
    expect(started.httpServer.listening).toBe(false)
    expect(existsSync(`${dbPath}-wal`)).toBe(false)
    const reopened = openDatabase(dbPath)
    try {
      expect(new SqliteMessageRepository(reopened).latest(100).map((m) => m.text)).toEqual(['kept'])
    } finally {
      closeDatabase(reopened)
    }
  })

  it('is idempotent: repeated calls return the same promise and resolve', async () => {
    const started = await startApp()
    const first = started.close()
    const second = started.close()
    expect(second).toBe(first)
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    await expect(started.close()).resolves.toBeUndefined()
  })

  it('closes upgrades that were passed to Next.js and are still open', async () => {
    const started = await startApp()
    const pending = upgradeRequest('/custom-ws', { host: own() })
    await vi.waitFor(() => expect(handleUpgrade).toHaveBeenCalledTimes(1))
    const serverSide = handleUpgrade.mock.calls[0]![1]
    await started.close()
    await closed(serverSide)
    expect(serverSide.destroyed).toBe(true)
    expect(await pending).toMatchObject({ kind: 'error' })
    expect(started.httpServer.listening).toBe(false)
  })

  /** Resolves with the elapsed milliseconds of `close()`, or 'still open' after `limitMs`. */
  async function timedClose(started: App, limitMs: number): Promise<number | 'still open'> {
    const t0 = Date.now()
    const result = await Promise.race([
      started.close().then(() => Date.now() - t0),
      new Promise<'still open'>((resolve) => setTimeout(() => resolve('still open'), limitMs)),
    ])
    // Cleanup only, after the result is taken: let a hanging close() finish for afterEach.
    if (result === 'still open') started.httpServer.closeAllConnections()
    return result
  }

  // Review round 1, finding 1: `server.close()` only closes idle connections, so a
  // connection with an unfinished request kept the HTTP server, and with it the database,
  // open until the entry's 10 s shutdown timeout.
  it('closes a connection with an unfinished request (headers not complete) promptly and closes the database', async () => {
    const started = await startApp()
    const socket = tcpConnect(port, '127.0.0.1')
    openSockets.push(socket)
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()))
    socket.write(`GET / HTTP/1.1\r\nHost: ${own()}\r\n`)
    const socketClosed = closed(socket)
    // Let the server read the partial request.
    await new Promise((resolve) => setTimeout(resolve, 100))

    const elapsed = await timedClose(started, 3_000)
    expect(elapsed).not.toBe('still open')
    expect(elapsed).toBeLessThan(2_000)
    await socketClosed
    expect(started.httpServer.listening).toBe(false)
    expect(existsSync(`${dbPath}-wal`)).toBe(false)
  })

  it('closes a connection whose request Next.js never answers promptly', async () => {
    let handlerCalled!: () => void
    const called = new Promise<void>((resolve) => (handlerCalled = resolve))
    const started = await startApp({}, { handleRequest: vi.fn(async () => handlerCalled()) })
    const pending = httpRequest('/', { host: own() }).catch((error: Error) => error)
    await called

    const elapsed = await timedClose(started, 3_000)
    expect(elapsed).not.toBe('still open')
    expect(elapsed).toBeLessThan(2_000)
    expect(await pending).toBeInstanceOf(Error)
    expect(existsSync(`${dbPath}-wal`)).toBe(false)
  })

  it('lets a request that finishes within the grace period complete', async () => {
    let handlerCalled!: () => void
    const called = new Promise<void>((resolve) => (handlerCalled = resolve))
    const started = await startApp(
      {},
      {
        handleRequest: vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
          handlerCalled()
          setTimeout(() => res.end('late page'), 200)
        }),
      },
    )
    const pending = httpRequest('/', { host: own() })
    await called

    await started.close()
    expect(await pending).toMatchObject({ status: 200, body: 'late page' })
  })

  it('works when the server never listened and closes the database', () => {
    const config = parseConfig({ PORT: String(port), CHAT_DB_PATH: dbPath })
    const created = createApp({ config, next: { handleRequest, handleUpgrade } })
    app = created
    expect(existsSync(`${dbPath}-wal`)).toBe(true)
    return created.close().then(() => expect(existsSync(`${dbPath}-wal`)).toBe(false))
  })
})
