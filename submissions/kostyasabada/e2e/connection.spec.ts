import type { Browser, BrowserContext, ConsoleMessage, Page, WebSocketRoute } from '@playwright/test'
import type { ChatMessage } from '../src/lib/chat/schema'
import { SqliteMessageRepository } from '../src/server/chat/message.repository'
import { closeDatabase, openDatabase } from '../src/server/db/sqlite'
import { expect, test, type ChatServer } from './fixtures/chat-server'

// Connection status and reconnection (chat-room spec: "Connection status and
// reconnection"; design D2, D6, Q5, Q12). The status labels are the spec's exact texts.
type Status = 'Connected' | 'Reconnecting' | 'Disconnected'
type Shown = { nickname: string; text: string }
type History = { mode: 'replace' | 'append'; messages: ChatMessage[] }

// Reconnection uses Socket.IO's backoff (capped at 2 s, design D2) plus the time until the
// restarted server answers, so a reconnect gets more than the default 5 s expect timeout.
const RECONNECT_TIMEOUT_MS = 15_000

// Bound for "no reconnection happens": if socket.io-client reconnected, its first attempt
// would come after `reconnectionDelay` (1 s) with ±50 % jitter, i.e. within 1.5 s, and no
// attempt is ever delayed beyond `reconnectionDelayMax` (2 s, design D2). Twice that max.
const NO_RECONNECT_WINDOW_MS = 4_000

// ---- Per-test state and the browser-error check.
//
// Every browser context is closed after the test, and console errors, uncaught page errors,
// and dialogs fail the test, with one exact exception: while a test has declared an outage
// for a page (the server is stopped, or the test blocks the page's Socket.IO traffic), the
// browser may log a failed reconnection attempt (whether one falls into the outage depends
// on the backoff timing). Tolerated then, and only then, is exactly the message text
// `Failed to load resource: net::ERR_CONNECTION_REFUSED` whose source URL is the page's own
// Socket.IO polling endpoint (`<baseURL>/socket.io/?EIO=4&transport=polling…`), the only
// form observed with the allowlist disabled (task 5.3 evidence). Everything else (other
// texts, other URLs, errors outside the outage) still fails the test.
let browserErrors: string[] = []
let contexts: BrowserContext[] = []
const outage = new Set<Page>()

test.beforeEach(() => {
  browserErrors = []
  contexts = []
  outage.clear()
})

test.afterEach(async () => {
  for (const context of contexts) await context.close()
  expect(browserErrors, 'browser console errors, page errors, and dialogs').toEqual([])
})

function isToleratedOutageError(page: Page, baseURL: string, message: ConsoleMessage): boolean {
  if (!outage.has(page)) return false
  return (
    message.text() === 'Failed to load resource: net::ERR_CONNECTION_REFUSED' &&
    message.location().url.startsWith(`${baseURL}/socket.io/?EIO=4&transport=polling`)
  )
}

// ---- Browser helpers (roles and labels, as in messaging.spec.ts).
const chatRegion = (page: Page) => page.getByRole('region', { name: 'Chat', exact: true })
const connectionStatus = (page: Page) => chatRegion(page).getByRole('status')
const messageInput = (page: Page) => page.getByRole('textbox', { name: 'Message', exact: true })
const sendButton = (page: Page) => chatRegion(page).getByRole('button', { name: 'Send', exact: true })
const composerAlerts = (page: Page) => chatRegion(page).getByRole('form', { name: 'Send a message' }).getByRole('alert')
const messageList = (page: Page) => chatRegion(page).getByRole('list', { name: 'Messages' })

function readMessages(page: Page): Promise<Shown[]> {
  return messageList(page)
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => ({
        nickname: item.querySelector('.message__author')?.textContent ?? '<no author>',
        text: item.querySelector('.message__text')?.textContent ?? '<no text>',
      })),
    )
}

