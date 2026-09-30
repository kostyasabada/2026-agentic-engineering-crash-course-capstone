import type { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test'
import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client'
import type { ChatMessage } from '../src/lib/chat/schema'
import { SqliteMessageRepository } from '../src/server/chat/message.repository'
import { closeDatabase, openDatabase } from '../src/server/db/sqlite'
import { expect, test } from './fixtures/chat-server'

// Messaging (chat-room spec: "Real-time message delivery", "Message validation",
// "Server-assigned ordering and timestamps", the message clauses of "Nickname entry
// without registration", and the send-failure scenario). Validation messages are the
// shared schema's messages (src/lib/chat/schema.ts), used here as test oracles.
const MESSAGE_REQUIRED = 'Message is required.'
const MESSAGE_TOO_LONG = 'Message must be at most 1000 characters.'
const NICKNAME_REQUIRED = 'Nickname is required.'
const NICKNAME_CHARS =
  'Nickname may contain only letters, digits, spaces, hyphens (-), underscores (_), and periods (.).'

type Shown = { nickname: string; text: string }

// Per-test state: every browser context and Node client opened by a test is closed after
// it, and browser console errors, uncaught page errors, and dialogs (e.g. `alert` from
// injected markup) of every context fail the test.
let browserErrors: string[] = []
let contexts: BrowserContext[] = []
let nodeClients: Socket[] = []

test.beforeEach(() => {
  browserErrors = []
  contexts = []
  nodeClients = []
})

test.afterEach(async () => {
  for (const client of nodeClients) client.disconnect()
  for (const context of contexts) await context.close()
  expect(browserErrors, 'browser console errors, page errors, and dialogs').toEqual([])
})

// ---- Browser helpers (roles and labels; alerts scoped to their container because Next.js
// also renders a route announcer with role="alert").
const chatRegion = (page: Page) => page.getByRole('region', { name: 'Chat', exact: true })
const messageInput = (page: Page) => page.getByRole('textbox', { name: 'Message', exact: true })
const sendButton = (page: Page) => chatRegion(page).getByRole('button', { name: 'Send', exact: true })
const composer = (page: Page) => chatRegion(page).getByRole('form', { name: 'Send a message' })
const composerAlerts = (page: Page) => composer(page).getByRole('alert')
const counter = (page: Page) => composer(page).getByText(/^\d+\/1000$/)
const messageList = (page: Page) => chatRegion(page).getByRole('list', { name: 'Messages' })
const currentNickname = (page: Page) => page.getByText(/^Chatting as /)
const nicknameInput = (page: Page) => page.getByLabel('Nickname', { exact: true })

/** Nickname and exact text (textContent, not whitespace-normalized) of every shown message. */
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

/** Opens the chat page in a new, independent browser context (time zone UTC by default). */
async function openClient(
  browser: Browser,
  baseURL: string,
  label: string,
  options: BrowserContextOptions = {},
  beforeGoto?: (page: Page) => Promise<void>,
): Promise<Page> {
  const context = await browser.newContext({ baseURL, timezoneId: 'UTC', ...options })
  contexts.push(context)
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`${label} console: ${message.text()}`)
  })
  page.on('pageerror', (error) => browserErrors.push(`${label} pageerror: ${error.message}`))
  page.on('dialog', (dialog) => {
    browserErrors.push(`${label} dialog: ${dialog.type()} ${dialog.message()}`)
    void dialog.dismiss()
  })
  if (beforeGoto) await beforeGoto(page)
  await page.goto('/')
  return page
}

async function join(page: Page, nickname: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 2, name: 'Choose a nickname' })).toBeVisible()
  await nicknameInput(page).fill(nickname)
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(currentNickname(page)).toHaveText(`Chatting as ${nickname.trim()}`)
}

