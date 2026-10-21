// Live's Speed & uptime and AI & mentions cards beside Analytics: a gauge for loading time, thirty days of uptime, AI crawler
// visits with the assistants that came, and mentions. A site that is
// down shows it in red, a figure with nothing behind it says "Set up" where there is something to set up (nothing to a viewer), and on a phone the four
// sit two by two. The answers are faked through the routes; what is under test is how the cards tell them.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const NOW = Math.floor(Date.now() / 1000)

interface Fake {
  down?: boolean
  empty?: boolean
  /** The site records no speed, so the speed card can be set up. */
  noVitals?: boolean
  /** The site has not been probed yet. */
  unwatched?: boolean
  role?: string
  /** The crawler answer waits for this, so the cards are seen while their figures are on the way. */
  hold?: Promise<void>
  /** The speed switch is a real one: the modules answer follows what a write sets, as the server does. */
  switchable?: boolean
}

async function fake(page: Page, o: Fake = {}) {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('live-health'), url: API }])
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    for (const s of body.sites) if (s.domain === 'example.com') Object.assign(s, { mentions: true, watched_since: o.empty || o.unwatched ? undefined : NOW - 5 * 86400, down_since: o.down ? NOW - 12 * 60 : undefined, check: undefined })
    await r.fulfill({ response: res, json: body })
  })
  if (o.role) {
    await page.route(/\/api\/v1\/me(\?|$)/, async (r) => {
      const me = await (await r.fetch()).json()
      await r.fulfill({ json: { ...me, role: o.role } })
    })
  }
  let vitals = !o.noVitals
  if (o.switchable) {
    await page.route(/\/api\/v1\/sites\/[^/]+\/modules/, async (r) => {
      if (r.request().method() === 'PUT') vitals = (r.request().postDataJSON() as { enabled: boolean }).enabled
      const res = await r.fetch({ url: r.request().url().replace(/\/modules\/.*$/, '/modules'), method: 'GET', postData: undefined })
      const body = (await res.json()) as { modules: { id: string; enabled: boolean }[] }
      for (const m of body.modules) if (m.id === 'vitals') m.enabled = vitals
      await r.fulfill({ response: res, json: body })
    })
  } else {
    await page.route(/\/api\/v1\/sites\/[^/]+\/modules/, (r) => r.fulfill({ json: { modules: [{ id: 'vitals', enabled: !o.noVitals }] } }))
  }
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\/vitals/, (r) => r.fulfill({ json: o.empty ? { samples: 0, good: 0 } : { samples: 80, lcp_ms: 1800, lcp_n: 80, inp_ms: 120, inp_n: 80, cls_1k: 20, cls_n: 80, good: 70 } }))
  const open = { id: 'i1', site: 'example.com', kind: 'down', started_at: NOW - 12 * 60, ended_at: null, cause: 'timeout', expected_visits: null, note: '' }
  await page.route(/\/api\/v1\/sites\/[^/]+\/incidents/, (r) => r.fulfill({ json: { incidents: o.down ? [open] : [], summary: { count: o.down ? 1 : 0, seconds: o.down ? 720 : 0, lost: 0, lost_some: false }, quiet_tracked: true } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\/crawlers/, async (r) => {
    await o.hold
    await r.fulfill({ json: { kinds: o.empty ? {} : { answer: 14, train: 200 }, series: o.empty ? [] : [{ name: 'OpenAI', kind: 'train', total: 200, values: [] }, { name: 'Anthropic', kind: 'answer', total: 14, values: [] }], pages: [], total: 0, errors: 0, buckets: [] } })
  })
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

test('with nothing behind a figure an owner is offered a button only where there is something to set up, and each goes to its own place', async ({ page }) => {
  await fake(page, { empty: true, noVitals: true })
  await expect(cards(page).locator('.lhempty')).toHaveCount(2) // speed and uptime say it once
  await expect(cards(page).locator('.lhment')).toContainText('No new mentions') // a site that looks for mentions and has none is a real zero
  await expect(cards(page).getByRole('button', { name: /^(Turn on speed|Connect AI crawlers)$/ })).toHaveCount(2) // uptime is watched on its own: no button of its own
  await cards(page).locator('.lhempty').first().getByRole('button', { name: 'Turn on speed' }).click()
  await expect(page).toHaveURL(/settings=site/)
  await expect(page.locator('#script-records')).toBeVisible()
  await expect(page.locator('#rec-vitals')).toBeFocused()
})

test('switching speed on updates the card at once, with no reload', async ({ page }) => {
  await fake(page, { empty: true, noVitals: true, switchable: true })
  const speed = cards(page).locator('.lhempty').first()
  await expect(speed).toContainText('No speed or uptime data yet')
  await speed.getByRole('button', { name: 'Turn on speed' }).click()
  await page.locator('#rec-vitals').click()
  await expect(speed).toContainText('Collecting')
  await expect(speed.getByRole('button')).toHaveCount(0)
})

test('Connect AI crawlers opens the connect sheet in AI & Search', async ({ page }) => {
  await fake(page, { empty: true, noVitals: true })
  await cards(page).locator('.lhempty').nth(1).getByRole('button', { name: 'Connect AI crawlers' }).click()
  await expect(page).toHaveURL(/x=ai/)
  await expect(page.getByRole('dialog', { name: 'Connect crawler data' })).toBeVisible()
})

test('a speed that is recorded but has too few visits says so, with no button', async ({ page }) => {
  await fake(page, { empty: true })
  await expect(cards(page).locator('.lhempty').first()).toContainText('Collecting')
  await expect(cards(page).locator('.lhempty').first().getByRole('button')).toHaveCount(0)
})

test('uptime that has not been probed yet only waits: no button, a collecting line', async ({ page }) => {
  await fake(page, { unwatched: true })
  const empty = cards(page).locator('.lhempty')
  await expect(empty).toHaveCount(1)
  await expect(empty).toContainText('Collecting')
  await expect(empty.getByRole('button')).toHaveCount(0)
  await expect(cards(page).locator('.lhspeed')).toContainText('1.8 s')
})

test('Analytics keeps the pages and the countries behind one switch', async ({ page }) => {
  await fake(page)
  const card = cards(page).locator('.lan')
  await card.getByRole('button', { name: 'Countries' }).click()
  await expect(card.getByRole('button', { name: 'Countries' })).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByRole('button', { name: 'Pages' })).toHaveAttribute('aria-pressed', 'false')
})

test('a viewer sees the empty lines and no button', async ({ page }) => {
  await fake(page, { empty: true, noVitals: true, role: 'viewer' })
  await expect(cards(page).locator('.lhempty')).toHaveCount(2)
  await expect(cards(page).locator('.lhempty button')).toHaveCount(0)
})

test('the public product has no Peek, so no Why? link sits beside the buttons', async ({ page }) => {
  await fake(page, { empty: true, noVitals: true })
  await expect(cards(page).getByRole('button', { name: 'Turn on speed' })).toBeVisible()
  await expect(cards(page).getByRole('button', { name: 'Why?' })).toHaveCount(0)
})

test('the cards hold the shape of their figures while those are read, and nothing is left behind when they land', async ({ page }) => {
  let release = () => {}
  const hold = new Promise<void>((r) => (release = r))
  await fake(page, { hold })
  await expect(cards(page).locator('.lsk')).toHaveCount(2) // speed and AI, same cards as when they land
  await expect(cards(page).locator('.lhc')).toHaveCount(2)
  release()
  await expect(cards(page).locator('.lhcount')).toContainText('214')
  await expect(cards(page).locator('.lsk')).toHaveCount(0)
})
