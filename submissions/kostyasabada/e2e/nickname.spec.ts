import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/chat-server'

// Nickname entry (chat-room spec, requirement "Nickname entry without registration").
// Validation messages come from the shared schema in src/lib/chat/schema.ts.
const REQUIRED = 'Nickname is required.'
const TOO_LONG = 'Nickname must be at most 32 characters.'
const ALLOWED_CHARS =
  'Nickname may contain only letters, digits, spaces, hyphens (-), underscores (_), and periods (.).'
const STORAGE_KEY = 'chat.nickname'

/** Collects browser console errors and uncaught page errors (e.g. hydration mismatches). */
function trackBrowserErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  return errors
}

const nicknameInput = (page: Page) => page.getByLabel('Nickname', { exact: true })
// Scoped to the nickname form: Next.js also renders a route announcer with role="alert".
const nicknameError = (page: Page) => page.getByRole('form').getByRole('alert')
const currentNickname = (page: Page) => page.getByText(/^Chatting as /)
const storedNickname = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)

async function join(page: Page, nickname: string): Promise<void> {
  await nicknameInput(page).fill(nickname)
  await page.getByRole('button', { name: 'Join' }).click()
}

let browserErrors: string[] = []

test.beforeEach(async ({ page }) => {
  browserErrors = trackBrowserErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 2, name: 'Choose a nickname' })).toBeVisible()
})

test.afterEach(() => {
  expect(browserErrors, 'browser console errors').toEqual([])
})

test('a valid nickname is accepted and stored trimmed', async ({ page }) => {
  await expect(nicknameInput(page)).not.toHaveAttribute('maxlength')
  await join(page, '  Alice_1  ')

  await expect(currentNickname(page)).toHaveText('Chatting as Alice_1')
  await expect(page.getByRole('region', { name: 'Chat', exact: true })).toBeVisible()
  await expect(nicknameInput(page)).toHaveCount(0)
  expect(await storedNickname(page)).toBe('Alice_1')
})