async function openChat(
  browser: Browser,
  baseURL: string,
  label: string,
  nickname: string,
  options: BrowserContextOptions = {},
): Promise<Page> {
  const page = await openClient(browser, baseURL, label, options)
  await join(page, nickname)
  // Sending is enabled once the socket is connected.
  await expect(sendButton(page)).toBeEnabled()
  return page
}

/** Types the text (fill) and presses Enter, then waits until the input is cleared. */
async function send(page: Page, text: string): Promise<void> {
  await messageInput(page).fill(text)
  await expect(sendButton(page)).toBeEnabled()
  await messageInput(page).press('Enter')
  await expect(messageInput(page)).toHaveValue('')
}

async function changeNickname(page: Page, nickname: string): Promise<void> {
  await page.getByRole('button', { name: 'Change nickname' }).click()
  await nicknameInput(page).fill(nickname)
  await page.getByRole('button', { name: 'Save nickname' }).click()
  await expect(currentNickname(page)).toHaveText(`Chatting as ${nickname}`)
}

// ---- Node helpers: a modified or foreign client built on socket.io-client in the test process.
type ClientOptions = Partial<ManagerOptions & SocketOptions>

function nodeClient(baseURL: string, options: ClientOptions = {}): Socket {
  const socket = io(baseURL, { transports: ['websocket'], reconnection: false, forceNew: true, ...options })
  nodeClients.push(socket)
  return socket
}

function connectOutcome(socket: Socket): Promise<string> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve('connected'))
    socket.once('connect_error', (error) => resolve(`refused: ${error.message}`))
  })
}

/** Records every `message:new` a connected observer receives. */
async function observer(baseURL: string): Promise<ChatMessage[]> {
  const socket = nodeClient(baseURL)
  const received: ChatMessage[] = []
  socket.on('message:new', (message: ChatMessage) => received.push(message))
  expect(await connectOutcome(socket)).toBe('connected')
  return received
}

// ---- Tests

test('a message reaches another independent browser context without a reload', async ({ browser, baseURL }) => {
  const alice = await openChat(browser, baseURL!, 'A', 'Alice')
  const bob = await openChat(browser, baseURL!, 'B', 'Bob')
  await bob.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true))

  await send(alice, 'Hello Bob')

  await expectMessages(bob, [{ nickname: 'Alice', text: 'Hello Bob' }])
  await expectMessages(alice, [{ nickname: 'Alice', text: 'Hello Bob' }])
  expect(await bob.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
})

test('two messages sent in quick succession appear in the same server order in both contexts', async ({
  browser,
  baseURL,
}) => {
  const received = await observer(baseURL!)
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  const b = await openChat(browser, baseURL!, 'B', 'Bob')
  await messageInput(a).fill('from A')
  await messageInput(b).fill('from B')

  await Promise.all([messageInput(a).press('Enter'), messageInput(b).press('Enter')])

  await expect.poll(() => received.length).toBe(2)
  const serverOrder = [...received]
    .sort((x, y) => x.id - y.id)
    .map((message) => ({ nickname: message.nickname, text: message.text }))
  await expectMessages(a, serverOrder)
  await expectMessages(b, serverOrder)
})

test('markup in a message is shown literally: no element is created and no script runs', async ({
  browser,
  baseURL,
}) => {
  const markup = '<img src=x onerror=alert(1)><b>bold</b>'
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  const b = await openChat(browser, baseURL!, 'B', 'Bob')

  await send(a, markup)

  for (const page of [a, b]) {
    await expectMessages(page, [{ nickname: 'Alice', text: markup }])
    await expect(messageList(page).locator('img, b')).toHaveCount(0)
  }
  // A dialog from `alert(1)` would also be recorded in browserErrors and fail the test.
})

