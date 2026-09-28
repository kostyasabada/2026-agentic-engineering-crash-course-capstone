import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { connect as tcpConnect, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { io as connectClient } from 'socket.io-client'
import { SqliteMessageRepository } from '../src/server/chat/message.repository'
import { closeDatabase, openDatabase } from '../src/server/db/sqlite'
import { freePort, serverMode, spawnServerProcess } from './fixtures/chat-server'

// Graceful shutdown of the real entry (task 4.2, design D4): `tsx server.ts` is spawned
// in its own process group as the fixture does, a message is stored through Socket.IO,
// and the signal is sent to the group (as the fixture's stop() and a terminal's Ctrl+C
// do). The process must exit by itself with code 0 after closing Socket.IO and the
// database, leave no process of the group behind, and free the port.
// Uses Playwright's base `test` for the same reason as startup.spec.ts.
// Every wait is bounded well below the test timeout: on a test timeout Playwright abandons
// the test body, so the cleanup in `finally` would not run.
const READY_TIMEOUT_MS = 60_000
const STEP_TIMEOUT_MS = 10_000
const EXIT_WAIT_MS = 10_000

/** Rejects if `promise` does not settle within `ms`. */
function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), ms)),
  ])
}

function groupAlive(group: number): boolean {
  try {
    process.kill(-group, 0)
    return true
  } catch {
    return false
  }
}

function portAccepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = tcpConnect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

// Review round 1, finding 1: a connection with an unfinished request must not hold the
// shutdown until the entry's 10 s timeout (exit 1, database left open).
test('the server shuts down promptly on SIGTERM while a connection has an unfinished request', async () => {
  test.setTimeout(READY_TIMEOUT_MS + 60_000)
  const port = await freePort()
  const dir = await mkdtemp(path.join(tmpdir(), 'chat-e2e-'))
  const dbPath = path.join(dir, 'chat.sqlite')
  const server = spawnServerProcess(port, dbPath, serverMode())
  const group = server.pid!
  const killOnExit = () => {
    if (groupAlive(group)) process.kill(-group, 'SIGKILL')
  }
  process.on('exit', killOnExit)
  let output = ''
  server.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()))
  server.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()))
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    server.once('exit', (code, exitSignal) => resolve({ code, signal: exitSignal })),
  )
  let stalled: Socket | undefined
  try {
    await expect.poll(() => output, { timeout: READY_TIMEOUT_MS }).toContain('> Ready on')
    stalled = tcpConnect(port, '127.0.0.1')
    stalled.on('error', () => {})
    await within(new Promise((resolve) => stalled!.once('connect', resolve)), STEP_TIMEOUT_MS, 'the connection')
    stalled.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n`)
    await new Promise((resolve) => setTimeout(resolve, 200))

    const t0 = Date.now()
    process.kill(-group, 'SIGTERM')
    const result = await Promise.race([
      exit,
      new Promise<'still running'>((resolve) => setTimeout(() => resolve('still running'), 15_000)),
    ])
    const elapsed = Date.now() - t0
    expect(result, output).toEqual({ code: 0, signal: null })
    expect(elapsed).toBeLessThan(5_000)
    expect(output).toContain('> Server closed')
    await expect.poll(() => groupAlive(group), { timeout: 5_000 }).toBe(false)
    expect(existsSync(`${dbPath}-wal`)).toBe(false)
  } finally {
    stalled?.destroy()
    killOnExit()
    process.off('exit', killOnExit)
    await rm(dir, { recursive: true, force: true })
  }
})

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  test(`the server shuts down gracefully on ${signal} and keeps the stored messages`, async () => {
    test.setTimeout(READY_TIMEOUT_MS + 60_000)
    const port = await freePort()
    const dir = await mkdtemp(path.join(tmpdir(), 'chat-e2e-'))
    const dbPath = path.join(dir, 'chat.sqlite')
    const server = spawnServerProcess(port, dbPath, serverMode())
    const group = server.pid!
    // Last resort if the worker exits without running `finally` (as the fixture does).
    const killOnExit = () => {
      if (groupAlive(group)) process.kill(-group, 'SIGKILL')
    }
    process.on('exit', killOnExit)
    let output = ''
    server.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()))
    server.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()))
    const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
      server.once('exit', (code, exitSignal) => resolve({ code, signal: exitSignal })),
    )
    try {
      await expect.poll(() => output, { timeout: READY_TIMEOUT_MS }).toContain('> Ready on')

      const client = connectClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false })
      try {
        await within(
          new Promise((resolve, reject) => {
            client.once('history', resolve)
            client.once('connect_error', reject)
          }),
          STEP_TIMEOUT_MS,
          'the history',
        )
        const ack = (await within(
          client.timeout(STEP_TIMEOUT_MS).emitWithAck('message:send', { nickname: 'Ann', text: 'before shutdown' }),
          STEP_TIMEOUT_MS + 1_000,
          'the send ack',
        )) as { ok: boolean }
        expect(ack.ok).toBe(true)
        const disconnected = new Promise<string>((resolve) => client.once('disconnect', resolve))

        process.kill(-group, signal)

        const result = await Promise.race([
          exit,
          new Promise<'still running'>((resolve) => setTimeout(() => resolve('still running'), EXIT_WAIT_MS)),
        ])
        expect(result, output).toEqual({ code: 0, signal: null })
        expect(await within(disconnected, STEP_TIMEOUT_MS, 'the disconnect')).toBe('transport close')
      } finally {
        client.disconnect()
      }

      expect(output).toContain(`> Received ${signal}, shutting down`)
      expect(output).toContain('> Server closed')
      await expect.poll(() => groupAlive(group), { timeout: 5_000 }).toBe(false)
      expect(await portAccepts(port)).toBe(false)
      // The app closed its database connection (WAL files are removed with the last one).
      expect(existsSync(`${dbPath}-wal`)).toBe(false)
      const db = openDatabase(dbPath)
      try {
        expect(new SqliteMessageRepository(db).latest(100).map((message) => message.text)).toEqual([
          'before shutdown',
        ])
      } finally {
        closeDatabase(db)
      }
    } finally {
      // Never leave the server (or its tsx child) running.
      killOnExit()
      process.off('exit', killOnExit)
      await rm(dir, { recursive: true, force: true })
    }
  })
}
