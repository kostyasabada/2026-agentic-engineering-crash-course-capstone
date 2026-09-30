import type { Browser, BrowserContext, Page } from '@playwright/test'
import type { ChatMessage } from '../src/lib/chat/schema'
import { SqliteMessageRepository } from '../src/server/chat/message.repository'
import { closeDatabase, openDatabase } from '../src/server/db/sqlite'
import { expect, test, type ChatServer } from './fixtures/chat-server'

// History on join, auto-scroll, empty room, and history after a restart (chat-room spec:
// "Recent history for a joining client", "History survives a server restart"; design D2,
// D6, Q4).
//
// Definitions used by these tests (documented in the task 5.4 evidence):
// - The conversation scrolls inside the message list (the `list` "Messages"), not the page.
// - "At the bottom": the list's `scrollHeight - scrollTop - clientHeight` is at most 1 px
//   (sub-pixel rounding) after the app has scrolled it to the newest message.
// - "Visible without scrolling": the message's list item lies entirely inside the list's
//   visible box and inside the browser viewport, and the page itself is not scrolled
//   (`window.scrollY === 0`), with no scroll action by the test.
// - Every browser context uses the same fixed viewport, so the layout is deterministic.
const VIEWPORT = { width: 1280, height: 720 }
const EMPTY_HINT = 'No messages yet.'

type Shown = { nickname: string; text: string }
type Rendered = Shown & { datetime: string; time: string }
type History = { mode: 'replace' | 'append'; messages: ChatMessage[] }
type Seed = { nickname: string; text: string; createdAt: string }

// ---- Per-test state and the browser-error check (as in messaging.spec.ts): every browser
// context is closed after the test, and console errors, uncaught page errors, and dialogs
// fail the test. There is no outage allowlist here: no page is open while the server is
// stopped (the restart test closes its pages first).
let browserErrors: string[] = []
let contexts: BrowserContext[] = []

test.beforeEach(() => {
  browserErrors = []
  contexts = []
})

test.afterEach(async () => {
  for (const context of contexts) await context.close()
  expect(browserErrors, 'browser console errors, page errors, and dialogs').toEqual([])
})

// ---- Browser helpers (roles and labels, as in messaging.spec.ts).
const chatRegion = (page: Page) => page.getByRole('region', { name: 'Chat', exact: true })
const messageInput = (page: Page) => page.getByRole('textbox', { name: 'Message', exact: true })
const sendButton = (page: Page) => chatRegion(page).getByRole('button', { name: 'Send', exact: true })
const messageList = (page: Page) => chatRegion(page).getByRole('list', { name: 'Messages' })
const messageText = (page: Page, text: string) =>
  messageList(page).locator('.message__text').getByText(text, { exact: true })
const emptyHint = (page: Page) => chatRegion(page).getByText(EMPTY_HINT, { exact: true })

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

/** Like readMessages, plus the `datetime` attribute (the server's createdAt) and the shown time. */
function readRendered(page: Page): Promise<Rendered[]> {
  return messageList(page)
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => ({
        nickname: item.querySelector('.message__author')?.textContent ?? '<no author>',
        text: item.querySelector('.message__text')?.textContent ?? '<no text>',
        datetime: item.querySelector('time')?.getAttribute('datetime') ?? '<no datetime>',
        time: item.querySelector('time')?.textContent ?? '<no time>',
      })),
    )
}

async function expectMessages(page: Page, expected: Shown[]): Promise<void> {
  await expect.poll(() => readMessages(page)).toEqual(expected)
}

type ScrollMetrics = { scrollTop: number; scrollHeight: number; clientHeight: number; pageScrollY: number }

function scrollMetrics(page: Page): Promise<ScrollMetrics> {
  return messageList(page).evaluate((list) => ({
    scrollTop: list.scrollTop,
    scrollHeight: list.scrollHeight,
    clientHeight: list.clientHeight,
    pageScrollY: window.scrollY,
  }))
}

const distanceFromBottom = (m: ScrollMetrics) => m.scrollHeight - m.scrollTop - m.clientHeight

/** True when the list is at the bottom (see the definitions at the top). */
async function atBottom(page: Page): Promise<boolean> {
  return distanceFromBottom(await scrollMetrics(page)) <= 1
}

