import { createServer, type IncomingMessage } from 'node:http'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'
import { hostForUrl, parseConfig } from './src/server/config'

/** Socket.IO's default path; engine.io matches it as a prefix of the request URL. */
const SOCKET_IO_PATH = '/socket.io/'

function isSocketIoRequest(req: IncomingMessage): boolean {
  return (req.url ?? '').startsWith(SOCKET_IO_PATH)
}

async function main(): Promise<void> {
  const config = parseConfig()
  const dev = process.env.NODE_ENV !== 'production'

  const app = next({ dev, hostname: config.host, port: config.port })
  await app.prepare()
  const handleNext = app.getRequestHandler()
  const upgradeNext = app.getUpgradeHandler()

  const httpServer = createServer()
  // `destroyUpgrade: false`: Socket.IO must never end WebSocket upgrades it does not
  // own, such as Next.js dev HMR (design D2). The client script is bundled by Next.js,
  // so Socket.IO does not serve it.
  const io = new SocketIOServer({ destroyUpgrade: false, serveClient: false })
  io.attach(httpServer)

  // Explicit routing. `attach()` adds engine.io's own `request` and `upgrade` listeners,
  // which would run before anything else. The server was created without listeners, so
  // removing these leaves only the two dispatchers below, which see every request and
  // every upgrade first and hand them to engine.io or Next.js. engine.io keeps its
  // `listening`/`close` listeners.
  httpServer.removeAllListeners('request')
  httpServer.removeAllListeners('upgrade')

  httpServer.on('request', (req, res) => {
    // Single insertion point for the per-request policy (Host check, task 4.2).
    if (isSocketIoRequest(req)) {
      io.engine.handleRequest(req, res)
      return
    }
    handleNext(req, res).catch((error: unknown) => {
      console.error('Next.js request handler failed', error)
      if (!res.headersSent) res.statusCode = 500
      res.end()
    })
  })

  httpServer.on('upgrade', (req, socket, head) => {
    // Single insertion point for the per-upgrade policy (Host check, task 4.2).
    if (isSocketIoRequest(req)) {
      io.engine.handleUpgrade(req, socket, head)
      return
    }
    upgradeNext(req, socket, head).catch((error: unknown) => {
      console.error('Next.js upgrade handler failed', error)
      socket.destroy()
    })
  })

  // A failed listen (EADDRINUSE, EACCES) must fail the process: without this listener the
  // error reaches Next's `uncaughtException` handler, which only logs, and the process
  // then exits with code 0.
  httpServer.once('error', (error) => {
    console.error(`Could not listen on ${hostForUrl(config.host)}:${config.port}:`, error)
    process.exit(1)
  })

  httpServer.listen(config.port, config.host, () => {
    const mode = dev ? 'development' : 'production'
    console.log(`> Ready on http://${hostForUrl(config.host)}:${config.port} (${mode})`)
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
