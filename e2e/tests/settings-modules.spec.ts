// What the script records (Settings → General) and the features around it.
// Most of trckable has no switch: it is there, with an empty state, whatever an
// older client asks. Only what changes the script is a choice, and a choice
// that is off sends no JavaScript, refuses its routes and hides its views; on
// again restores each. Revenue and Search Console appear once connected.
import { gzipSync } from 'node:zlib'
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { H, UA, newSite, openSettings, realPage, recent, type TestSite } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')

type Mod = { id: string; name: string; enabled: boolean; group: string; tracker_bytes?: number }
type Listing = { modules: Mod[]; script: { bytes: number; core: number; full: number; url: string } }

const listing = async (page: Page, site: TestSite) => (await (await page.request.get(`${API}/api/v1/sites/${site.id}/modules`, { headers: H })).json()) as Listing
const on = async (page: Page, site: TestSite, id: string) => (await listing(page, site)).modules.find((m) => m.id === id)!.enabled
const served = async (page: Page, site: TestSite) => (await page.request.get(`${API}/js/${site.id}.js`)).text()

/** A choice's switch in Settings → General → What the script records. */
async function flip(page: Page, site: TestSite, name: string, to: boolean) {
  await openSettings(page, site, 'site')
  const sw = page.locator('#script-records').getByRole('switch', { name, exact: true })
  await expect(sw).toHaveAttribute('aria-checked', String(!to))
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', String(to))
}

// What each module owns on the server. Off, the route answers 404; on, anything but.
const OWNS: Record<string, string> = {
  goals: 'report/goal-props?from=2026-01-01&to=2026-01-02&goal=x',
  funnels: 'report/funnel?from=2026-01-01&to=2026-01-02',
  journeys: 'journey/k3j2.nobody',
  retention: 'report/retention?from=2026-01-01&to=2026-01-02',
  rhythm: 'report/heatmap?from=2026-01-01&to=2026-01-02',
  vitals: 'report/vitals?from=2026-01-01&to=2026-01-02',
  crawlers: 'report/crawlers?from=2026-01-01&to=2026-01-02',
  notes: 'annotations?from=2026-01-01&to=2026-01-02',
  revenue: 'report/pages-sell?from=2026-01-01&to=2026-01-02',
  search: 'report/search?from=2026-01-01&to=2026-01-02',
  heatmaps: 'heat?path=/&from=2026-01-01&to=2026-01-02',
}

test('the choices: goals, vitals and heatmaps are switched in General, and the server follows', async ({ page }) => {
  test.setTimeout(180_000)
  const site = await newSite(page, 'choices')
  const status = (path: string) => page.request.get(`${API}/api/v1/sites/${site.id}/${path}`, { headers: H }).then((r) => r.status())
  const names: Record<string, string> = { goals: 'Goals', vitals: 'Core Web Vitals', heatmaps: 'Heatmaps' }

  for (const id of ['goals', 'vitals', 'heatmaps']) {
    // Start from on, whatever the default is.
    if (!(await on(page, site, id))) await page.request.put(`${API}/api/v1/sites/${site.id}/modules/${id}`, { headers: H, data: { enabled: true } })
    expect.soft(await status(OWNS[id]), `${id} on`).not.toBe(404)
    await flip(page, site, names[id], false)
    expect.soft(await on(page, site, id), `${id} off`).toBe(false)
    expect.soft(await status(OWNS[id]), `${id} off: the server refuses`).toBe(404)
    await flip(page, site, names[id], true)
    expect.soft(await on(page, site, id), `${id} on again`).toBe(true)
    expect.soft(await status(OWNS[id]), `${id} on again`).not.toBe(404)
  }

  // Outbound links and forms are two checkboxes inside Goals.
  for (const id of ['outbound', 'forms']) {
    await page.request.put(`${API}/api/v1/sites/${site.id}/modules/${id}`, { headers: H, data: { enabled: false } })
    await openSettings(page, site, 'site')
    const box = page.locator('#script-records .rec-sub').nth(id === 'outbound' ? 0 : 1).locator('input')
    await box.click()
    await expect.poll(() => on(page, site, id)).toBe(true)
    await expect(box).toBeChecked()
    await box.click()
    await expect.poll(() => on(page, site, id)).toBe(false)
    await expect(box).not.toBeChecked()
  }
})

test('new sites record vitals; goals on, heatmaps off; the list carries each choice size', async ({ page }) => {
  const site = await newSite(page, 'defaults')
  const mods = (await listing(page, site)).modules
  const by = (id: string) => mods.find((m) => m.id === id)!
  expect(by('vitals').enabled).toBe(true)
  expect(by('goals').enabled).toBe(true)
  expect(by('heatmaps').enabled).toBe(false)
  for (const id of ['goals', 'vitals', 'heatmaps']) expect(by(id).tracker_bytes, id).toBeGreaterThan(0)
})

test('what has no switch is always there, and revenue waits to be connected', async ({ page }) => {
  const site = await newSite(page, 'always')
  const status = (path: string) => page.request.get(`${API}/api/v1/sites/${site.id}/${path}`, { headers: H }).then((r) => r.status())
  const mods = (await listing(page, site)).modules
  expect(mods.filter((m) => m.group === 'always').map((m) => m.id).sort()).toEqual(['crawlers', 'funnels', 'journeys', 'map', 'notes', 'retention', 'rhythm'])
  for (const m of mods.filter((x) => x.group === 'always')) {
    // An older client asking for it off is answered, and nothing changes.
    const off = await page.request.put(`${API}/api/v1/sites/${site.id}/modules/${m.id}`, { headers: H, data: { enabled: false } })
    expect(off.ok(), m.id).toBe(true)
    expect.soft(await on(page, site, m.id), `${m.id} still on`).toBe(true)
    if (OWNS[m.id]) expect.soft(await status(OWNS[m.id]), `${m.id} answers`).not.toBe(404)
  }
  // Not connected: nothing to show, and the dashboard says how to start.
  expect((await listing(page, site)).modules.find((m) => m.id === 'revenue')!.enabled).toBe(false)
  expect(await status(OWNS.revenue)).toBe(404)
})