/** True when the message with exactly this text is visible without scrolling (see the top). */
function visibleWithoutScrolling(page: Page, text: string): Promise<boolean> {
  return messageText(page, text).evaluate((element) => {
    const item = element.closest('li')
    const list = element.closest('ol')
    if (!item || !list) return false
    const box = item.getBoundingClientRect()
    const port = list.getBoundingClientRect()
    const insideList = box.top >= port.top - 0.5 && box.bottom <= port.bottom + 0.5
    const insideViewport = box.top >= 0 && box.bottom <= window.innerHeight && box.left >= 0 && box.right <= window.innerWidth
    return insideList && insideViewport && window.scrollY === 0
  })
}

/**
 * Waits for two rendering frames of the page. Scroll events are dispatched during a frame's
 * rendering update before its animation-frame callbacks, so afterwards every scroll event of
 * an earlier scroll position change has reached the app, and a scroll the app started in
 * reaction to a DOM change would already have moved the list. Frame synchronization, not a
 * timed sleep.
 */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

/**
 * Records every `history` event the page receives (copied from connection.spec.ts): the
 * first connection uses HTTP long-polling, so the `history` packet arrives in a polling
 * response; packets are separated by U+001E, and an event packet is `42["event",data]`.
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

/** Opens the chat page in a new, independent browser context (UTC, fixed viewport). */
async function openClient(
  browser: Browser,
  baseURL: string,
  label: string,
  beforeGoto?: (page: Page) => Promise<void> | void,
): Promise<Page> {
  const context = await browser.newContext({ baseURL, timezoneId: 'UTC', viewport: VIEWPORT })
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

async function openChat(
  browser: Browser,
  baseURL: string,
  label: string,
  nickname: string,
  beforeGoto?: (page: Page) => Promise<void> | void,
): Promise<Page> {
  const page = await openClient(browser, baseURL, label, beforeGoto)
  await page.getByLabel('Nickname', { exact: true }).fill(nickname)
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByText(/^Chatting as /)).toHaveText(`Chatting as ${nickname}`)
  // Sending is enabled once the socket is connected.
  await expect(sendButton(page)).toBeEnabled()
  return page
}

async function send(page: Page, text: string): Promise<void> {
  await messageInput(page).fill(text)
  await expect(sendButton(page)).toBeEnabled()
  await messageInput(page).press('Enter')
  await expect(messageInput(page)).toHaveValue('')
}

/**
 * Stores messages directly in the fixture's database file through the repository (design
 * D6 seeding): stops the server, inserts in order (ids 1, 2, … on a fresh database), starts it.
 */
async function seed(chatServer: ChatServer, rows: Seed[]): Promise<void> {
  await chatServer.stop()
  const db = openDatabase(chatServer.dbPath)
  try {
    const repository = new SqliteMessageRepository(db)
    for (const row of rows) repository.insert(row)
  } finally {
    closeDatabase(db)
  }
  await chatServer.start()
}

/** Messages "message 1" … "message <count>" by Seeder, one second apart from 10:00:00 UTC. */
function numbered(count: number): Seed[] {
  return Array.from({ length: count }, (_, index) => ({
    nickname: 'Seeder',
    text: `message ${index + 1}`,
    createdAt: new Date(Date.UTC(2026, 8, 26, 10, 0, index)).toISOString(),
  }))
}

const shownRange = (from: number, to: number): Shown[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ nickname: 'Seeder', text: `message ${from + index}` }))

// ---- Tests.

test('seeded 105 messages show exactly messages 6–105 oldest first, with message 105 visible without scrolling', async ({
  browser,
  baseURL,
  chatServer,
}) => {
  await seed(chatServer, numbered(105))
  const a = await openChat(browser, baseURL!, 'A', 'Alice')

  await expectMessages(a, shownRange(6, 105))
  await expect(emptyHint(a)).toHaveCount(0)
  // Message 105 is visible without any scroll action; the list is at the bottom, it scrolls
  // internally (more content than fits), and the page itself did not scroll.
  await expect.poll(() => visibleWithoutScrolling(a, 'message 105')).toBe(true)
  await expect.poll(() => atBottom(a)).toBe(true)
  const metrics = await scrollMetrics(a)
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)
  expect(metrics.pageScrollY).toBe(0)
  expect(await visibleWithoutScrolling(a, 'message 6')).toBe(false)

  // The scrollable list is reachable with the keyboard and does not trap focus.
  await a.getByRole('button', { name: 'Change nickname' }).focus()
  await a.keyboard.press('Tab')
  await expect(messageList(a)).toBeFocused()
  await a.keyboard.press('Tab')
  await expect(messageInput(a)).toBeFocused()
})

