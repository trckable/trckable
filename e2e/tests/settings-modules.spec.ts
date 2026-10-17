// Settings → Modules: "A module that is off sends no JavaScript, runs nothing
// and hides its views." Switching one off in the dialog is followed to the
// served script, the real tracker in a real page, the server's own refusal
// and the cards on the dashboard; switching it back restores each.
import { gzipSync } from 'node:zlib'
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { H, UA, newSite, openSettings, realPage, recent, type TestSite } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')

type Mod = { id: string; name: string; enabled: boolean; tracker_bytes?: number }
type Listing = { modules: Mod[]; script: { bytes: number; core: number; full: number; url: string } }

const listing = async (page: Page, site: TestSite) => (await (await page.request.get(`${API}/api/v1/sites/${site.id}/modules`, { headers: H })).json()) as Listing
const on = async (page: Page, site: TestSite, id: string) => (await listing(page, site)).modules.find((m) => m.id === id)!.enabled
const served = async (page: Page, site: TestSite) => (await page.request.get(`${API}/js/${site.id}.js`)).text()

/** The module's switch in Settings → Modules, then the question it asks first. */
async function flip(page: Page, site: TestSite, mod: Mod, to: boolean) {
  await openSettings(page, site, 'modules')
  const sw = page.getByRole('switch', { name: `${mod.name}: ${to ? 'off' : 'on'}` })
  await sw.click()
  await page.getByRole('dialog', { name: `${to ? 'Turn on' : 'Turn off'} ${mod.name}` }).getByRole('button', { name: to ? 'Turn on' : 'Turn off', exact: true }).click()
  await expect(page.getByRole('switch', { name: `${mod.name}: ${to ? 'on' : 'off'}` })).toBeVisible()
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
  revenue: 'report/pages-sell?from=2026-01-01&to=2026-01-02',
  search: 'report/search?from=2026-01-01&to=2026-01-02',
  heatmaps: 'heat?path=/&from=2026-01-01&to=2026-01-02',
}

test('every module: switching it off in Settings is followed by the server, and switching it on brings it back', async ({ page }) => {
  test.setTimeout(240_000)
  const site = await newSite(page, 'mods')
  const mods = (await listing(page, site)).modules
  expect(mods.map((m) => m.id)).toEqual(expect.arrayContaining(['goals', 'outbound', 'revenue', 'funnels', 'notes', 'rhythm', 'journeys', 'map', 'retention', 'vitals', 'consent', 'crawlers', 'forms', 'heatmaps', 'search']))
  const status = (path: string) => page.request.get(`${API}/api/v1/sites/${site.id}/${path}`, { headers: H }).then((r) => r.status())

  for (const m of mods) {
    // Start from on, whatever the default is; "records data" modules have no side effects here.
    if (!m.enabled) await page.request.put(`${API}/api/v1/sites/${site.id}/modules/${m.id}`, { headers: H, data: { enabled: true } })
    if (OWNS[m.id]) expect.soft(await status(OWNS[m.id]), `${m.id} on`).not.toBe(404)

    await flip(page, site, { ...m, enabled: true }, false)
    expect.soft(await on(page, site, m.id), `${m.id} off`).toBe(false)
    if (OWNS[m.id]) expect.soft(await status(OWNS[m.id]), `${m.id} off: the server refuses`).toBe(404)

    await flip(page, site, { ...m, enabled: false }, true)
    expect.soft(await on(page, site, m.id), `${m.id} on again`).toBe(true)
    if (OWNS[m.id]) expect.soft(await status(OWNS[m.id]), `${m.id} on again`).not.toBe(404)
  }
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