async function expectMessages(page: Page, expected: Shown[]): Promise<void> {
  await expect.poll(() => readMessages(page)).toEqual(expected)
}

async function expectStatus(page: Page, status: Status, timeout?: number): Promise<void> {
  await expect(connectionStatus(page)).toHaveText(status, { timeout })
}

/**
 * Records every `history` event the page receives. On every (re)connection Socket.IO
 * connects over HTTP long-polling first (default transports), so the `history` packet
 * arrives in a polling response; each packet of an engine.io v4 payload is separated by
 * U+001E, and an event packet is `42["event",data]`.
 */
function recordHistory(page: Page): History[] {
  const received: History[] = []
  page.on('response', async (response) => {
    if (!response.url().includes('/socket.io/?EIO=4&transport=polling') || response.request().method() !== 'GET') {
      return
    }
    let body: string
    try {
      body = await response.text()
    } catch {
      return // the page or context was closed
    }
    for (const packet of body.split('\x1e')) {
      if (!packet.startsWith('42[')) continue
      const [event, data] = JSON.parse(packet.slice(2)) as [string, History]
      if (event === 'history') received.push(data)
    }
  })
  return received
}

const summarize = (histories: History[]) =>
  histories.map(({ mode, messages }) => ({ mode, texts: messages.map((message) => message.text) }))

/** Opens the chat page in a new, independent browser context (time zone UTC). */
async function openClient(
  browser: Browser,
  baseURL: string,
  label: string,
  beforeGoto?: (page: Page) => Promise<void>,
): Promise<Page> {
  const context = await browser.newContext({ baseURL, timezoneId: 'UTC' })
  contexts.push(context)
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() !== 'error' || isToleratedOutageError(page, baseURL, message)) return
    browserErrors.push(`${label} console: ${message.text()} (${message.location().url})`)
  })
  page.on('pageerror', (error) => browserErrors.push(`${label} pageerror: ${error.message}`))
  page.on('dialog', (dialog) => {
    browserErrors.push(`${label} dialog: ${dialog.type()} ${dialog.message()}`)
    void dialog.dismiss()
  })
  // Next.js dev mode only (E2E_SERVER_MODE=dev): its HMR client reloads the whole page when
  // it reconnects to a restarted dev server (new session id, `window.location.reload()` in
  // next/dist/client/dev/hot-reloader/app/web-socket.js), which would hide whether the chat
  // itself reconnects without a reload. The HMR WebSocket is therefore forwarded to the
  // server as usual, except that the server side closing (the dev server stopped) is not
  // passed on to the page: its HMR client never sees a disconnect, so it neither reconnects
  // nor reloads. A production server has no HMR socket, so the route never matches there.
  await page.routeWebSocket(/\/_next\/hmr/, (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((message) => server.send(message))
    server.onMessage((message) => ws.send(message))
    server.onClose(() => {})
  })
  if (beforeGoto) await beforeGoto(page)
  await page.goto('/')
  return page
}

async function openChat(
  browser: Browser,
  baseURL: string,
  label: string,
  nickname: string,
  beforeGoto?: (page: Page) => Promise<void>,
): Promise<Page> {
  const page = await openClient(browser, baseURL, label, beforeGoto)
  await page.getByLabel('Nickname', { exact: true }).fill(nickname)
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByText(/^Chatting as /)).toHaveText(`Chatting as ${nickname}`)
  await expectStatus(page, 'Connected')
  await expect(sendButton(page)).toBeEnabled()
  return page
}

async function send(page: Page, text: string): Promise<void> {
  await messageInput(page).fill(text)
  await expect(sendButton(page)).toBeEnabled()
  await messageInput(page).press('Enter')
  await expect(messageInput(page)).toHaveValue('')
}

const POLLING_URL = /\/socket\.io\/\?EIO=4&transport=polling/

