// Two layouts that went wrong: a stopped site in the switcher kept only a red
// ring where its mark should be (the stopped banner's class styled the dot),
// and Settings → Install squeezed the "Not verified" card under the code panel
// (the scrolling column shrank it).
import { expect, test, type Locator, type Page } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const DAY = 86400
const SHOTS = process.env.POLISH_SHOTS

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('stopped-install')
})

async function newSite(page: Page, tag: string) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const res = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `${tag}-${Date.now()}.example` } })
  expect(res.ok()).toBe(true)
  return (await res.json()) as { id: string; domain: string }
}

const box = async (l: Locator) => (await l.boundingBox())!

test('a stopped site keeps its mark in the switcher', async ({ page, browserName }) => {
  const site = await newSite(page, `stopped-${browserName}`)
  // Stopped: visits until three days ago, and a later check found no snippet.
  const now = Math.floor(Date.now() / 1000)
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    for (const s of body.sites) if (s.id === site.id) Object.assign(s, { last_event_at: now - 3 * DAY, check: { at: now - DAY, found: 'none' } })
    await r.fulfill({ response: res, json: body })
  })
  await page.goto(`${API}/example.com`)
  await page.locator('.site-pick .site-btn').click()
  const row = page.locator(`[data-site="${site.id}"]`)
  await expect(row.locator('.stopped-note')).toBeVisible()
  const mark = row.locator('.site-mark')
  const dot = row.locator('.state-dot.stopped')
  await expect(mark).toBeVisible()
  await expect(mark).toHaveText(site.domain[0].toUpperCase())
  // The dot is the small corner dot, not a box over the mark.
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/stopped-mark-${browserName}.png` })
  const m = await box(mark)
  const d = await box(dot)
  expect(d.width).toBeLessThan(14)
  expect(d.height).toBeLessThan(14)
  expect(d.width * d.height).toBeLessThan((m.width * m.height) / 3)
})

for (const size of [
  { name: 'wide', width: 1280, height: 720 },
  { name: 'phone', width: 390, height: 740 },
]) {
  test(`Install on a not verified site: the card sits above the code (${size.name})`, async ({ page, browserName }) => {
    await page.setViewportSize(size)
    const site = await newSite(page, `unverified-${size.name}-${browserName}`)
    // A visit two days ago, and a homepage without the snippet: not verified.
    await page.route(`**/api/v1/sites/${site.id}/events?*`, (r) =>
      r.fulfill({ json: { events: [{ ts: new Date(Date.now() - 2 * DAY * 1000).toISOString(), path: '/' }] } }),
    )
    await page.route(`**/api/v1/sites/${site.id}/install/check`, (r) =>
      r.fulfill({ json: { url: `https://${site.domain}/`, status: 200, found: 'none', scripts: 0 } }),
    )
    await page.goto(`${API}/settings?site=${site.id}&tab=install`)
    const card = page.locator('.card.install-check')
    await expect(card.getByRole('heading', { name: 'Not verified' })).toBeVisible()
    const more = page.getByRole('button', { name: 'Hide the code' })
    await expect(more).toBeVisible()
    const panel = page.locator('.inst-settings')
    await expect(panel).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/install-${size.name}-${browserName}.png` })
    const c = await box(card)
    const again = await box(card.getByRole('button', { name: 'Verify again' }))
    const steps = await box(card.locator('.install-steps'))
    // Nothing in the card is cut off, and what follows starts below it.
    expect(again.y + again.height).toBeLessThanOrEqual(c.y + c.height + 0.5)
    expect(steps.y + steps.height).toBeLessThanOrEqual(c.y + c.height + 0.5)
    expect((await box(more)).y).toBeGreaterThanOrEqual(c.y + c.height - 0.5)
    expect((await box(panel)).y).toBeGreaterThanOrEqual(c.y + c.height - 0.5)
  })
}
