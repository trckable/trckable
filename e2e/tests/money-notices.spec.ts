// Money coming in is told in plain words the moment the stream brings it: a
// new customer, an upgrade, a refund, each as its own line, and money found
// late with its real time instead of "just now". The server's stream is faked
// with one answer of events; what is under test is what the dashboard says.
import { expect, test, type Page } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session } from './session'

// Set MONEY_SHOTS to a folder to also take the pictures for review.
const SHOTS = process.env.MONEY_SHOTS

const sale = (ts: number, text: string, change: string, amount: number, extra: object = {}) =>
  `event: sale\ndata: ${JSON.stringify({ kind: 'sale', ts, amount, currency: 'USD', exponent: 2, change, text, ...extra })}\n\n`

/** The stream answers once with these events, then stays out of the way. */
async function stream(page: Page, events: string) {
  let answered = false
  await page.route('**/live', (route) => {
    if (answered) return route.abort()
    answered = true
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: online\ndata: {"online":3}\n\n' + events })
  })
}

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('money-notices'), url: API }])
})

test('a new customer, an upgrade and a refund each show as a line in plain words', async ({ page }) => {
  const now = Date.now()
  await stream(page, sale(now, 'New customer · $42 · via Google', 'new', 4200) + sale(now, 'Upgrade · Pro → Business · +$218', 'upgrade', 21800) + sale(now, 'Refund · −$12', 'refund', 1200))
  await page.goto(`${API}/example.com`)
  const toasts = page.locator('.toast')
  await expect(toasts.filter({ hasText: 'New customer · $42 · via Google' })).toBeVisible()
  await expect(toasts.filter({ hasText: 'Upgrade · Pro → Business · +$218' })).toBeVisible()
  await expect(toasts.filter({ hasText: 'Refund · −$12' })).toBeVisible()
  await expect(page.getByText('Cha-ching')).toHaveCount(0)
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: `${SHOTS}/money-bell-${test.info().project.name}.png` })
  }
})

test('money found late says when it really happened', async ({ page }) => {
  const paid = new Date()
  paid.setHours(paid.getHours() - 5)
  await stream(page, sale(paid.getTime(), 'Renewal · $348', 'renewal', 34800, { late: true }))
  await page.goto(`${API}/example.com`)
  const toast = page.locator('.toast').filter({ hasText: 'Renewal · $348 · ' })
  await expect(toast).toBeVisible()
  await expect(toast).not.toContainText('just now')
})