/**
 * Resolves when one of the page's Socket.IO polling requests has failed, i.e. when a
 * reconnection attempt was made and did not reach the server (review finding R1 of task
 * 5.3: the status must stay `Reconnecting` after failed attempts, not only right after the
 * `disconnect` event, which comes before the first backoff attempt). Call it before the
 * outage starts so that the first failure is not missed. A failed polling request is
 * exactly the allowlisted console message (see the top of this file).
 */
function reconnectAttemptFailed(page: Page): Promise<unknown> {
  const failed = page.waitForEvent('requestfailed', {
    // A new handshake has no `sid`; a failed poll of the old session would carry one.
    predicate: (request) => POLLING_URL.test(request.url()) && !request.url().includes('sid='),
    timeout: RECONNECT_TIMEOUT_MS,
  })
  failed.catch(() => {}) // a test that fails earlier must not leave an unhandled rejection
  return failed
}

/** After at least one failed reconnection attempt: still `Reconnecting`, Send disabled. */
async function expectStillReconnecting(page: Page, failed: Promise<unknown>): Promise<void> {
  await failed
  await expectStatus(page, 'Reconnecting')
  await expect(sendButton(page)).toBeDisabled()
}

/** Sets a marker on `window`; it survives only as long as the page is not reloaded. */
async function markPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as { __noReload?: boolean }).__noReload = true
  })
}

async function expectNotReloaded(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
}

/** Stores messages directly in the fixture's database file; the server must be stopped (design D6 seeding). */
function seed(chatServer: ChatServer, texts: string[]): void {
  const db = openDatabase(chatServer.dbPath)
  try {
    const repository = new SqliteMessageRepository(db)
    for (const text of texts) repository.insert({ nickname: 'Seeder', text, createdAt: new Date().toISOString() })
  } finally {
    closeDatabase(db)
  }
}

const range = (from: number, to: number, prefix: string) =>
  Array.from({ length: to - from + 1 }, (_, index) => `${prefix} ${from + index}`)

// ---- Tests.

test('stopping the server shows Reconnecting and disables sending while the typed text is kept', async ({
  browser,
  baseURL,
  chatServer,
}) => {
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  await send(a, 'before the outage')
  await messageInput(a).fill('typed while online')

  outage.add(a)
  const failed = reconnectAttemptFailed(a)
  await chatServer.stop()

  await expectStatus(a, 'Reconnecting')
  await expect(sendButton(a)).toBeDisabled()
  await expect(messageInput(a)).toHaveValue('typed while online')
  // Still so after a reconnection attempt has failed (the server is down).
  await expectStillReconnecting(a, failed)
  await expect(messageInput(a)).toHaveValue('typed while online')
  // Enter does not send either (no offline queue); the text stays and no send error appears.
  await messageInput(a).press('Enter')
  await expect(messageInput(a)).toHaveValue('typed while online')
  await expect(composerAlerts(a)).toHaveCount(0)
  // The input stays editable while offline.
  await messageInput(a).fill('typed while offline')
  await expect(messageInput(a)).toHaveValue('typed while offline')
  await expect(sendButton(a)).toBeDisabled()
  await expectMessages(a, [{ nickname: 'Alice', text: 'before the outage' }])
})

