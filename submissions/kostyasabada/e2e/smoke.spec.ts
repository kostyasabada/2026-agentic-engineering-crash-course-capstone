import { expect, test } from './fixtures/chat-server'

test('the chat page loads through the custom server', async ({ page, request }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle('Chat room')
  await expect(page.getByRole('heading', { level: 1, name: 'Chat room' })).toBeVisible()

  // The same server also answers the Socket.IO polling handshake.
  const handshake = await request.get('/socket.io/?EIO=4&transport=polling')
  expect(handshake.status()).toBe(200)
  expect(await handshake.text()).toMatch(/^0\{"sid":/)
})