test('a three-line message is shown on three lines', async ({ browser, baseURL }) => {
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  const b = await openChat(browser, baseURL!, 'B', 'Bob')

  // Shift+Enter inserts a line break; Enter sends.
  await messageInput(a).pressSequentially('one')
  await messageInput(a).press('Shift+Enter')
  await messageInput(a).pressSequentially('two')
  await messageInput(a).press('Shift+Enter')
  await messageInput(a).pressSequentially('three')
  await expect(messageInput(a)).toHaveValue('one\ntwo\nthree')
  await messageInput(a).press('Enter')

  for (const page of [a, b]) {
    await expectMessages(page, [{ nickname: 'Alice', text: 'one\ntwo\nthree' }])
    const text = messageList(page).getByRole('listitem').locator('.message__text')
    // innerText follows the rendered layout (white-space), textContent above does not.
    expect(await text.evaluate((element) => (element as HTMLElement).innerText)).toBe('one\ntwo\nthree')
    const renderedLines = await text.evaluate((element) => {
      const style = getComputedStyle(element)
      return Math.round(element.getBoundingClientRect().height / parseFloat(style.lineHeight))
    })
    expect(renderedLines).toBe(3)
  }
})

test('surrounding whitespace is trimmed and the counter shows the trimmed length', async ({ browser, baseURL }) => {
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  const b = await openChat(browser, baseURL!, 'B', 'Bob')

  await expect(counter(a)).toHaveText('0/1000')
  await messageInput(a).fill('   hi there   ')
  await expect(counter(a)).toHaveText('8/1000')
  await messageInput(a).press('Enter')
  await expect(messageInput(a)).toHaveValue('')
  await expect(counter(a)).toHaveText('0/1000')

  await expectMessages(b, [{ nickname: 'Alice', text: 'hi there' }])
  await expectMessages(a, [{ nickname: 'Alice', text: 'hi there' }])
})

test('empty and whitespace-only messages are not sent', async ({ browser, baseURL }) => {
  const received = await observer(baseURL!)
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  const b = await openChat(browser, baseURL!, 'B', 'Bob')

  for (const value of ['', '   ', ' \t \n \n ']) {
    await messageInput(a).fill(value)
    await messageInput(a).press('Enter')
    await expect(composerAlerts(a)).toHaveText([MESSAGE_REQUIRED])
    await sendButton(a).click()
    await expect(composerAlerts(a)).toHaveText([MESSAGE_REQUIRED])
    await expect(messageInput(a)).toHaveValue(value)
    await expect(counter(a)).toHaveText('0/1000')
  }

  // A later valid message is the first and only one delivered.
  await send(a, 'marker')
  await expect(composerAlerts(a)).toHaveCount(0)
  await expectMessages(b, [{ nickname: 'Alice', text: 'marker' }])
  await expectMessages(a, [{ nickname: 'Alice', text: 'marker' }])
  expect(received.map((message) => message.text)).toEqual(['marker'])
})

test('oversized typed or pasted text is kept in full with the limit message and sending blocked', async ({
  browser,
  baseURL,
}) => {
  const received = await observer(baseURL!)
  const a = await openChat(browser, baseURL!, 'A', 'Alice', { permissions: ['clipboard-read', 'clipboard-write'] })
  const b = await openChat(browser, baseURL!, 'B', 'Bob')
  await expect(messageInput(a)).not.toHaveAttribute('maxlength')

  // Typed past the limit.
  const typed = `${'a'.repeat(1000)}bc`
  await messageInput(a).fill('a'.repeat(1000))
  await expect(counter(a)).toHaveText('1000/1000')
  await expect(composerAlerts(a)).toHaveCount(0)
  await messageInput(a).pressSequentially('bc')
  await expect(messageInput(a)).toHaveValue(typed)
  await expect(counter(a)).toHaveText('1002/1000')
  await expect(composerAlerts(a)).toHaveText([MESSAGE_TOO_LONG])
  await expect(sendButton(a)).toBeDisabled()
  await messageInput(a).press('Enter')
  await expect(messageInput(a)).toHaveValue(typed)

  // Pasted from the clipboard (1500 characters).
  const pasted = 'p'.repeat(1500)
  await messageInput(a).fill('')
  await a.evaluate((text) => navigator.clipboard.writeText(text), pasted)
  await messageInput(a).focus()
  await a.keyboard.press('ControlOrMeta+V')
  await expect(messageInput(a)).toHaveValue(pasted)
  await expect(counter(a)).toHaveText('1500/1000')
  await expect(composerAlerts(a)).toHaveText([MESSAGE_TOO_LONG])
  await expect(sendButton(a)).toBeDisabled()
  await messageInput(a).press('Enter')
  await expect(messageInput(a)).toHaveValue(pasted)

  await send(a, 'marker')
  await expectMessages(b, [{ nickname: 'Alice', text: 'marker' }])
  expect(received.map((message) => message.text)).toEqual(['marker'])
})

