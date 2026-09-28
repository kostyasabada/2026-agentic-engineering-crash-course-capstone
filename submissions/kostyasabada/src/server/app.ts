import {
  createServer,
  STATUS_CODES,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http'
import type { Duplex } from 'node:stream'
import { Server as SocketIOServer } from 'socket.io'
import { registerChatController } from './chat/chat.controller'
import { createChatService } from './chat/chat.service'
import { SqliteMessageRepository } from './chat/message.repository'
import type { ServerConfig } from './config'
import { closeDatabase, openDatabase } from './db/sqlite'
import { createHostPolicy } from './http/host-policy'

/**
 * Composition root (design D4): wires config → database → repository → chat service →
 * Socket.IO → chat controller, and owns the HTTP server with the request and upgrade
 * dispatchers. It does not import `next`; the entry (`server.ts`) injects the Next.js
 * handlers, so tests can run the whole stack with stubs.
 */

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>
export type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => Promise<void>

/** The Next.js handlers the dispatchers pass non-Socket.IO traffic to. */
export type NextHandlers = {
  handleRequest: RequestHandler
  handleUpgrade: UpgradeHandler
}

export type CreateAppOptions = {
  config: ServerConfig
  next: NextHandlers
}

export type App = {
  /** Not listening yet: the caller listens (and handles listen errors). */
  httpServer: HttpServer
  io: SocketIOServer
  /**
   * Closes Socket.IO (disconnecting its clients), upgrades passed to Next.js that are still
   * open, the HTTP server (connections with requests still unfinished after a 1 s grace
   * period are closed), and the database, and resolves when all are closed. Idempotent:
   * every call returns the same promise. Works whether or not the server is listening.
   */
  close(): Promise<void>
}

/** Socket.IO's default path; engine.io matches it as a prefix of the request URL. */
const SOCKET_IO_PATH = '/socket.io/'

/** Next.js dev-server upgrades (HMR at `/_next/hmr`); no `basePath` is configured. */
const NEXT_DEV_UPGRADE_PREFIX = '/_next/'

/**
 * How long close() lets unfinished HTTP requests run before it closes their connections.
 * `server.close()` closes only idle connections, so without this a connection with an
 * unfinished request (a stalled client, a handler that never answers) would keep the HTTP
 * server, and the shutdown with it, open indefinitely (review round 1, finding 1).
 */
const CLOSE_GRACE_MS = 1_000

/** Reason given to engine.io when `allowRequest` refuses a handshake. */
const ORIGIN_NOT_ALLOWED = 'Origin not allowed'

function isSocketIoRequest(req: IncomingMessage): boolean {
  return (req.url ?? '').startsWith(SOCKET_IO_PATH)
}

/** Answers a refused HTTP request with 403 and closes the connection. */
function refuseRequest(res: ServerResponse): void {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' })
  res.end('Forbidden\n')
}

/**
 * Answers an upgrade request with a bare HTTP status and destroys the socket synchronously,
 * so that upgrade listeners running after the dispatcher (Next.js registers its own on the
 * first request) only ever see a destroyed socket.
 */
export function refuseUpgrade(socket: Duplex, status: 403 | 404): void {
  socket.on('error', () => {})
  if (socket.writable) {
    socket.write(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  }
  socket.destroy()
}

/**
 * Wraps Next.js's upgrade handler for the entry. Next.js 16 accepts only dev-server upgrades
 * (HMR), and it serves them through the `upgrade` listener it registers on the HTTP server
 * itself; for everything else it neither answers nor closes the socket, which would stay open
 * indefinitely (task 1.2 review, finding 2). In development, `/_next/` upgrades are passed on;
 * every other upgrade that reaches this handler is answered with 404 and destroyed.
 */
export function nextUpgradeHandler({
  dev,
  handleUpgrade,
}: {
  dev: boolean
  handleUpgrade: UpgradeHandler
}): UpgradeHandler {
  return async (req, socket, head) => {
    if (dev && (req.url ?? '').startsWith(NEXT_DEV_UPGRADE_PREFIX)) {
      await handleUpgrade(req, socket, head)
      return
    }
    refuseUpgrade(socket, 404)
  }
}

export function createApp({ config, next }: CreateAppOptions): App {
  const hostPolicy = createHostPolicy(config)
  const db = openDatabase(config.dbPath)
  const service = createChatService(new SqliteMessageRepository(db))

  // `requireHostHeader: false`: Node would otherwise answer an HTTP/1.1 request without a
  // `Host` with 400 before any listener runs; the host policy answers every missing,
  // unparsable, or foreign `Host` with 403 instead (design D2, Proposal P19).
  const httpServer = createServer({ requireHostHeader: false })
  // `destroyUpgrade: false`: Socket.IO must never end WebSocket upgrades it does not
  // own, such as Next.js dev HMR (design D2). The client script is bundled by Next.js,
  // so Socket.IO does not serve it.
  const io = new SocketIOServer({
    destroyUpgrade: false,
    serveClient: false,
    // Origin check at the handshake (design D2, Proposal P19). The dispatchers below have
    // already refused a foreign `Host`; it is checked again here because a handshake
    // without an `Origin` is accepted only with an own `Host`. A present `Origin` must be
    // an own origin; `null` and unparsable values are refused (the policy never throws).
    allowRequest: (req, callback) => {
      const origin = req.headers.origin
      const allowed =
        hostPolicy.isAllowedHost(req.headers.host) && (origin === undefined || hostPolicy.isAllowedOrigin(origin))
      callback(allowed ? null : ORIGIN_NOT_ALLOWED, allowed)
    },
  })
  io.attach(httpServer)
  registerChatController(io, service)

  // Explicit routing. `attach()` adds engine.io's own `request` and `upgrade` listeners,
  // which would run before anything else. The server was created without listeners, so
  // removing these leaves only the two dispatchers below, which see every request and
  // every upgrade first and hand them to engine.io or Next.js. engine.io keeps its
  // `listening`/`close` listeners.
  httpServer.removeAllListeners('request')
  httpServer.removeAllListeners('upgrade')

  // Upgrades handed to Next.js that are still open; close() destroys them, because the
  // HTTP server cannot finish closing while any connection is left.
  const nextUpgrades = new Set<Duplex>()

  httpServer.on('request', (req, res) => {
    // Single insertion point for the per-request policy (Host check, task 4.2).
    if (!hostPolicy.isAllowedHost(req.headers.host)) {
      refuseRequest(res)
      return
    }
    if (isSocketIoRequest(req)) {
      io.engine.handleRequest(req, res)
      return
    }
    next.handleRequest(req, res).catch((error: unknown) => {
      console.error('Next.js request handler failed', error)
      if (!res.headersSent) res.statusCode = 500
      res.end()
    })
  })

  httpServer.on('upgrade', (req, socket, head) => {
    // Single insertion point for the per-upgrade policy (Host check, task 4.2). The refusal
    // is synchronous, before any later `upgrade` listener runs.
    if (!hostPolicy.isAllowedHost(req.headers.host)) {
      refuseUpgrade(socket, 403)
      return
    }
    if (isSocketIoRequest(req)) {
      io.engine.handleUpgrade(req, socket, head)
      return
    }
    nextUpgrades.add(socket)
    socket.once('close', () => nextUpgrades.delete(socket))
    next.handleUpgrade(req, socket, head).catch((error: unknown) => {
      console.error('Next.js upgrade handler failed', error)
      socket.destroy()
    })
  })

  let closing: Promise<void> | undefined
  const close = (): Promise<void> => {
    closing ??= (async () => {
      const forceClose = setTimeout(() => httpServer.closeAllConnections(), CLOSE_GRACE_MS)
      try {
        for (const socket of nextUpgrades) socket.destroy()
        // Disconnects every Socket.IO client, closes engine.io, and closes the HTTP server
        // (resolving also when it was not listening). It resolves once the last connection
        // has ended; `forceClose` ends the ones still busy after the grace period.
        await io.close()
      } finally {
        clearTimeout(forceClose)
        closeDatabase(db)
      }
    })()
    return closing
  }

  return { httpServer, io, close }
}