test('a new message from another client scrolls into view when the person is at the bottom', async ({
  browser,
  baseURL,
  chatServer,
}) => {
  await seed(chatServer, numbered(105))
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  await expectMessages(a, shownRange(6, 105))
  await expect.poll(() => atBottom(a)).toBe(true)
  const b = await openChat(browser, baseURL!, 'B', 'Bob')

  await send(b, 'from Bob 1')
  await expect(messageText(a, 'from Bob 1')).toHaveCount(1)
  await expect.poll(() => visibleWithoutScrolling(a, 'from Bob 1')).toBe(true)
  await expect.poll(() => atBottom(a)).toBe(true)

  // After reading older messages and returning to the newest one (keyboard Home, then End),
  // the next new message scrolls into view again.
  await messageList(a).focus()
  await a.keyboard.press('Home')
  await expect.poll(async () => (await scrollMetrics(a)).scrollTop).toBe(0)
  await a.keyboard.press('End')
  await expect.poll(() => atBottom(a)).toBe(true)
  await nextFrames(a)
  await send(b, 'from Bob 2')
  await expect(messageText(a, 'from Bob 2')).toHaveCount(1)
  await expect.poll(() => visibleWithoutScrolling(a, 'from Bob 2')).toBe(true)
  await expect.poll(() => atBottom(a)).toBe(true)
  expect((await readMessages(a)).slice(-2)).toEqual([
    { nickname: 'Bob', text: 'from Bob 1' },
    { nickname: 'Bob', text: 'from Bob 2' },
  ])
})

test('a new message from another client does not move the view when the person has scrolled up', async ({
  browser,
  baseURL,
  chatServer,
}) => {
  await seed(chatServer, numbered(105))
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  await expectMessages(a, shownRange(6, 105))
  await expect.poll(() => atBottom(a)).toBe(true)
  const b = await openChat(browser, baseURL!, 'B', 'Bob')

  // Scroll up to a middle position of the list and wait until the scroll event was handled
  // (resolves at once, without a scroll event, if the position did not change, e.g. because
  // the list does not scroll; the next assertion then fails).
  const target = await messageList(a).evaluate(
    (list) =>
      new Promise<number>((resolve) => {
        const start = list.scrollTop
        list.addEventListener('scroll', () => resolve(list.scrollTop), { once: true })
        list.scrollTop = Math.floor((list.scrollHeight - list.clientHeight) / 2)
        if (list.scrollTop === start) resolve(start)
      }),
  )
  expect(target).toBeGreaterThan(0)
  await nextFrames(a)
  const before = await scrollMetrics(a)
  expect(distanceFromBottom(before)).toBeGreaterThan(100)

  await send(b, 'while A reads older messages')
  // The new message has been rendered in A's list, then the view is where A left it.
  await expect(messageText(a, 'while A reads older messages')).toHaveCount(1)
  await nextFrames(a)
  const after = await scrollMetrics(a)
  expect(after.scrollTop).toBe(before.scrollTop)
  expect(after.pageScrollY).toBe(0)
  expect(after.scrollHeight).toBeGreaterThan(before.scrollHeight)
  expect(await visibleWithoutScrolling(a, 'while A reads older messages')).toBe(false)


  // Scrolled all the way up with the keyboard (Home): a further message does not move it either.
  await messageList(a).focus()
  await a.keyboard.press('Home')
  await expect.poll(async () => (await scrollMetrics(a)).scrollTop).toBe(0)
  await nextFrames(a)
  await send(b, 'second while A reads')
  await expect(messageText(a, 'second while A reads')).toHaveCount(1)
  await nextFrames(a)
  expect((await scrollMetrics(a)).scrollTop).toBe(0)
})

