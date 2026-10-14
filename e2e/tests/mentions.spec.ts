// Where the site is talked about: the card under the dashboard's cards, its
// words in Settings, and Live's chip. The server's mentions are faked through
// the route, the way the Down badge fakes the probe.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const NOW = Math.floor(Date.now() / 1000)

const words = { default: [HISTORY_DOMAIN, 'History'], added: ['Acme Metrics'], max: 10 }
const mentions = [
  { id: 3, source: 'hn', url: 'https://news.ycombinator.com/item?id=41000001', title: 'Show HN: Acme Metrics, privacy-friendly analytics', author: 'maker1', host: 'news.ycombinator.com', points: 212, front: true, posted_at: NOW - 2 * 3600, found_at: NOW - 3600, visitors: 1212, peak_hour: NOW - 3600, driving: true },
  { id: 2, source: 'news', url: 'https://dailybyte.example/acme-launches', title: 'Acme launches a new dashboard', host: 'dailybyte.example', posted_at: NOW - 30 * 3600, found_at: NOW - 29 * 3600, visitors: 38 },
  { id: 1, source: 'ph', url: 'https://www.producthunt.com/posts/acme-metrics', title: 'Acme Metrics: analytics without the creep', author: 'maker1', host: 'producthunt.com', points: 321, posted_at: NOW - 5 * 86400, found_at: NOW - 5 * 86400, visitors: 0 },
]
const answer = (list: unknown[]) => ({ mentions: list, sources: ['hn', 'ph', 'news'], words, driving: list[0] && (list[0] as { driving?: boolean }).driving ? list[0] : null })

test('the card lists what was found with the visitors it brought, and the words open in Settings', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('mentions'), url: API }])
  let saved: string[] | null = null
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: answer(mentions) }))
  await page.route('**/api/v1/sites/*/mentions/keywords', async (r) => {
    saved = (r.request().postDataJSON() as { keywords: string[] }).keywords
    await r.fulfill({ json: { ...words, added: saved } })
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?period=7d`)
  const card = page.locator('.card.mentions')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByRole('heading', { name: 'Mentions' })).toBeVisible()
  await expect(card.getByRole('link', { name: /Show HN: Acme Metrics/ })).toHaveAttribute('href', 'https://news.ycombinator.com/item?id=41000001')
  await expect(card).toContainText('1,212')
  await expect(card).toContainText('Front page')
  await expect(card).toContainText('Hacker News, Product Hunt, and News & blogs')
  await expect(card).toContainText('History, Acme Metrics')
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/mentions-card-dark-1440.png` })
  await page.emulateMedia({ colorScheme: 'light' })
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/mentions-card-light-1440.png` })

  // The words: add one, save, and the server is sent the whole list.
  await card.getByRole('button', { name: 'Change the words' }).click()
  const set = page.getByRole('dialog')
  await expect(set.getByRole('heading', { name: 'Mentions' })).toBeVisible()
  await set.getByLabel('Word to search for').fill('@acmemetrics')
  await set.getByRole('button', { name: 'Add a word' }).click()
  await set.getByRole('button', { name: 'Save words' }).click()
  await expect.poll(() => saved).toEqual(['Acme Metrics', '@acmemetrics'])
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-settings-light-1440.png` })
})

test('nothing found yet says what is watched; a phone gets the same card', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('mentions-empty'), url: API }])
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: answer([]) }))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?period=7d`)
  const card = page.locator('.card.mentions')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card).toContainText('No mentions yet')
  await expect(card).toContainText('It searches for')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await card.scrollIntoViewIfNeeded()
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/mentions-empty-dark-390.png` })
})

test('Live says which mention is sending people right now', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('mentions-live'), url: API }])
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: answer(mentions) }))
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=live`)
  await expect(page.locator('.mention-chip')).toContainText('From Hacker News now', { timeout: 20_000 })
  await expect(page.locator('.mention-chip')).toContainText('1,212')
})