test('after a server restart the clients reconnect without a reload, show Connected, and keep the history without duplicates', async ({
  browser,
  baseURL,
  chatServer,
}) => {
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  const b = await openChat(browser, baseURL!, 'B', 'Bob')
  await send(a, 'm1')
  await send(b, 'm2')
  const before = [
    { nickname: 'Alice', text: 'm1' },
    { nickname: 'Bob', text: 'm2' },
  ]
  await expectMessages(a, before)
  await expectMessages(b, before)
  for (const page of [a, b]) await markPage(page)
  await messageInput(a).fill('draft kept across the restart')

  outage.add(a)
  outage.add(b)
  const failed = reconnectAttemptFailed(a)
  await chatServer.stop()
  await expectStatus(a, 'Reconnecting')
  await expectStatus(b, 'Reconnecting')
  await expect(sendButton(a)).toBeDisabled()
  await expectStillReconnecting(a, failed)
  await expect(messageInput(a)).toHaveValue('draft kept across the restart')

  await chatServer.start()
  for (const page of [a, b]) {
    await expectStatus(page, 'Connected', RECONNECT_TIMEOUT_MS)
    outage.delete(page)
    await expectNotReloaded(page)
    await expect(sendButton(page)).toBeEnabled()
    await expectMessages(page, before)
  }
  await expect(messageInput(a)).toHaveValue('draft kept across the restart')

  // Sending works again and reaches the other client once.
  await messageInput(a).press('Enter')
  await expect(messageInput(a)).toHaveValue('')
  const after = [...before, { nickname: 'Alice', text: 'draft kept across the restart' }]
  await expectMessages(a, after)
  await expectMessages(b, after)
})

/**
 * Routes the page's Socket.IO WebSocket through the test (page.routeWebSocket, design D6 and
 * Q12) so that the test can cut the connection while the server keeps running. cut() blocks
 * the page's Socket.IO polling requests (a reconnection starts with polling; they fail as
 * `connection refused`, like a stopped server) and closes both ends of the routed WebSocket.
 * restore() lifts the block; the client's own backoff then reconnects it.
 */
async function controllableConnection(page: Page) {
  let upgraded = false
  let current: { ws: WebSocketRoute; server: WebSocketRoute } | undefined
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer()
    current = { ws, server }
    ws.onMessage((message) => {
      if (message === '5') upgraded = true // engine.io "upgrade": later packets use this WebSocket
      server.send(message)
    })
    server.onMessage((message) => ws.send(message))
  })
  const polling = /\/socket\.io\/\?EIO=4&transport=polling/
  return {
    isUpgraded: () => upgraded,
    async cut() {
      await page.route(polling, (route) => route.abort('connectionrefused'))
      const routed = current
      current = undefined
      await routed?.ws.close()
      await routed?.server.close()
    },
    async restore() {
      await page.unroute(polling)
    },
  }
}

test('messages sent while a client is disconnected are caught up in order without duplicates', async ({
  browser,
  baseURL,
}) => {
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  let connection: Awaited<ReturnType<typeof controllableConnection>> | undefined
  let histories: History[] = []
  const b = await openChat(browser, baseURL!, 'B', 'Bob', async (page) => {
    connection = await controllableConnection(page)
    histories = recordHistory(page)
  })
  await expect.poll(connection!.isUpgraded).toBe(true)

  // B already has messages, including its own (shown once although ack and broadcast both arrive).
  await send(a, 'a1')
  await send(b, 'b1')
  const had = [
    { nickname: 'Alice', text: 'a1' },
    { nickname: 'Bob', text: 'b1' },
  ]
  await expectMessages(b, had)
  await markPage(b)

  outage.add(b)
  const failed = reconnectAttemptFailed(b)
  await connection!.cut()
  await expectStatus(b, 'Reconnecting')
  await expect(sendButton(b)).toBeDisabled()
  await expectStillReconnecting(b, failed)

  // A sends while B is disconnected; the server keeps running.
  await send(a, 'm1')
  await send(a, 'm2')
  const all = [...had, { nickname: 'Alice', text: 'm1' }, { nickname: 'Alice', text: 'm2' }]
  await expectMessages(a, all)
  expect(await readMessages(b)).toEqual(had)
  await expectStatus(b, 'Reconnecting')

  await connection!.restore()
  await expectStatus(b, 'Connected', RECONNECT_TIMEOUT_MS)
  outage.delete(b)
  await expectNotReloaded(b)
  await expectMessages(b, all)

  // The catch-up was an `append` of exactly the missed messages (lastSeenId, design D2).
  await expect.poll(() => histories.length).toBe(2)
  expect(summarize(histories)).toEqual([
    { mode: 'replace', texts: [] },
    { mode: 'append', texts: ['m1', 'm2'] },
  ])

  // Live delivery works again and adds each message once.
  await send(a, 'after')
  await expectMessages(b, [...all, { nickname: 'Alice', text: 'after' }])
})

