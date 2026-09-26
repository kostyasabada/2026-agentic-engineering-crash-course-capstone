import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test as base } from '@playwright/test'

/**
 * Per-test custom server (design D6): spawns `tsx server.ts` on a free port with a
 * fresh temporary CHAT_DB_PATH. E2E_SERVER_MODE=prod (default) runs NODE_ENV=production
 * and needs a prior `next build`; E2E_SERVER_MODE=dev runs NODE_ENV=development.
 */
export interface ChatServer {
  baseURL: string
  port: number
  dbPath: string
  /** Starts the server again on the same port and database file. */
  start(): Promise<void>
  /** Stops the server process and waits for it to exit. */
  stop(): Promise<void>
}

const PROJECT_DIR = path.resolve(__dirname, '../..')
const TSX_CLI = require.resolve('tsx/cli')
const STARTUP_TIMEOUT_MS = 60_000
const STOP_TIMEOUT_MS = 5_000
const READY_REQUEST_TIMEOUT_MS = 5_000

/** Sends a signal to a whole process group; a group that no longer exists is ignored. */
function signalGroup(group: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-group, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

/** Waits until no process of the group is left; returns false on timeout. */
async function groupExited(group: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      process.kill(-group, 0)
    } catch {
      return true
    }
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * Spawns `tsx server.ts` in its own process group (so that stop() can signal the tsx CLI
 * and the real server.ts process together; a SIGKILL cannot be relayed by the CLI).
 */
export function spawnServerProcess(port: number, dbPath: string, mode: 'prod' | 'dev'): ChildProcess {
  return spawn(process.execPath, [TSX_CLI, 'server.ts'], {
    cwd: PROJECT_DIR,
    env: {
      ...process.env,
      NODE_ENV: mode === 'prod' ? 'production' : 'development',
      PORT: String(port),
      HOST: '127.0.0.1',
      CHAT_DB_PATH: dbPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
}

export function serverMode(): 'prod' | 'dev' {
  const mode = process.env.E2E_SERVER_MODE ?? 'prod'
  if (mode !== 'prod' && mode !== 'dev') {
    throw new Error(`E2E_SERVER_MODE must be "prod" or "dev", got ${JSON.stringify(mode)}`)
  }
  return mode
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port')),
      )
    })
  })
}

export class ChatServerProcess implements ChatServer {
  readonly baseURL: string
  private child: ChildProcess | undefined
  private output = ''

  constructor(
    readonly port: number,
    readonly dbPath: string,
    private readonly mode: 'prod' | 'dev',
  ) {
    this.baseURL = `http://127.0.0.1:${port}`
  }

  async start(): Promise<void> {
    if (this.child) throw new Error('chat server is already running')
    this.output = ''
    const child = spawnServerProcess(this.port, this.dbPath, this.mode)
    this.child = child
    process.on('exit', this.killOnExit)
    child.stdout?.on('data', (chunk: Buffer) => (this.output += chunk.toString()))
    child.stderr?.on('data', (chunk: Buffer) => (this.output += chunk.toString()))
    const exited = new Promise<never>((_, reject) =>
      child.once('exit', (code, signal) =>
        reject(new Error(`chat server exited early (code ${code}, signal ${signal})\n${this.output}`)),
      ),
    )
    exited.catch(() => {})
    await Promise.race([this.waitUntilReady(), exited])
  }

  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    this.child = undefined
    process.off('exit', this.killOnExit)
    const group = child.pid
    if (group === undefined) return
    signalGroup(group, 'SIGTERM')
    if (!(await groupExited(group, STOP_TIMEOUT_MS))) {
      signalGroup(group, 'SIGKILL')
      await groupExited(group, STOP_TIMEOUT_MS)
    }
  }

  /** Last resort if the test process exits without running stop(). */
  private readonly killOnExit = () => {
    if (this.child?.pid !== undefined) signalGroup(this.child.pid, 'SIGKILL')
  }

  private async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${this.baseURL}/`, {
          signal: AbortSignal.timeout(READY_REQUEST_TIMEOUT_MS),
        })
        if (response.status === 200) return
      } catch {
        // Not listening yet, or the request timed out.
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error(`chat server did not answer GET / with 200 within ${STARTUP_TIMEOUT_MS} ms\n${this.output}`)
  }
}

export const test = base.extend<{ chatServer: ChatServer }>({
  chatServer: [
    async ({}, use) => {
      const dir = await mkdtemp(path.join(tmpdir(), 'chat-e2e-'))
      const server = new ChatServerProcess(await freePort(), path.join(dir, 'chat.sqlite'), serverMode())
      try {
        await server.start()
        await use(server)
      } finally {
        await server.stop()
        await rm(dir, { recursive: true, force: true })
      }
    },
    { timeout: STARTUP_TIMEOUT_MS + 10_000 },
  ],
  baseURL: async ({ chatServer }, use) => {
    await use(chatServer.baseURL)
  },
})

export { expect } from '@playwright/test'
