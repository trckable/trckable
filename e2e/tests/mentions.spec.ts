// Where the site is talked about: the card under the dashboard's cards, its
// words in Settings, and Live's chip. The server's mentions are faked through
// the route, the way the Down badge fakes the probe.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import AxeBuilder from '@axe-core/playwright'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const NOW = Math.floor(Date.now() / 1000)

const words = { default: [HISTORY_DOMAIN, 'History'], added: ['Acme Metrics'], max: 10 }
const mentions = [
  { id: 3, source: 'hn', url: 'https://news.ycombinator.com/item?id=41000001', title: 'Show HN: Acme Metrics, privacy-friendly analytics', author: 'maker1', host: 'news.ycombinator.com', points: 212, comments: 87, snippet: 'Been looking for something like Acme Metrics for my side projects: no cookies, one script, and it just works.', front: true, posted_at: NOW - 2 * 3600, found_at: NOW - 3600, visitors: 1212, peak_hour: NOW - 3600, driving: true },
  { id: 2, source: 'news', url: 'https://dailybyte.example/acme-launches', title: 'Acme launches a new dashboard', host: 'dailybyte.example', posted_at: NOW - 30 * 3600, found_at: NOW - 29 * 3600, visitors: 38 },
  { id: 1, source: 'ph', url: 'https://www.producthunt.com/posts/acme-metrics', title: 'Acme Metrics: analytics without the creep', author: 'maker1', host: 'producthunt.com', points: 321, posted_at: NOW - 5 * 86400, found_at: NOW - 5 * 86400, visitors: 0 },
]
const answer = (list: unknown[]) => ({ mentions: list, sources: ['hn', 'ph', 'news'], words, driving: list[0] && (list[0] as { driving?: boolean }).driving ? list[0] : null })

test('the card lists what was found with the visitors it brought, and the words open in Settings', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('mentions'), url: API }])
  let saved: string[] | null = null
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: answer(mentions) }))
  await page.route('**/api/v1/sites', async (r) => {
    const res = await r.fetch() // the site says it has mentions: only then does the chart ask for its pins
    const body = (await res.json()) as { sites: { mentions?: boolean }[] }
    body.sites.forEach((s) => (s.mentions = true))
    await r.fulfill({ response: res, json: body })
  })
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
  await expect(page.locator('.mp-pin').first()).toBeVisible() // the chart marks where a mention was posted
  await page.locator('.mp-pin').first().hover()
  await expect(page.getByRole('tooltip')).toContainText('visitors')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-pin-dark-1440.png`, clip: { x: 0, y: 150, width: 1440, height: 500 } })
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
  await expect(page.locator('.kpi .value.num').first()).toBeVisible({ timeout: 20_000 })
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

// The page behind "All mentions": hero, feed with filters, the detail panel and the empty state.
const hours = (peak: number) => Array.from({ length: 49 }, (_, i) => Math.round(peak * Math.exp(-i / 6) * (i === 0 ? 0.1 : 1)))
const detail = { mention: mentions[0], curve: hours(300), usual: hours(300).map((n) => n + 6), step: 3600, lead: 600, pages: [{ name: '/', visitors: 700 }, { name: '/pricing', visitors: 310 }], countries: [{ name: 'US', visitors: 640 }, { name: 'DE', visitors: 210 }], goals: 41 }

async function seed(page: import('@playwright/test').Page, list: unknown[], who: string) {
  await page.context().addCookies([{ name: 'trckable_session', value: await session(who), url: API }])
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: answer(list) }))
  await page.route('**/api/v1/sites/*/mentions/curves*', (r) => r.fulfill({ json: { curves: { 3: hours(300), 2: hours(20) }, step: 3600, lead: 600 } }))
  await page.route('**/api/v1/sites/*/mentions/3', (r) => r.fulfill({ json: detail }))
}

test('the mentions page shows who is talking now, filters the feed and opens one in full', async ({ page }) => {
  test.slow()
  await seed(page, mentions, 'mentions-page')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${API}/${HISTORY_DOMAIN}/mentions`)
  const hero = page.locator('.mp-hero')
  await expect(hero).toContainText('Talked about now', { timeout: 20_000 })
  await expect(hero).toContainText('1,212 visitors so far')
  await expect(hero).toContainText('still coming')
  const feed = page.locator('.mp-feed')
  await expect(feed.locator('.mp-card')).toHaveCount(3)
  await expect(feed.locator('.mp-card').first()).toContainText('Front page')
  await expect(feed.locator('.mp-card').first()).toContainText('by maker1')
  await expect(feed.locator('.mp-card.quiet')).toHaveCount(1) // the launch that brought nobody still shows, quieter
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-page-dark-1440.png` })

  await feed.getByRole('button', { name: 'News & blogs' }).click()
  await expect(feed.locator('.mp-card')).toHaveCount(1)
  await feed.getByRole('button', { name: 'All', exact: true }).click()

  await feed.locator('.mp-card').first().getByRole('button', { name: /Details/ }).click()
  const panel = page.getByRole('dialog', { name: 'Mention details' })
  await expect(panel).toContainText('/pricing')
  await expect(panel).toContainText('41 visitors from it reached a goal')
  await expect(panel.getByRole('link', { name: 'Reply on Hacker News' })).toHaveAttribute('href', 'https://news.ycombinator.com/item?id=41000001')
  expect(page.url()).toContain('?m=3')
  await expect(panel.getByRole('button', { name: 'Close' })).toBeFocused()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-detail-dark-1440.png` })
  const found = (await new AxeBuilder({ page }).exclude('.brand').analyze()).violations
  expect(found.map((v) => `${v.id} ${v.nodes.map((n) => n.target.join()).join(' | ')}`)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await page.emulateMedia({ colorScheme: 'light' })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-page-light-1440.png` })
})

test('a phone gets the page and the detail as a sheet; with nothing found the page teaches', async ({ page }) => {
  test.slow()
  await seed(page, mentions, 'mentions-phone')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${API}/${HISTORY_DOMAIN}/mentions?m=3`)
  await expect(page.getByRole('dialog', { name: 'Mention details' })).toContainText('/pricing', { timeout: 20_000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-detail-light-390.png` })
  await page.getByRole('button', { name: 'Close' }).click()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-page-light-390.png` })

  await page.unroute('**/api/v1/sites/*/mentions?*')
  let saved: string[] | null = null
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: answer([]) }))
  await page.route('**/api/v1/sites/*/mentions/keywords', async (r) => {
    saved = (r.request().postDataJSON() as { keywords: string[] }).keywords
    await r.fulfill({ json: { ...words, added: saved } })
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(`${API}/${HISTORY_DOMAIN}/mentions`)
  const empty = page.locator('.mp-empty')
  await expect(empty).toContainText('No mentions yet', { timeout: 20_000 })
  await expect(empty.locator('.mp-sample')).toContainText('sample')
  await expect(empty.locator('.mp-tile')).toHaveCount(3)
  await expect(empty.locator('li.mentions-word')).toHaveCount(3)
  await empty.getByRole('button', { name: 'Add a word' }).click()
  await empty.getByLabel('Word to look for').fill('@acmemetrics')
  await page.keyboard.press('Enter')
  await expect.poll(() => saved).toEqual(['Acme Metrics', '@acmemetrics'])
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-empty-dark-390.png` })
})
