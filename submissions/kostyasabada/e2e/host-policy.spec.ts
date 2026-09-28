import { request } from 'node:http'
import { expect, serverMode, test } from './fixtures/chat-server'

// The Host check through the real entry with the real Next.js handlers (task 4.2; the
// detailed cases are Node tests in src/server/app.test.ts). Raw requests, because the
// browser and Playwright's request context cannot send a foreign `Host`.

type Result = { kind: 'response' | 'upgraded'; status: number } | { kind: 'error'; message: string }

function rawRequest(port: number, path: string, headers: Record<string, string>): Promise<Result> {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path, headers, setHost: false, agent: false })
    req.on('response', (res) => {
      res.resume()
      res.on('end', () => resolve({ kind: 'response', status: res.statusCode ?? 0 }))
    })
    req.on('upgrade', (res, socket) => {
      socket.destroy()
      resolve({ kind: 'upgraded', status: res.statusCode ?? 0 })
    })
    req.on('error', (error) => resolve({ kind: 'error', message: error.message }))
    req.end()
  })
}

const upgradeHeaders = {
  Connection: 'Upgrade',
  Upgrade: 'websocket',
  'Sec-WebSocket-Version': '13',
  'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
}

test('the real server refuses a foreign Host and serves its own hosts', async ({ chatServer }) => {
  const { port } = chatServer
  const evil = `evil.example:${port}`

  expect(await rawRequest(port, '/', { host: `localhost:${port}` })).toEqual({ kind: 'response', status: 200 })
  expect(await rawRequest(port, '/', { host: evil })).toEqual({ kind: 'response', status: 403 })
  expect(await rawRequest(port, '/socket.io/?EIO=4&transport=polling', { host: evil })).toEqual({
    kind: 'response',
    status: 403,
  })
  // After the first page request Next.js has registered its own upgrade listener; the
  // dispatcher still answers first.
  for (const path of ['/socket.io/?EIO=4&transport=websocket', '/_next/hmr']) {
    expect(await rawRequest(port, path, { ...upgradeHeaders, host: evil })).toEqual({ kind: 'response', status: 403 })
  }
  expect(
    await rawRequest(port, '/socket.io/?EIO=4&transport=websocket', { ...upgradeHeaders, host: `127.0.0.1:${port}` }),
  ).toEqual({ kind: 'upgraded', status: 101 })
})

test('the real server closes upgrades that neither Socket.IO nor Next.js owns', async ({ chatServer }) => {
  const { port } = chatServer
  const host = `127.0.0.1:${port}`
  expect(await rawRequest(port, '/', { host })).toEqual({ kind: 'response', status: 200 })
  expect(await rawRequest(port, '/custom-ws', { ...upgradeHeaders, host })).toEqual({ kind: 'response', status: 404 })
  // Next.js dev HMR still upgrades in development; in production nothing owns the path.
  expect(await rawRequest(port, '/_next/hmr', { ...upgradeHeaders, host })).toEqual(
    serverMode() === 'dev' ? { kind: 'upgraded', status: 101 } : { kind: 'response', status: 404 },
  )
})
