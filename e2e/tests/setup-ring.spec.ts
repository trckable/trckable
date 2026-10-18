// The setup ring in the header: it opens a panel (the next step as a card, the rest as rows) whose actions land on the right place, the panel is a bottom sheet on
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
  // A site this browser has not read yet shows its ring at the next look (it would push the header otherwise): read it, look again.
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('trckable:ring:state:')), undefined, { timeout: 15_000 })
  await page.reload()
  await expect(page.locator('.hd #siteBtn')).toBeVisible()
}

async function shot(page: Page, name: string, width: number) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${width}-${SCHEME}.png` })
}

test('the ring opens a panel and an action lands on the place that does it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  const ring = page.locator('.ringb')
  await expect(ring).toBeVisible({ timeout: 15_000 })
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
  // The first open step is the card with its one filled button; your own visits are an extra, not counted, under More you can add.
  await expect(panel.locator('.snext .sbtn')).toHaveCount(1)
  await expect(panel.locator('[data-step="own_visits"]')).toHaveCount(0)
  await panel.getByRole('button', { name: /More you can add/ }).click()
  await panel.locator('[data-step="own_visits"]').getByRole('button', { name: /Your own visits left out/ }).click()
  await expect(page.getByRole('button', { name: 'Add my current IP' })).toBeVisible()
})

test('a phone opens the panel as a sheet at the bottom', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await page.locator('.ringb').click({ timeout: 15_000 })
  const panel = page.locator('.setupmenu.on')
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(Math.round(box!.y + box!.height)).toBe(844)
  // The sheet spans the page: a browser with classic scrollbars (WebKit's) takes 10 px of the 390 for its own.
  expect(Math.round(box!.width)).toBe(await page.evaluate(() => document.documentElement.clientWidth))
  await shot(page, 'setup-ring', 390)
})

test('Not for me on Payments lowers what counts and moves the row to More', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await page.locator('.ringb').click({ timeout: 15_000 })
  const panel = page.locator('.setupmenu.on')
  await expect(page.locator('.ringb .rtext')).toHaveText('0/4 set up')
  await panel.locator('[data-step="payments"]').getByRole('button', { name: 'More' }).click()
  await panel.getByRole('menuitem', { name: 'I don’t sell online' }).click()
  await expect(page.locator('.ringb .rtext')).toHaveText('0/3 set up')
  await expect(panel.locator('[data-step="payments"]')).toHaveCount(0)
  await panel.getByRole('button', { name: /More you can add/ }).click()
  await expect(panel.locator('[data-step="payments"] button', { hasText: 'Bring back' })).toBeVisible()
  await panel.locator('[data-step="payments"] button', { hasText: 'Bring back' }).click()
  await expect(page.locator('.ringb .rtext')).toHaveText('0/4 set up')
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
  await expect(page.locator('.ringb[data-ring="check"]')).toBeVisible({ timeout: 15_000 })
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
  await page.waitForTimeout(4000) // past the first read
  await expect(page.locator('.ringb')).toHaveCount(0)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('Add a site asks the kind after the domain: a choice is saved, Skip saves none', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const H = { 'X-Trckable-Request': '1', Cookie: `trckable_session=${cookie}` }
  const kindOf = async (domain: string) => {
    const sites = ((await (await request.get(`${API}/api/v1/sites`, { headers: H })).json()) as { sites: { id: string; domain: string }[] }).sites
    const id = sites.find((s) => s.domain === domain)!.id
    return ((await (await request.get(`${API}/api/v1/sites/${id}/setup`, { headers: H })).json()) as { kind: { value: string; chosen: boolean } }).kind
  }
  const wizard = page.getByRole('dialog', { name: 'Add a site' })
  for (const [name, pick] of [['picked', 'Shop'], ['skipped', null]] as const) {
    const domain = `kind-${name}-${Date.now()}.example.org`
    await page.goto(`${API}/${DOMAIN}?add=site`)
    await wizard.getByLabel('Domain').fill(domain)
    await wizard.getByLabel('Domain').press('Enter')
    await expect(wizard.getByRole('group', { name: 'Kind' })).toBeVisible({ timeout: 15_000 })
    await expect(wizard.getByRole('button', { name: 'Continue' })).toBeDisabled()
    if (pick) {
      await wizard.getByRole('button', { name: pick }).click()
      await wizard.getByRole('button', { name: 'Continue' }).click()
    } else {
      await wizard.getByRole('button', { name: 'Skip' }).click()
    }
    await expect(wizard.getByRole('tablist', { name: 'How to install' })).toBeVisible()
    const kind = await kindOf(domain)
    expect(kind.chosen).toBe(pick !== null)
    if (pick) expect(kind.value).toBe('shop')
  }
})

// One indicator at a time in the header: the ring while setup is open, the verified seal once the ring has gone.
const verifiedSites = (page: Page) =>
  page.route(/\/api\/v1\/sites$/, async (route) => {
    const res = await route.fetch()
    const now = Math.floor(Date.now() / 1000)
    const body = (await res.json()) as { sites: object[] }
    const sites = body.sites.map((s) => ({ ...s, verified: { sources: [{ kind: 'payments', provider: 'stripe', ok: true, since: now - 86_400, checked: now, detail: '' }] } }))
    await route.fulfill({ response: res, json: { ...body, sites } })
  })
const allDone = (page: Page) =>
  page.route(/\/api\/v1\/sites\/[^/]+\/setup$/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    body.items = body.items.map((i: { counted: boolean; done: boolean }) => ({ ...i, done: i.counted ? true : i.done }))
    body.done = body.counted
    body.all_set = true
    await route.fulfill({ response: res, json: body })
  })

for (const width of [1440, 948, 390]) {
  test(`${width}px: while setup is open the header has no verified seal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await verifiedSites(page)
    await open(page)
    await page.waitForTimeout(3500)
    await expect(page.locator('.hd .vf-sealbtn')).toHaveCount(0)
    if (width > 1100 || width <= 700) await expect(page.locator('.hd .ringb')).toBeVisible()
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  })

  test(`${width}px: once the ring has gone the seal takes its slot`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await verifiedSites(page)
    await allDone(page)
    await page.addInitScript(([id, ms]) => localStorage.setItem('trckable:ring:done', JSON.stringify({ [id as string]: Date.now() - (ms as number) })), [site, 8 * 86_400_000])
    await open(page)
    await expect(page.locator('.hd .ringb')).toHaveCount(0)
    await expect(page.locator('.hd .ringw.seal-slot .vf-sealbtn')).toBeVisible({ timeout: 15_000 })
    await shot(page, 'seal-slot', width)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  })
}