test("a client whose last seen message is newer than the server's history replaces its list with the server's messages", async ({
  browser,
  baseURL,
  chatServer,
}) => {
  // The spec example: the client last saw message 120; after a reset the newest is message 30.
  await chatServer.stop()
  seed(chatServer, range(1, 120, 'old'))
  await chatServer.start()

  let histories: History[] = []
  const a = await openChat(browser, baseURL!, 'A', 'Alice', async (page) => {
    histories = recordHistory(page)
  })
  await expectMessages(
    a,
    range(21, 120, 'old').map((text) => ({ nickname: 'Seeder', text })),
  )
  await markPage(a)

  outage.add(a)
  await chatServer.stop()
  await expectStatus(a, 'Reconnecting')
  await chatServer.resetDatabase()
  seed(chatServer, range(1, 30, 'new'))
  await chatServer.start()

  await expectStatus(a, 'Connected', RECONNECT_TIMEOUT_MS)
  outage.delete(a)
  await expectNotReloaded(a)
  const server = range(1, 30, 'new').map((text) => ({ nickname: 'Seeder', text }))
  await expectMessages(a, server)
  await expect(messageList(a).getByText(/^old /)).toHaveCount(0)

  // The reconnect sent lastSeenId 120 and the server answered with `replace` (rule (b), design D4).
  await expect.poll(() => histories.length).toBe(2)
  expect(summarize(histories)).toEqual([
    { mode: 'replace', texts: range(21, 120, 'old') },
    { mode: 'replace', texts: range(1, 30, 'new') },
  ])

  // The next message continues after the server's newest id.
  await send(a, 'after the reset')
  await expectMessages(a, [...server, { nickname: 'Alice', text: 'after the reset' }])
})

test('a session ended by the server shows Disconnected and disables sending while the typed text is kept', async ({
  browser,
  baseURL,
}) => {
  // The server never ends a session itself (the controller closes the transport instead,
  // which reconnects); a Socket.IO namespace DISCONNECT packet (`41`) injected into the
  // routed WebSocket reproduces `io server disconnect`, after which socket.io-client does
  // not reconnect by itself (design D2: reconnection not attempted → Disconnected).
  let upgraded = false
  let toPage: WebSocketRoute | undefined
  const a = await openChat(browser, baseURL!, 'A', 'Alice', async (page) => {
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
      const server = ws.connectToServer()
      toPage = ws
      ws.onMessage((message) => {
        if (message === '5') upgraded = true
        server.send(message)
      })
      server.onMessage((message) => ws.send(message))
    })
  })
  await expect.poll(() => upgraded).toBe(true)
  await messageInput(a).fill('typed before the server ended the session')

  // A reconnection always starts with a polling request. Watch for one from before the
  // packet is injected until NO_RECONNECT_WINDOW_MS later (review finding R5).
  const reconnectRequest = a
    .waitForEvent('request', { predicate: (request) => POLLING_URL.test(request.url()), timeout: NO_RECONNECT_WINDOW_MS })
    .then(
      (request) => `reconnection attempted: ${request.url()}`,
      () => 'no reconnection attempt',
    )
  toPage!.send('41')

  await expectStatus(a, 'Disconnected')
  await expect(sendButton(a)).toBeDisabled()
  await expect(messageInput(a)).toHaveValue('typed before the server ended the session')
  // No automatic reconnection (terminal until reload; user decision 2026-09-29).
  expect(await reconnectRequest).toBe('no reconnection attempt')
  await expectStatus(a, 'Disconnected')
  await expect(sendButton(a)).toBeDisabled()
  await expect(messageInput(a)).toHaveValue('typed before the server ended the session')
})
