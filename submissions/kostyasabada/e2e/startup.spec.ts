import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { freePort, serverMode, spawnServerProcess } from './fixtures/chat-server'

// Uses Playwright's base `test`, not the extended one: the extended `test` overrides
// `baseURL` with the `chatServer` fixture, and Playwright's automatic context-option
// fixtures resolve `baseURL` for every test, which would start a chat server here too.
// In dev mode that server would hold Next's `.next/dev/lock`, and the server under test
// would stop with "Another next dev server is already running" before it tries to listen.
// The port is held by a plain TCP server instead, so the check works in both modes.
const EXIT_WAIT_MS = 20_000

test('the server exits with code 1 when its port is already in use', async () => {
  const port = await freePort()
  const holder = createServer()
  await new Promise<void>((resolve) => holder.listen(port, '127.0.0.1', resolve))
  const dir = await mkdtemp(path.join(tmpdir(), 'chat-e2e-'))
  const server = spawnServerProcess(port, path.join(dir, 'chat.sqlite'), serverMode())
  let output = ''
  server.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()))
  server.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()))
  let exitCode: number | null | 'still running'
  try {
    // Bounded wait below the 30 s test timeout: on a test timeout Playwright abandons the
    // test body, so the cleanup in `finally` would not run.
    exitCode = await Promise.race([
      new Promise<number | null>((resolve) => server.once('exit', (code) => resolve(code))),
      new Promise<'still running'>((resolve) => setTimeout(() => resolve('still running'), EXIT_WAIT_MS)),
    ])
  } finally {
    // Never leave the server (or its tsx child) running.
    try {
      if (server.pid !== undefined) process.kill(-server.pid, 'SIGKILL')
    } catch {
      // Process group already gone.
    }
    await new Promise((resolve) => holder.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }

  expect(output).toContain('EADDRINUSE')
  expect(exitCode).toBe(1)
})