test('3 seeded messages show all 3, oldest first, with their nicknames and times', async ({
  browser,
  baseURL,
  chatServer,
}) => {
  await seed(chatServer, [
    { nickname: 'Alice', text: 'first', createdAt: '2026-09-26T09:01:00.000Z' },
    { nickname: 'Bob', text: 'second', createdAt: '2026-09-26T09:02:00.000Z' },
    { nickname: 'Carol', text: 'third', createdAt: '2026-09-26T09:03:00.000Z' },
  ])
  const a = await openChat(browser, baseURL!, 'A', 'Dave')

  await expect
    .poll(() => readRendered(a))
    .toEqual([
      { nickname: 'Alice', text: 'first', datetime: '2026-09-26T09:01:00.000Z', time: '09:01' },
      { nickname: 'Bob', text: 'second', datetime: '2026-09-26T09:02:00.000Z', time: '09:02' },
      { nickname: 'Carol', text: 'third', datetime: '2026-09-26T09:03:00.000Z', time: '09:03' },
    ])
  await expect(emptyHint(a)).toHaveCount(0)
  await expect.poll(() => visibleWithoutScrolling(a, 'first')).toBe(true)
  await expect.poll(() => visibleWithoutScrolling(a, 'third')).toBe(true)
})

test('an empty room shows a hint that there are no messages yet, which disappears when a message arrives', async ({
  browser,
  baseURL,
}) => {
  const a = await openChat(browser, baseURL!, 'A', 'Alice')

  await expect(emptyHint(a)).toBeVisible()
  await expect(messageList(a).getByRole('listitem')).toHaveCount(0)

  const b = await openChat(browser, baseURL!, 'B', 'Bob')
  await expect(emptyHint(b)).toBeVisible()
  await send(b, 'hello, empty room')
  await expectMessages(a, [{ nickname: 'Bob', text: 'hello, empty room' }])
  await expect(emptyHint(a)).toHaveCount(0)
  await expect(emptyHint(b)).toHaveCount(0)
})

test('after a server restart a new client shows identical history: ids, nicknames, texts, timestamps, order', async ({
  browser,
  baseURL,
  chatServer,
}) => {
  // Messages accepted through the running server (not seeded), from two clients.
  const a = await openChat(browser, baseURL!, 'A', 'Alice')
  const b = await openChat(browser, baseURL!, 'B', 'Bob')
  await send(a, 'first from Alice')
  await send(b, 'reply from Bob')
  await send(a, 'two\nlines')
  const expected: Shown[] = [
    { nickname: 'Alice', text: 'first from Alice' },
    { nickname: 'Bob', text: 'reply from Bob' },
    { nickname: 'Alice', text: 'two\nlines' },
  ]
  await expectMessages(a, expected)
  await expectMessages(b, expected)

  // A new client before the restart: its history event and the rendered list.
  let received: History[] = []
  const before = await openChat(browser, baseURL!, 'before', 'Carol', (page) => {
    received = recordHistory(page)
  })
  await expectMessages(before, expected)
  await expect.poll(() => received.length).toBe(1)
  const historyBefore = received[0]!
  expect(historyBefore.mode).toBe('replace')
  expect(historyBefore.messages.map(({ nickname, text }) => ({ nickname, text }))).toEqual(expected)
  const renderedBefore = await readRendered(before)

  // Close every page before the outage (no reconnection attempts, no console errors), then
  // stop and start the server on the same database file.
  for (const context of contexts) await context.close()
  await chatServer.stop()
  await chatServer.start()

  let receivedAfter: History[] = []
  const after = await openChat(browser, baseURL!, 'after', 'Dave', (page) => {
    receivedAfter = recordHistory(page)
  })
  await expectMessages(after, expected)
  await expect.poll(() => receivedAfter.length).toBe(1)
  // Same ids, nicknames, texts, createdAt, and order as before the restart.
  expect(receivedAfter[0]).toEqual(historyBefore)
  expect(await readRendered(after)).toEqual(renderedBefore)
  expect(renderedBefore.map((row) => row.datetime)).toEqual(historyBefore.messages.map((m) => m.createdAt))
})