test('the script: a module that is off sends no code, and the sizes the dialog shows are the real ones', async ({ page }) => {
  test.setTimeout(120_000)
  const site = await newSite(page, 'script')
  const set = (id: string, enabled: boolean) => page.request.put(`${API}/api/v1/sites/${site.id}/modules/${id}`, { headers: H, data: { enabled } })
  const size = async () => gzipSync(Buffer.from(await served(page, site)), { level: 9 }).length
  for (const id of ['goals', 'outbound', 'revenue', 'vitals', 'forms']) await set(id, false)
  const core = await size()
  const info = await listing(page, site)
  // The strip says "core X · all Y": X is what a site with every tracking module off sends, within the line that names the site.
  expect(Math.abs(core - info.script.core)).toBeLessThan(64)
  expect(info.script.bytes).toBe(info.script.core)

  for (const id of ['goals', 'outbound', 'revenue', 'vitals', 'forms']) {
    await set(id, true)
    const now = await size()
    const m = (await listing(page, site)).modules.find((x) => x.id === id)!
    // "+N B in the browser": that module costs about what it says.
    expect(now, `${id} adds code`).toBeGreaterThan(core)
    expect(Math.abs(now - core - (m.tracker_bytes ?? 0)), `${id}: ${now - core} B added, ${m.tracker_bytes} B promised`).toBeLessThan(40)
    await set(id, false)
    expect(await size(), `${id} off again`).toBe(core)
  }
  // The same figure the strip shows follows the switches.
  await set('goals', true)
  expect((await listing(page, site)).script.bytes).toBeGreaterThan(info.script.core)
})

test('the tracker in a real page: Goals, Outbound links and Checkout do what they say while on, and nothing once off', async ({ browser, page }) => {
  test.setTimeout(120_000)
  const site = await newSite(page, 'track')
  const set = (id: string, enabled: boolean) => page.request.put(`${API}/api/v1/sites/${site.id}/modules/${id}`, { headers: H, data: { enabled } })
  const names = async () => (await recent(page.request, site)).map((e) => (e as unknown as { goal?: string; kind: string }).goal ?? '').filter(Boolean).sort()

  // Everything on: the three click kinds each leave their goal.
  for (const id of ['goals', 'outbound', 'revenue']) await set(id, true)
  let context = await browser.newContext({ userAgent: UA })
  let view = await realPage(context, site)
  await view.click('#goal')
  await view.click('#out')
  await view.click('#file')
  await expect.poll(names, { timeout: 15_000 }).toEqual(['file_download', 'outbound_click', 'signup'])
  // Checkout: the hosted-checkout link carries the visitor, so a sale can be credited.
  await view.click('#buy')
  expect(await view.locator('#buy').getAttribute('href')).toMatch(/client_reference_id=trckable_/)
  await context.close()

  // Everything off: a fresh browser (the script is cached for an hour in the old one) clicks the same things.
  for (const id of ['goals', 'outbound', 'revenue']) await set(id, false)
  context = await browser.newContext({ userAgent: UA })
  view = await realPage(context, site)
  const before = (await recent(page.request, site)).length
  await view.click('#goal')
  await view.click('#out')
  await view.click('#file')
  await view.click('#buy')
  expect(await view.locator('#buy').getAttribute('href')).toBe('https://buy.stripe.com/test_abc')
  // A goal fired by hand is refused by the script, and the page view that came with the load (and its engagement) is all that is new.
  expect(await view.evaluate(() => typeof (window as unknown as { trckable: (...a: unknown[]) => unknown }).trckable('goal', 'by_hand'))).toBe('undefined')
  await expect.poll(async () => (await recent(page.request, site)).length, { timeout: 15_000 }).toBeGreaterThan(before)
  // The hosted-checkout click of the first round is an outbound link too: it is the second outbound_click.
  expect(await names()).toEqual(['file_download', 'outbound_click', 'outbound_click', 'signup'])
  await context.close()
})

test('Forms: a submitted form is a goal while the module is on, and not once off', async ({ browser, page }) => {
  test.setTimeout(90_000)
  const site = await newSite(page, 'forms')
  const set = (id: string, enabled: boolean) => page.request.put(`${API}/api/v1/sites/${site.id}/modules/${id}`, { headers: H, data: { enabled } })
  const count = async () => (await recent(page.request, site)).filter((e) => (e as unknown as { kind: string }).kind !== 'pageview').length
  await set('forms', true)
  let context = await browser.newContext({ userAgent: UA })
  let view = await realPage(context, site)
  await view.fill('input[name=email]', 'a@example.com')
  await view.click('#send')
  await expect.poll(count, { timeout: 15_000 }).toBeGreaterThan(0)
  await context.close()

  await set('forms', false)
  const had = await count()
  context = await browser.newContext({ userAgent: UA })
  view = await realPage(context, site)
  await view.fill('input[name=email]', 'a@example.com')
  await view.click('#send')
  await view.waitForTimeout(1500)
  expect(await count()).toBe(had)
  await context.close()
})