test('a message of exactly 1000 characters is accepted', async ({ browser, baseURL }) => {
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  const b = await openChat(browser, baseURL!, 'B', 'Bob')
  const plain = 'y'.repeat(1000)
  // An emoji is a surrogate pair and counts as two characters (UTF-16 code units).
  const withEmoji = `${'e'.repeat(998)}\u{1F600}`
  expect(withEmoji.length).toBe(1000)

  for (const text of [plain, withEmoji]) {
    await messageInput(a).fill(text)
    await expect(counter(a)).toHaveText('1000/1000')
    await expect(composerAlerts(a)).toHaveCount(0)
    await messageInput(a).press('Enter')
    await expect(messageInput(a)).toHaveValue('')
  }

  const expected = [
    { nickname: 'Alice', text: plain },
    { nickname: 'Alice', text: withEmoji },
  ]
  await expectMessages(b, expected)
  await expectMessages(a, expected)
})

test('1000 characters surrounded by spaces (1020 before trimming) are accepted', async ({ browser, baseURL }) => {
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  const b = await openChat(browser, baseURL!, 'B', 'Bob')
  const core = 'z'.repeat(1000)
  const raw = `${' '.repeat(10)}${core}${' '.repeat(10)}`
  expect(raw.length).toBe(1020)

  await messageInput(a).fill(raw)
  await expect(counter(a)).toHaveText('1000/1000')
  await expect(composerAlerts(a)).toHaveCount(0)
  await expect(sendButton(a)).toBeEnabled()
  await messageInput(a).press('Enter')
  await expect(messageInput(a)).toHaveValue('')

  await expectMessages(b, [{ nickname: 'Alice', text: core }])
})

test('timestamps are shown as local HH:MM', async ({ browser, baseURL, chatServer }) => {
  // Seed a message accepted at 2026-09-26T14:05:00Z (the spec example) through the
  // repository while the server is stopped (design D6 seeding), then start it again.
  await chatServer.stop()
  const db = openDatabase(chatServer.dbPath)
  try {
    new SqliteMessageRepository(db).insert({ nickname: 'Alice', text: 'seeded', createdAt: '2026-09-26T14:05:00.000Z' })
  } finally {
    closeDatabase(db)
  }
  await chatServer.start()

  const utc = await openChat(browser, baseURL!, 'UTC', 'Bob')
  const seeded = (page: Page) => messageList(page).getByRole('listitem').filter({ hasText: 'seeded' }).locator('time')
  await expect(seeded(utc)).toHaveText('14:05')
  await expect(seeded(utc)).toHaveAttribute('datetime', '2026-09-26T14:05:00.000Z')

  // Local time: the same message in a browser whose time zone is UTC+05:30.
  const kolkata = await openChat(browser, baseURL!, 'Kolkata', 'Kiran', { timezoneId: 'Asia/Kolkata' })
  await expect(seeded(kolkata)).toHaveText('19:35')

  // A live message shows the hours and minutes of its server timestamp in UTC.
  await send(utc, 'live')
  const live = messageList(utc).getByRole('listitem').filter({ hasText: 'live' }).locator('time')
  await expect(live).toHaveText(/^\d{2}:\d{2}$/)
  const createdAt = await live.getAttribute('datetime')
  expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  await expect(live).toHaveText(createdAt!.slice(11, 16))
})

