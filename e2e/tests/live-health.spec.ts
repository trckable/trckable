// Live's Health strip: loading time, uptime, AI crawler hits and mentions under the pages and countries. A site that is
// down shows it in red, a figure with nothing behind it says "Set up" (a dash to a viewer), and on a phone the four
// sit two by two. The answers are faked through the routes; what is under test is how the strip tells them.
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
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\/crawlers/, (r) => r.fulfill({ json: { kinds: o.empty ? {} : { answer: 14, train: 200 }, series: [], pages: [], total: 0, errors: 0, buckets: [] } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/mentions/, (r) => r.fulfill({ json: { mentions: o.empty ? [] : [{ id: 1, source: 'hn', url: 'https://example.org', title: 'x', host: 'example.org', posted_at: NOW - 3600, found_at: NOW - 3000, visitors: 0 }] } }))
  await page.goto(`${API}/example.com?view=live`)
  await expect(page.locator('.lnow .lfig .lbign').first()).toBeVisible({ timeout: 15_000 })
}

const seg = (page: Page, name: string) => page.locator('.lhealth .lhseg', { hasText: name })

test('the strip tells the real figures, and each one opens its part of Explore', async ({ page }) => {
  await fake(page)
  await expect(seg(page, 'Page speed')).toContainText('1.8 s')
  await expect(seg(page, 'Page speed')).toContainText('fast')
  await expect(seg(page, 'Uptime')).toContainText('up')
  await expect(seg(page, 'Uptime').locator('.lhb')).toHaveCount(16)
  await expect(seg(page, 'AI & search')).toContainText('214')
  await expect(seg(page, 'Mentions')).toContainText('1')
  await seg(page, 'AI & search').click()
  await expect(page).toHaveURL(/x=ai/)
})

test('a site that is down shows red with how long, as the header does, and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fake(page, { down: true })
  const up = seg(page, 'Uptime')
  await expect(up).toHaveClass(/bad/)
  await expect(up).toContainText(/down 1[2-3] min/)
  await expect(up.locator('.lhb.down')).toHaveCount(1)
  const cols = await page.locator('.lhealth').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(cols).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('with nothing behind a figure an owner is offered Set up', async ({ page }) => {
  await fake(page, { empty: true })
  for (const name of ['Page speed', 'Uptime', 'AI & search']) await expect(seg(page, name)).toContainText('Set up')
  await expect(seg(page, 'Mentions')).toContainText('0') // a site that looks for mentions and has none is a real zero
})

test('a viewer sees a dash, not Set up', async ({ page }) => {
  await fake(page, { empty: true, role: 'viewer' })
  await expect(seg(page, 'Page speed')).toContainText('—')
  await expect(page.locator('.lhealth')).not.toContainText('Set up')
})
