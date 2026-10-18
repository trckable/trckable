// Two layouts that went wrong: a stopped site in the switcher kept only a red
// ring where its dot should be (the stopped banner's class styled the dot),
// and Settings → Install squeezed the "Snippet not seen" card under the code panel
// (the scrolling column shrank it).
import { expect, test, type Locator, type Page } from './fixtures'
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
  const res = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `${tag}-${Date.now()}.test` } })
  expect(res.ok()).toBe(true)
  return (await res.json()) as { id: string; domain: string }
}

const box = async (l: Locator) => (await l.boundingBox())!

test('a stopped site keeps its dot in the switcher', async ({ page, browserName }) => {
  const site = await newSite(page, `stopped-${browserName}`)
  // Stopped: visits until three days ago, and a later check could not reach the site.
  const now = Math.floor(Date.now() / 1000)
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    for (const s of body.sites) if (s.id === site.id) Object.assign(s, { last_event_at: now - 3 * DAY, check: { at: now - DAY, error: 'timeout', down_since: now - 2 * DAY } })
    await r.fulfill({ response: res, json: body })
  })
  await page.goto(`${API}/example.com`)
  await page.locator('#siteBtn').click()
  const row = page.locator(`[data-site="${site.id}"]`)
  const word = row.locator('.state-word.down')
  await expect(word).toHaveText('down 3d')
  await expect(word).toHaveAttribute('title', 'Not reachable for 3d. Open the site to see what’s wrong.')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/state-word-down-${browserName}.png` })
  const dot = row.locator('.mk-dot.down')
  await expect(dot).toBeVisible()
  // The dot is the small dot before the name, not a box over it.
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/stopped-mark-${browserName}.png` })
  const d = await box(dot)
  expect(d.width).toBeLessThan(14)
  expect(d.height).toBeLessThan(14)
})

test('a quiet site shows a grey dot and how long it has been quiet, with its explanation', async ({ page, browserName }) => {
  const site = await newSite(page, `quiet-${browserName}`)
  const gone = await newSite(page, `gone-${browserName}`)
  const now = Math.floor(Date.now() / 1000)
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    for (const s of body.sites) {
      if (s.id === site.id) Object.assign(s, { last_event_at: now - 19 * 3600, check: { at: now - 3600, found: 'none' } })
      if (s.id === gone.id) Object.assign(s, { last_event_at: now - 3 * DAY, check: { at: now - DAY, error: 'timeout', down_since: now - 2 * DAY } })
    }
    await r.fulfill({ response: res, json: body })
  })
  if (SHOTS) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ colorScheme: 'dark' })
  }
  await page.goto(`${API}/example.com`)
  await page.locator('#siteBtn').click()
  const row = page.locator(`[data-site="${site.id}"]`)
  const word = row.locator('.state-word.quiet')
  await expect(word).toHaveText('quiet 19h')
  await expect(word).toHaveAttribute('title', 'No visits for 19h. Nothing looks wrong with the page.')
  await expect(row.locator('.mk-dot.idle')).toBeVisible()
  if (SHOTS) await page.waitForTimeout(400)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/state-word-quiet-${browserName}.png` })
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
    await expect(card.getByRole('heading', { name: 'Snippet not seen' })).toBeVisible()
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