test('oversized and invalid-nickname payloads from a modified socket.io-client are rejected and not shown', async ({
  browser,
  baseURL,
}) => {
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  const b = await openChat(browser, baseURL!, 'B', 'Bob')
  const rogue = nodeClient(baseURL!)
  const broadcasts: string[] = []
  rogue.on('message:new', (message: ChatMessage) => broadcasts.push(message.text))
  expect(await connectOutcome(rogue)).toBe('connected')
  const sendRaw = (payload: unknown) => rogue.timeout(5000).emitWithAck('message:send', payload)

  expect(await sendRaw({ nickname: 'Mallory', text: 'x'.repeat(1001) })).toMatchObject({
    ok: false,
    error: { code: 'invalid_text' },
  })
  expect(await sendRaw({ nickname: 'bob@home', text: 'from an invalid nickname' })).toMatchObject({
    ok: false,
    error: { code: 'invalid_nickname' },
  })
  expect(await sendRaw({ nickname: 'n'.repeat(33), text: 'from a too-long nickname' })).toMatchObject({
    ok: false,
    error: { code: 'invalid_nickname' },
  })
  // A valid message sent afterwards is delivered; the rejected ones never were.
  expect(await sendRaw({ nickname: 'Mallory', text: 'valid after rejections' })).toMatchObject({ ok: true })

  const expected = [{ nickname: 'Mallory', text: 'valid after rejections' }]
  await expectMessages(a, expected)
  await expectMessages(b, expected)
  expect(broadcasts).toEqual(['valid after rejections'])
  // Nothing rejected was stored either: a reload shows the same history.
  await b.reload()
  await expectMessages(b, expected)
})

test('a socket.io-client connection with a foreign Origin is refused', async ({ browser, baseURL }) => {
  const a = await openChat(browser, baseURL!, 'A', 'Alice')

  for (const transports of [['websocket'], ['polling']]) {
    const foreign = nodeClient(baseURL!, { transports, extraHeaders: { Origin: 'http://evil.example' } })
    let history = false
    foreign.on('history', () => (history = true))
    expect(await connectOutcome(foreign), `transports ${transports.join()}`).toMatch(/^refused: /)
    foreign.emit('message:send', { nickname: 'Eve', text: `from a foreign origin (${transports.join()})` })
    expect(foreign.connected).toBe(false)
    expect(history).toBe(false)
  }

  // Control: the same client with the page's own Origin connects and gets the history.
  const own = nodeClient(baseURL!, { extraHeaders: { Origin: baseURL! } })
  const ownHistory = new Promise((resolve) => own.once('history', resolve))
  expect(await connectOutcome(own)).toBe('connected')
  await ownHistory

  await send(a, 'marker')
  await expectMessages(a, [{ nickname: 'Alice', text: 'marker' }])
})

/**
 * Routes the page's Socket.IO WebSocket through the test (page.routeWebSocket). `onSend`
 * decides what happens to each `message:send` packet the page sends after the transport
 * upgrade: forward it (possibly changed) to the server, or drop it (return undefined).
 */
async function routeSends(page: Page, onSend: (packet: string) => string | undefined): Promise<() => boolean> {
  let upgraded = false
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((message) => {
      if (message === '5') upgraded = true // engine.io "upgrade" packet: later packets use this WebSocket
      if (typeof message === 'string' && /^42\d+\["message:send"/.test(message)) {
        const forwarded = onSend(message)
        if (forwarded !== undefined) server.send(forwarded)
        return
      }
      server.send(message)
    })
    server.onMessage((message) => ws.send(message))
  })
  return () => upgraded
}

