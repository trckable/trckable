// Live's Speed & uptime and AI & mentions cards beside Analytics: a gauge for loading time, thirty days of uptime, AI crawler
// visits with the assistants that came, and mentions. A site that is
// down shows it in red, a figure with nothing behind it says "Set up" (a dash to a viewer), and on a phone the four
// sit two by two. The answers are faked through the routes; what is under test is how the cards tell them.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const NOW = Math.floor(Date.now() / 1000)

interface Fake {
  down?: boolean
  empty?: boolean
  role?: string
}

async function fake(page: Page, o: Fake = {}) {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('live-health'), url: API }])
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    for (const s of body.sites) if (s.domain === 'example.com') Object.assign(s, { mentions: true, watched_since: o.empty ? undefined : NOW - 5 * 86400, down_since: o.down ? NOW - 12 * 60 : undefined, check: undefined })
    await r.fulfill({ response: res, json: body })
  })
  if (o.role) {
    await page.route(/\/api\/v1\/me(\?|$)/, async (r) => {
      const me = await (await r.fetch()).json()
      await r.fulfill({ json: { ...me, role: o.role } })
    })
  }
  await page.route(/\/api\/v1\/sites\/[^/]+\/modules/, (r) => r.fulfill({ json: { modules: [{ id: 'vitals', enabled: true }] } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\/vitals/, (r) => r.fulfill({ json: o.empty ? { samples: 0, good: 0 } : { samples: 80, lcp_ms: 1800, lcp_n: 80, inp_ms: 120, inp_n: 80, cls_1k: 20, cls_n: 80, good: 70 } }))
  const open = { id: 'i1', site: 'example.com', kind: 'down', started_at: NOW - 12 * 60, ended_at: null, cause: 'timeout', expected_visits: null, note: '' }
  await page.route(/\/api\/v1\/sites\/[^/]+\/incidents/, (r) => r.fulfill({ json: { incidents: o.down ? [open] : [], summary: { count: o.down ? 1 : 0, seconds: o.down ? 720 : 0, lost: 0, lost_some: false }, quiet_tracked: true } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\/crawlers/, (r) => r.fulfill({ json: { kinds: o.empty ? {} : { answer: 14, train: 200 }, series: o.empty ? [] : [{ name: 'OpenAI', kind: 'train', total: 200, values: [] }, { name: 'Anthropic', kind: 'answer', total: 14, values: [] }], pages: [], total: 0, errors: 0, buckets: [] } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/mentions/, (r) => r.fulfill({ json: { mentions: o.empty ? [] : [{ id: 1, source: 'hn', url: 'https://example.org', title: 'x', host: 'example.org', posted_at: NOW - 3600, found_at: NOW - 3000, visitors: 0 }] } }))
  await page.goto(`${API}/example.com?view=live`)
  await expect(page.locator('.lnow .lfig .lbign').first()).toBeVisible({ timeout: 15_000 })
  await page.locator('.lcards').scrollIntoViewIfNeeded() // the cards read their figures when they come near the screen
}

const cards = (page: Page) => page.locator('.lcards')

test('the cards tell the real figures, and each opens its part of Explore', async ({ page }) => {
  await fake(page)
  await expect(cards(page).locator('.lhspeed')).toContainText('1.8 s')
  await expect(cards(page).locator('.lhgrade')).toHaveText('fast')
  await expect(cards(page).locator('.lhstrip i')).toHaveCount(30)
  await expect(cards(page).locator('.lhup')).toContainText('up · 30 days')
  await expect(cards(page).locator('.lhcount')).toContainText('214')
  await expect(cards(page).locator('.lhmarks i')).toHaveText(['O', 'C'])
  await expect(cards(page).locator('.lhment')).toContainText('Hacker News')
  await cards(page).locator('.lhcount').click()
  await expect(page).toHaveURL(/x=ai/)
})

test('a site that is down shows red with how long, as the header does, and the cards stack on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fake(page, { down: true })
  const card = cards(page).locator('.lhc.bad')
  await expect(card).toContainText(/Down for 1[2-3] min/)
  await expect(card.locator('.lhstrip i.down')).toHaveCount(1)
  const cols = await cards(page).evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(cols).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('with nothing behind a figure an owner is offered Set up, which opens its settings', async ({ page }) => {
  await fake(page, { empty: true })
  await expect(cards(page).locator('.lhempty')).toHaveCount(3)
  await expect(cards(page).locator('.lhment')).toContainText('No new mentions') // a site that looks for mentions and has none is a real zero
  await cards(page).locator('.lhempty').first().getByRole('button', { name: 'Set up' }).click()
  await expect(page).toHaveURL(/settings=/)
})

test('Analytics keeps the pages and the countries behind one switch', async ({ page }) => {
  await fake(page)
  const card = cards(page).locator('.lan')
  await card.getByRole('button', { name: 'Countries' }).click()
  await expect(card.getByRole('button', { name: 'Countries' })).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByRole('button', { name: 'Pages' })).toHaveAttribute('aria-pressed', 'false')
})

test('a viewer sees a dash, not Set up', async ({ page }) => {
  await fake(page, { empty: true, role: 'viewer' })
  await expect(cards(page).locator('.lhempty').first()).toContainText('—')
  await expect(cards(page)).not.toContainText('Set up')
})

for (const scheme of ['dark', 'light'] as const) {
  for (const down of [false, true]) {
    test(`the cards meet WCAG 2.1 AA in the ${scheme} theme${down ? ' while the site is down' : ''}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await fake(page, { down })
      await expect(cards(page).locator('.lhc').first()).toBeVisible()
      await page.waitForTimeout(800)
      const found = await new AxeBuilder({ page }).include('.lcards').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(found.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
    })
  }
}
