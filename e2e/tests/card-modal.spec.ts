// The side cards' dialogs: a card's one button opens a dialog that tells the moment in detail, and
// closing it (its Close, or Escape) puts the side card away with it, for the day. What the server finds is
// given by the browser here (its rules are tested in Go); the card, the dialog and its focus are real.
//   CARD_MODAL_SHOTS=/some/folder  also takes the pictures for review.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.CARD_MODAL_SHOTS
const DOMAIN = 'example.com'

const assistants = {
  visitors: 20,
  crawled: 140,
  crawlers: true,
  google: false,
  referrers: [
    { value: 'chatgpt.com', visitors: 12 },
    { value: 'perplexity.ai', visitors: 5 },
    { value: 'claude.ai', visitors: 3 },
  ],
  bots: [{ name: 'GPTBot', kind: 'train', hits: 100 }],
  pages: [
    { path: '/blog/self-hosting', read: 90, sent: 9 },
    { path: '/pricing', read: 10, sent: 7 },
    { path: '/docs', read: 40, sent: 4 },
  ],
}

/** Nothing for the card on opening to say, an AI visitor already seen, and the exclude-your-visits card already put away: the AI & Search card is the day's. */
async function given(page: Page, ai: boolean) {
  await page.route(/\/api\/v1\/sites\/[^/]+\/moments\?/, (r) => r.fulfill({ json: { bucket: 'day', moments: [] } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/insights\?/, (r) => r.fulfill({ json: { insights: [] } }))
  await page.route(/\/report\/ai-seen$/, (r) => r.fulfill({ json: { visitor: ai, crawler: false } }))
  await page.route(/\/report\/ai-search\?/, (r) => r.fulfill({ json: assistants }))
  await page.route(/\/report\?(?=.*channel)/, (r) =>
    r.fulfill({ json: { current: { series: [0, 1, 0, 4, 9, 2, 4, 7].map((v, i) => ({ t: `2026-09-0${i + 1}T00:00`, visitors: v, pageviews: v })) } } }),
  )
}

let cookie = ''
test.beforeAll(async ({ browser }) => {
  cookie = await session('card-modal')
  // A visit, so the site has had one (the cards wait for the first).
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/card-modal-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
})

async function open(page: Page, width = 1280, done = ['exclude']) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`${API}/${DOMAIN}?view=data`)
  const id = await page.evaluate(async () => ((await (await fetch('/api/v1/sites')).json()) as { sites: { id: string; domain: string }[] }).sites.find((s) => s.domain === 'example.com')?.id ?? '')
  // The first-day card about your own visits is put away (unless a test asks for it), and no other card is.
  await page.evaluate(([site, put]) => localStorage.setItem(`trckable:disc:${site}`, JSON.stringify({ done: put })), [id, done])
  await page.reload()
  await expect(page.locator('.chart-wrap svg[role="img"]')).toBeVisible({ timeout: 30_000 })
}

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  const width = page.viewportSize()?.width ?? 0
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/${name}-${width}-${scheme}.png` })
  }
}

test('the AI & Search card opens its dialog; closing it (Close or Escape) puts the side card away too', async ({ page }) => {
  await given(page, true)
  await open(page)
  const card = page.getByRole('complementary', { name: 'AI & Search' })
  await expect(card).toBeVisible({ timeout: 20_000 })
  const details = card.getByRole('button', { name: 'Details' })
  await details.click()
  const dialog = page.getByRole('dialog', { name: 'AI & Search' })
  await expect(dialog).toBeVisible()
  // Who sent them, with counts; the pages they landed on; the days.
  await expect(dialog.getByRole('list', { name: 'AI assistants' })).toContainText('ChatGPT')
  await expect(dialog.getByRole('list', { name: 'AI assistants' })).toContainText('12')
  await expect(dialog.getByRole('list', { name: 'Landed on' })).toContainText('/blog/self-hosting')
  await expect(dialog.getByRole('img', { name: 'AI visitors for each day of the period' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'See all in AI & Search' })).toBeVisible()
  await shoot(page, 'ai-search-modal')
  await dialog.getByRole('button', { name: 'Close' }).first().click()
  await expect(dialog).toHaveCount(0)
  await expect(card).toHaveCount(0)
})

test('Escape closes the AI & Search dialog and the side card with it', async ({ page }) => {
  await given(page, true)
  await open(page)
  const card = page.getByRole('complementary', { name: 'AI & Search' })
  await expect(card).toBeVisible({ timeout: 20_000 })
  await card.getByRole('button', { name: 'Details' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI & Search' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(card).toHaveCount(0)
})

test('on a phone the dialog is a sheet that fills the screen', async ({ page }) => {
  await given(page, true)
  await open(page, 390)
  const card = page.getByRole('complementary', { name: 'AI & Search' })
  await expect(card).toBeVisible({ timeout: 20_000 })
  await card.getByRole('button', { name: 'Details' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI & Search' })
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(389)
  expect(box?.height).toBeGreaterThanOrEqual((await page.evaluate(() => window.innerHeight)) - 1)
  await shoot(page, 'ai-search-modal')
})

test('pictures: two other cards', async ({ page }) => {
  test.skip(!SHOTS, 'set CARD_MODAL_SHOTS to a folder')
  await given(page, false)
  // The guide card about your own visits.
  await open(page, 1280, [])
  const own = page.getByRole('complementary', { name: 'Your visits' })
  await expect(own).toBeVisible({ timeout: 20_000 })
  await own.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('dialog', { name: 'Your visits' })).toBeVisible()
  await shoot(page, 'own-visits-modal')
  // The card on opening: a new referrer.
  await page.unroute(/\/api\/v1\/sites\/[^/]+\/insights\?/)
  const since = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10)
  await page.route(/\/api\/v1\/sites\/[^/]+\/insights\?/, (r) => r.fulfill({ json: { insights: [{ kind: 'new_referrer', dim: 'referrer', value: 'news.example', now: 312, since }] } }))
  await open(page)
  const one = page.getByRole('complementary', { name: 'One thing today' })
  await expect(one).toBeVisible({ timeout: 20_000 })
  await one.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await shoot(page, 'one-thing-modal')
})