test('a send rejected by the server shows the error and keeps the text for a retry', async ({ browser, baseURL }) => {
  const received = await observer(baseURL!)
  let breakNickname = true
  let isUpgraded: () => boolean = () => false
  const a = await openClient(browser, baseURL!, 'A', {}, async (page) => {
    // Corrupts the nickname in transit so that the real server rejects the send
    // (invalid_nickname ack), as it would for any server-side rejection.
    isUpgraded = await routeSends(page, (packet) =>
      breakNickname ? packet.replace('"nickname":"Alice"', '"nickname":"bob@home"') : packet,
    )
  })
  await join(a, 'Alice')
  await expect(sendButton(a)).toBeEnabled()
  await expect.poll(isUpgraded).toBe(true)

  await messageInput(a).fill('keep me')
  await messageInput(a).press('Enter')
  await expect(composerAlerts(a)).toHaveText([`Message not sent: ${NICKNAME_CHARS}`])
  await expect(messageInput(a)).toHaveValue('keep me')
  await expect(sendButton(a)).toBeEnabled()
  await expectMessages(a, [])

  // Retry with the route repaired: the kept text is sent and the error disappears.
  breakNickname = false
  await sendButton(a).click()
  await expect(messageInput(a)).toHaveValue('')
  await expect(composerAlerts(a)).toHaveCount(0)
  await expectMessages(a, [{ nickname: 'Alice', text: 'keep me' }])
  expect(received.map((message) => message.text)).toEqual(['keep me'])
})

test('a send that is not confirmed within 5 seconds shows the error and keeps the text', async ({
  browser,
  baseURL,
}) => {
  // This test waits for the real 5-second acknowledgement timeout (design D2) once.
  let isUpgraded: () => boolean = () => false
  const a = await openClient(browser, baseURL!, 'A', {}, async (page) => {
    isUpgraded = await routeSends(page, () => undefined) // drop every send: no ack arrives
  })
  await join(a, 'Alice')
  await expect(sendButton(a)).toBeEnabled()
  await expect.poll(isUpgraded).toBe(true)

  await messageInput(a).fill('no answer')
  const sentAt = Date.now()
  await messageInput(a).press('Enter')
  await expect(sendButton(a)).toBeDisabled() // waiting for the acknowledgement
  await expect(composerAlerts(a)).toHaveText(['Message not sent: the server did not confirm it within 5 seconds.'], {
    timeout: 10_000,
  })
  expect(Date.now() - sentAt).toBeGreaterThanOrEqual(4_900)
  await expect(messageInput(a)).toHaveValue('no answer')
  await expect(sendButton(a)).toBeEnabled()
  await expectMessages(a, [])
})

/**
 * Routes the page's Socket.IO WebSocket through the test and passes every acknowledgement
 * packet the server sends to the page (`43<ack id>[...]`) through `onAck`, which returns the
 * packet to deliver instead (review finding F2 of task 5.2: a malformed ack).
 */
async function routeAcks(page: Page, onAck: (packet: string) => string): Promise<() => boolean> {
  let upgraded = false
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((message) => {
      if (message === '5') upgraded = true
      server.send(message)
    })
    server.onMessage((message) => ws.send(typeof message === 'string' && /^43\d+\[/.test(message) ? onAck(message) : message))
  })
  return () => upgraded
}

