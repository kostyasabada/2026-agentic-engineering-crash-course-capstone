import next from 'next'
import { createApp, nextUpgradeHandler } from './src/server/app'
import { hostForUrl, parseConfig } from './src/server/config'

/** Upper bound for a graceful shutdown before the process exits with code 1. */
const SHUTDOWN_TIMEOUT_MS = 10_000

async function main(): Promise<void> {
  const config = parseConfig()
  const dev = process.env.NODE_ENV !== 'production'

  const nextApp = next({ dev, hostname: config.host, port: config.port })
  await nextApp.prepare()

  const app = createApp({
    config,
    next: {
      handleRequest: nextApp.getRequestHandler(),
      handleUpgrade: nextUpgradeHandler({ dev, handleUpgrade: nextApp.getUpgradeHandler() }),
    },
  })
  const { httpServer } = app

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

  // Graceful shutdown: close Socket.IO, the HTTP server, and the database (app.close()) and
  // Next.js, then exit. A second signal, a failure, or the timeout exits with code 1.
  let shuttingDown = false
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      console.error(`> Received ${signal} again, exiting immediately`)
      process.exit(1)
    }
    shuttingDown = true
    console.log(`> Received ${signal}, shutting down`)
    setTimeout(() => {
      console.error(`> Shutdown did not finish within ${SHUTDOWN_TIMEOUT_MS} ms`)
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS).unref()
    Promise.all([app.close(), nextApp.close()]).then(
      () => {
        console.log('> Server closed')
        process.exit(0)
      },
      (error: unknown) => {
        console.error('> Shutdown failed', error)
        process.exit(1)
      },
    )
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