test('an empty or whitespace-only nickname is rejected with a message', async ({ page }) => {
  for (const value of ['', '   ']) {
    await nicknameInput(page).fill(value)
    await page.getByRole('button', { name: 'Join' }).click()

    await expect(nicknameError(page)).toHaveText(REQUIRED)
    await expect(nicknameInput(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(nicknameInput(page)).toHaveAccessibleDescription(new RegExp(REQUIRED.replace('.', '\\.')))
    await expect(currentNickname(page)).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Chat', exact: true })).toHaveCount(0)
  }
  expect(await storedNickname(page)).toBeNull()
})

test('a too-long nickname is rejected and kept in full', async ({ page }) => {
  const tooLong = 'a'.repeat(33)
  await nicknameInput(page).fill(tooLong)

  // The limit message and the trimmed length are shown while typing; confirming is blocked.
  await expect(nicknameError(page)).toHaveText(TOO_LONG)
  await expect(page.getByText('33/32')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Join' })).toBeDisabled()
  await nicknameInput(page).press('Enter')

  await expect(nicknameInput(page)).toHaveValue(tooLong)
  await expect(currentNickname(page)).toHaveCount(0)
  expect(await storedNickname(page)).toBeNull()
})

test('surrounding whitespace does not count toward the limit; astral letters count as two units', async ({
  page,
}) => {
  await nicknameInput(page).fill(`  ${'b'.repeat(32)}  `)
  await expect(page.getByText('32/32')).toBeVisible()
  await expect(nicknameError(page)).toHaveCount(0)

  await nicknameInput(page).fill('\u{20000}'.repeat(17))
  await expect(page.getByText('34/32')).toBeVisible()
  await expect(nicknameError(page)).toHaveText(TOO_LONG)

  await join(page, '\u{20000}'.repeat(16))
  await expect(currentNickname(page)).toHaveText(`Chatting as ${'\u{20000}'.repeat(16)}`)
})

test('nicknames with disallowed characters are rejected with the allowed characters listed', async ({
  page,
}) => {
  for (const value of ['<script>', 'bob@home', 'a\u00B2', '\u0301abc']) {
    await join(page, value)

    await expect(nicknameError(page)).toHaveText(ALLOWED_CHARS)
    await expect(nicknameInput(page)).toHaveValue(value)
    await expect(currentNickname(page)).toHaveCount(0)
  }
  expect(await storedNickname(page)).toBeNull()
})

test('a nickname with combining marks is accepted as entered', async ({ page }) => {
  await join(page, 'प्रिया')
  await expect(currentNickname(page)).toHaveText('Chatting as प्रिया')
  expect(await storedNickname(page)).toBe('प्रिया')
})

test('the nickname is remembered after a reload', async ({ page }) => {
  await join(page, 'Alice')
  await expect(currentNickname(page)).toHaveText('Chatting as Alice')

  await page.reload()
  await expect(currentNickname(page)).toHaveText('Chatting as Alice')
  await expect(nicknameInput(page)).toHaveCount(0)
})

test('the nickname can be changed and the change survives a reload', async ({ page }) => {
  // "Messages sent after the change carry the new nickname" needs the composer and is
  // covered by the messaging E2E of task 5.2; here the current nickname and storage are checked.
  await join(page, 'Alice')
  await page.getByRole('button', { name: 'Change nickname' }).click()
  await expect(nicknameInput(page)).toHaveValue('Alice')
  await nicknameInput(page).fill('  Alicia ')
  await page.getByRole('button', { name: 'Save nickname' }).click()

  await expect(currentNickname(page)).toHaveText('Chatting as Alicia')
  expect(await storedNickname(page)).toBe('Alicia')

  await page.reload()
  await expect(currentNickname(page)).toHaveText('Chatting as Alicia')
})

test('an invalid nickname change is rejected and the previous nickname stays in use', async ({ page }) => {
  await join(page, 'Alice')
  await page.getByRole('button', { name: 'Change nickname' }).click()

  await nicknameInput(page).fill('bob@home')
  await page.getByRole('button', { name: 'Save nickname' }).click()
  await expect(nicknameError(page)).toHaveText(ALLOWED_CHARS)

  await nicknameInput(page).fill('   ')
  await page.getByRole('button', { name: 'Save nickname' }).click()
  await expect(nicknameError(page)).toHaveText(REQUIRED)

  await nicknameInput(page).fill('c'.repeat(40))
  await expect(nicknameError(page)).toHaveText(TOO_LONG)
  await expect(page.getByRole('button', { name: 'Save nickname' })).toBeDisabled()
  expect(await storedNickname(page)).toBe('Alice')

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(currentNickname(page)).toHaveText('Chatting as Alice')
  await page.reload()
  await expect(currentNickname(page)).toHaveText('Chatting as Alice')
})

test('the same nickname can be used in two independent browser contexts', async ({ page, browser, baseURL }) => {
  // Server-side acceptance of messages from both `Sam`s is covered by task 5.2 (messaging).
  await join(page, 'Sam')
  await expect(currentNickname(page)).toHaveText('Chatting as Sam')

  const other = await browser.newContext({ baseURL })
  try {
    const otherPage = await other.newPage()
    const otherErrors = trackBrowserErrors(otherPage)
    await otherPage.goto('/')
    await join(otherPage, 'Sam')
    await expect(currentNickname(otherPage)).toHaveText('Chatting as Sam')
    await expect(currentNickname(page)).toHaveText('Chatting as Sam')
    expect(otherErrors, 'browser console errors in the second context').toEqual([])
  } finally {
    await other.close()
  }
})

test('an invalid stored nickname is ignored and the form is shown', async ({ page }) => {
  await page.evaluate((key) => window.localStorage.setItem(key, '<b>x</b>'), STORAGE_KEY)
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: 'Choose a nickname' })).toBeVisible()
  await expect(currentNickname(page)).toHaveCount(0)
})

test('the form still works when localStorage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const fail = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    Storage.prototype.getItem = fail
    Storage.prototype.setItem = fail
  })
  await page.reload()
  await join(page, 'Alice')
  await expect(currentNickname(page)).toHaveText('Chatting as Alice')
})