test('a malformed acknowledgement shows an error, keeps the text, and re-enables sending', async ({
  browser,
  baseURL,
}) => {
  // Each attempt reaches the real server, which stores and broadcasts the message; only
  // the ack that comes back is replaced. So the client cannot tell whether the message was
  // accepted: it says so, keeps the text, and the broadcast still shows the stored message.
  let replacement: string | undefined
  let isUpgraded: () => boolean = () => false
  const a = await openClient(browser, baseURL!, 'A', {}, async (page) => {
    isUpgraded = await routeAcks(page, (packet) =>
      replacement === undefined ? packet : packet.replace(/^(43\d+)\[[\s\S]*\]$/, `$1${replacement}`),
    )
  })
  await join(a, 'Alice')
  await expect(sendButton(a)).toBeEnabled()
  await expect.poll(isUpgraded).toBe(true)

  const malformed = ['["not an ack"]', '[null]', '[{"ok":true}]', '[{"ok":false}]', '[{"ok":true,"message":{"id":"1"}}]']
  const shown: Shown[] = []
  for (const [index, ack] of malformed.entries()) {
    replacement = ack
    const text = `attempt ${index + 1}`
    await messageInput(a).fill(text)
    await messageInput(a).press('Enter')
    await expect(composerAlerts(a)).toHaveText(['Message not confirmed: the server sent an invalid response.'])
    await expect(messageInput(a)).toHaveValue(text)
    await expect(sendButton(a)).toBeEnabled()
    shown.push({ nickname: 'Alice', text })
    await expectMessages(a, shown)
  }

  // A well-formed ack again: the send succeeds, the error disappears, the input is cleared.
  replacement = undefined
  await messageInput(a).fill('confirmed')
  await messageInput(a).press('Enter')
  await expect(messageInput(a)).toHaveValue('')
  await expect(composerAlerts(a)).toHaveCount(0)
  await expectMessages(a, [...shown, { nickname: 'Alice', text: 'confirmed' }])
})

// ---- Message clauses of the nickname requirement (deferred from task 5.1).

test('a valid trimmed nickname enables the message input and attributes messages to it', async ({
  browser,
  baseURL,
}) => {
  const a = await openClient(browser, baseURL!, 'A')
  await join(a, '  Alice_1  ')
  await expect(messageInput(a)).toBeEnabled()
  await expect(sendButton(a)).toBeEnabled()
  const b = await openChat(browser, baseURL!, 'B', 'Bob')

  await send(a, 'hello from Alice_1')
  await expectMessages(b, [{ nickname: 'Alice_1', text: 'hello from Alice_1' }])
})

test('while an empty or whitespace-only nickname is rejected, no message input is available', async ({
  browser,
  baseURL,
}) => {
  const a = await openClient(browser, baseURL!, 'A')
  for (const value of ['', '   ']) {
    await nicknameInput(a).fill(value)
    await a.getByRole('button', { name: 'Join' }).click()
    await expect(a.getByRole('form', { name: 'Choose a nickname' }).getByRole('alert')).toHaveText(NICKNAME_REQUIRED)
    await expect(messageInput(a)).toHaveCount(0)
    await expect(a.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0)
  }
})

test('a changed nickname applies to later messages only, on every client and after a reload', async ({
  browser,
  baseURL,
}) => {
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  const b = await openChat(browser, baseURL!, 'B', 'Bob')

  await send(a, 'first')
  await changeNickname(a, 'Alicia')
  await send(a, 'second')

  const expected = [
    { nickname: 'Alice', text: 'first' },
    { nickname: 'Alicia', text: 'second' },
  ]
  await expectMessages(a, expected)
  await expectMessages(b, expected)

  await a.reload()
  await expect(currentNickname(a)).toHaveText('Chatting as Alicia')
  await expectMessages(a, expected)
})

test('two clients with the same nickname can both send, each attributed to it', async ({ browser, baseURL }) => {
  const first = await openChat(browser, baseURL!, 'Sam 1', 'Sam')
  const second = await openChat(browser, baseURL!, 'Sam 2', 'Sam')

  await send(first, 'from the first Sam')
  await expectMessages(second, [{ nickname: 'Sam', text: 'from the first Sam' }])
  await send(second, 'from the second Sam')

  const expected = [
    { nickname: 'Sam', text: 'from the first Sam' },
    { nickname: 'Sam', text: 'from the second Sam' },
  ]
  await expectMessages(first, expected)
  await expectMessages(second, expected)
})
