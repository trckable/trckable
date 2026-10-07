// The lines beside Story's answers (an AI visitor, heatmaps): one button to act, Close to put away for
// good. What the server finds is given by the browser here (its rules are tested in Go); the rest is real.
//   CARD_MODAL_SHOTS=/some/folder  also takes the pictures for review.
import { expect, test, type Page } from './fixtures'
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

/** Nothing since the last visit; an AI visitor seen or not. */
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
  await page.goto(`${API}/${DOMAIN}?v=story`)
  const id = await page.evaluate(async () => ((await (await fetch('/api/v1/sites')).json()) as { sites: { id: string; domain: string }[] }).sites.find((s) => s.domain === 'example.com')?.id ?? '')
  // The first-day card about your own visits is put away (unless a test asks for it), and no other card is.
  await page.evaluate(([site, put]) => localStorage.setItem(`trckable:disc:${site}`, JSON.stringify({ done: put })), [id, done])
  await page.reload()
  await expect(page.locator('.sv-line')).toBeVisible({ timeout: 30_000 })
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

test('an AI visitor is a line beside the sources answer; its button opens AI & Search, and it does not come back', async ({ page }) => {
  await given(page, true)
  await open(page)
  const hint = page.locator('.sv-answer.did .sv-hint')
  await expect(hint).toContainText('An AI assistant sent a visitor', { timeout: 20_000 })
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await shoot(page, 'ai-hint')
  await hint.getByRole('button', { name: 'Open AI & Search' }).click()
  await expect(page).toHaveURL(/mode=full/)
  await page.goto(`${API}/${DOMAIN}?v=story`)
  await expect(page.locator('.sv-line')).toBeVisible()
  await page.waitForTimeout(2000)
  await expect(page.locator('.sv-hint', { hasText: 'An AI assistant sent a visitor' })).toHaveCount(0)
})

test('Close puts the line away for good', async ({ page }) => {
  await given(page, true)
  await open(page)
  const hint = page.locator('.sv-answer.did .sv-hint')
  await expect(hint).toBeVisible({ timeout: 20_000 })
  await hint.getByRole('button', { name: 'Close' }).click()
  // The next one (turning AI crawlers on) may take its place; this one does not come back.
  const ai = page.locator('.sv-hint', { hasText: 'An AI assistant sent a visitor' })
  await expect(ai).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.sv-line')).toBeVisible()
  await page.waitForTimeout(2000)
  await expect(ai).toHaveCount(0)
})

test('without an AI visitor there is no line', async ({ page }) => {
  await given(page, false)
  await open(page, 390)
  await expect(page.locator('.sv-line')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2000)
  await expect(page.locator('.sv-hint')).toHaveCount(0)
})
