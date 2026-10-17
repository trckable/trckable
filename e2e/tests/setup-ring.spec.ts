// The setup ring in the header: it opens a panel whose actions land on the right place, the panel is a bottom sheet on
// a phone, "Not for me" lowers what counts and moves the row to More, and once everything counted is done the ring is
// a check for seven days and then gone.
// Pictures for the review: SR_SHOTS=<folder> SR_SCHEME=light|dark.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.SR_SHOTS
const SCHEME = process.env.SR_SCHEME === 'light' ? 'light' : 'dark'
const DOMAIN = `ring-${Date.now()}.example.org`

test.use({ colorScheme: SCHEME })
test.describe.configure({ mode: 'serial' })

let cookie = ''
let site = ''

test.beforeAll(async ({ request }) => {
  cookie = await session('setup-ring')
  const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json', Cookie: `trckable_session=${cookie}` }
  const made = await request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: DOMAIN } })
  expect(made.ok()).toBe(true)
  site = ((await made.json()) as { id: string }).id
  // The optional steps but Payments are not for this site: five count, with Payments one of them.
  for (const item of ['funnel', 'search', 'crawlers', 'proxy']) expect((await request.put(`${API}/api/v1/sites/${site}/setup/skip/${item}`, { headers: H })).ok()).toBe(true)
})

async function open(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${DOMAIN}`)
  await expect(page.locator('.hd #siteBtn')).toBeVisible()
}

async function shot(page: Page, name: string, width: number) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${width}-${SCHEME}.png` })
}

test('the ring opens a panel and an action lands on the place that does it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  const ring = page.locator('.ringb')
  await expect(ring).toBeVisible()
  await expect(ring).toContainText('set up')
  // Right of the site switcher.
  const site_ = await page.locator('.hd #siteBtn').boundingBox()
  const at = await ring.boundingBox()
  expect(at!.x).toBeGreaterThan(site_!.x + site_!.width - 1)
  await ring.click()
  const panel = page.locator('.setupmenu.on')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Only you see this.')
  await shot(page, 'setup-ring', 1440)
  await panel.locator('[data-step="own_visits"] button', { hasText: 'Add my IP' }).click()
  await expect(page.getByRole('button', { name: 'Add my current IP' })).toBeVisible()
})

test('a phone opens the panel as a sheet at the bottom', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await page.locator('.ringb').click()
  const panel = page.locator('.setupmenu.on')
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(Math.round(box!.y + box!.height)).toBe(844)
  expect(Math.round(box!.width)).toBe(390)
  await shot(page, 'setup-ring', 390)
})

test('Not for me on Payments lowers what counts and moves the row to More', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await page.locator('.ringb').click()
  const panel = page.locator('.setupmenu.on')
  await expect(page.locator('.ringb .rtext')).toHaveText('0/5 set up')
  await panel.locator('[data-step="payments"] button', { hasText: 'I don’t sell online' }).click()
  await expect(page.locator('.ringb .rtext')).toHaveText('0/4 set up')
  await expect(panel.locator('[data-step="payments"]')).toHaveCount(0)
  await panel.getByRole('button', { name: /More you can add/ }).click()
  await expect(panel.locator('[data-step="payments"] button', { hasText: 'Bring back' })).toBeVisible()
  await panel.locator('[data-step="payments"] button', { hasText: 'Bring back' }).click()
  await expect(page.locator('.ringb .rtext')).toHaveText('0/5 set up')
})

test('everything done: a check for seven days, then no ring', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route(/\/api\/v1\/sites\/[^/]+\/setup$/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    body.items = body.items.map((i: { counted: boolean; done: boolean }) => ({ ...i, done: i.counted ? true : i.done }))
    body.done = body.counted
    body.all_set = true
    await route.fulfill({ response: res, json: body })
  })
  const stamp = (days: number) => page.addInitScript(([id, ms]) => localStorage.setItem('trckable:ring:done', JSON.stringify({ [id as string]: Date.now() - (ms as number) })), [site, days * 86_400_000])
  await stamp(1)
  await open(page)
  await expect(page.locator('.ringb[data-ring="check"]')).toBeVisible()
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('after seven days the check is gone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route(/\/api\/v1\/sites\/[^/]+\/setup$/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    body.items = body.items.map((i: { counted: boolean; done: boolean }) => ({ ...i, done: i.counted ? true : i.done }))
    body.done = body.counted
    body.all_set = true
    await route.fulfill({ response: res, json: body })
  })
  await page.addInitScript(([id, ms]) => localStorage.setItem('trckable:ring:done', JSON.stringify({ [id as string]: Date.now() - (ms as number) })), [site, 8 * 86_400_000])
  await open(page)
  await expect(page.locator('.hd #siteBtn')).toBeVisible()
  await expect(page.locator('.ringb')).toHaveCount(0)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})
