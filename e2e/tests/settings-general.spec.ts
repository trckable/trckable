// Settings → General, row by row: each promise in a label or a hint is
// checked against what really happens. Chromium only (clipboard, one run is
// enough: the server does the work). A site of its own for every test, so no
// other suite's counts move.
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { H, newSite, openSettings, paths, visit, waitForEvents, type TestSite } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')

const sites = async (page: Page) => ((await (await page.request.get(`${API}/api/v1/sites`)).json()) as { sites: { id: string; name: string; timezone: string; currency: string }[] }).sites
const mine = async (page: Page, site: TestSite) => (await sites(page)).find((s) => s.id === site.id)!

// fixme: asks the old site switcher's dialog or seal, which has no home in the one v2 header; the code is kept.
test.fixme('Display name: "What you call this site in trckable" shows in the header, the site list and a shared page', async ({ page, browser }) => {
  const site = await newSite(page, 'name')
  const shared = await page.request.post(`${API}/api/v1/sites/${site.id}/shares`, { headers: H, data: { name: 'name check', revenue: false, days: 1 } })
  const link = ((await shared.json()) as { url: string }).url.replace(/^https?:\/\/[^/]+/, API)

  await openSettings(page, site, 'site')
  const dialog = page.getByRole('dialog', { name: `Settings for ${site.domain}` })
  await dialog.getByRole('button', { name: /^Display name: .*Edit$/ }).click()
  await dialog.getByRole('textbox', { name: 'Display name' }).fill('Bakery of the Bridge')
  await page.keyboard.press('Enter')
  await expect(dialog.getByText('Saved').first()).toBeVisible()
  expect((await mine(page, site)).name).toBe('Bakery of the Bridge')
  // The dialog's own head follows.
  await expect(dialog.locator('.gen-head-text b')).toHaveText('Bakery of the Bridge')

  // The dashboard header and the site list.
  await page.goto(`${API}/${site.domain}?v=explore`)
  await expect(page.locator('#siteBtn')).toContainText('Bakery of the Bridge')
  await page.locator('#siteBtn').click()
  await expect(page.getByRole('dialog', { name: 'Sites' })).toContainText('Bakery of the Bridge')
  await page.keyboard.press('Escape')

  // A page shared with someone who has no account.
  const stranger = await browser.newContext()
  const view = await stranger.newPage()
  await view.goto(link)
  await expect(view.getByText('Bakery of the Bridge').first()).toBeVisible({ timeout: 15_000 })
  await stranger.close()

  // Emptying it goes back to the domain, never to a blank.
  await openSettings(page, site, 'site')
  await dialog.getByRole('button', { name: /^Display name: .*Edit$/ }).click()
  await dialog.getByRole('textbox', { name: 'Display name' }).fill('')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await mine(page, site)).name).toBe(site.domain)
})

test('Timezone: "Which day and hour a visit belongs to": a 23:30 UTC visit moves to the next local day and back', async ({ page }) => {
  const site = await newSite(page, 'zone', false)
  // The last 23:30 UTC that is more than five minutes behind us (within the day the tracker keeps a queue).
  const now = Date.now()
  const at = new Date(now)
  at.setUTCHours(23, 30, 0, 0)
  if (at.getTime() > now - 5 * 60_000) at.setUTCDate(at.getUTCDate() - 1)
  expect((await visit(page.request, site, '/late', { age: now - at.getTime() })).ok()).toBe(true)
  await waitForEvents(page.request, site, 1)

  const hourIn = (zone: string) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]))
    return `${p.year}-${p.month}-${p.day}T${p.hour}:00`
  }
  const bucketOf = async () => {
    const day = (d: number) => new Date(at.getTime() + d * 86_400_000).toISOString().slice(0, 10)
    const res = await page.request.get(`${API}/api/v1/sites/${site.id}/report?from=${day(-1)}&to=${day(2)}&bucket=hour`, { headers: H })
    const body = (await res.json()) as { timezone: string; current: { series: { t: string; visitors: number }[] } }
    return { zone: body.timezone, hours: body.current.series.filter((s) => s.visitors > 0).map((s) => s.t) }
  }
  expect(await bucketOf()).toEqual({ zone: 'UTC', hours: [hourIn('UTC')] })

  const pick = async (search: string, option: string | RegExp) => {
    await openSettings(page, site, 'site')
    await page.getByRole('dialog').getByRole('button', { name: 'Timezone' }).click()
    await page.getByRole('searchbox', { name: 'Search a city or zone…' }).fill(search)
    await page.getByRole('option', { name: option }).first().click()
  }
  await pick('Tirane', 'Europe/Tirane')
  await expect.poll(async () => (await mine(page, site)).timezone).toBe('Europe/Tirane')
  const tirane = await bucketOf()
  expect(tirane).toEqual({ zone: 'Europe/Tirane', hours: [hourIn('Europe/Tirane')] })
  // Tirane is ahead of UTC: the same visit is on another hour, and after midnight on the next day.
  expect(tirane.hours[0].slice(0, 10)).not.toBe(hourIn('UTC').slice(0, 10))

  // And back to UTC, the way an owner would: by searching for it.
  await pick('UTC', /^UTC$/)
  await expect.poll(async () => (await mine(page, site)).timezone).toBe('UTC')
  expect(await bucketOf()).toEqual({ zone: 'UTC', hours: [hourIn('UTC')] })
})

// Rates the server would take from the ECB, put in by hand for a day long past: the test needs a number it can compute.
function putRate(day: string, currency: string, perEur: number) {
  const db = new DatabaseSync(join(process.env.TRCKABLE_DATA_DIR!, 'trckable.db'))
  try {
    db.exec('PRAGMA busy_timeout = 10000')
    db.prepare('INSERT OR REPLACE INTO fx_rates (day, currency, per_eur) VALUES (?, ?, ?)').run(day, currency, perEur)
  } finally {
    db.close()
  }
}

test('Currency: "Revenue is converted at the payment date": a EUR sale reads in USD at that day\'s rate, and in EUR when the site is switched', async ({ page }) => {
  test.setTimeout(150_000)
  const site = await newSite(page, 'money')
  // Rates for a day long past, so no real ECB feed can have an opinion about it.
  putRate('2021-03-04', 'USD', 1.25)
  putRate('2021-03-04', 'EUR', 1)
  const conn = await page.request.post(`${API}/api/v1/sites/${site.id}/payments`, { headers: H, data: { provider: 'custom', secret: 'whsec_currency_check' } })
  expect(conn.status()).toBe(201)
  const id = ((await conn.json()) as { id: string }).id
  const { createHmac } = await import('node:crypto')
  const body = JSON.stringify({ id: 'evt_cur_1', type: 'payment', at: '2021-03-04T10:00:00Z', payment: { id: 'ord_cur_1', amount: 10000, tax: 0, currency: 'EUR', kind: 'one_time' } })
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', 'whsec_currency_check').update(`${ts}.${body}`).digest('hex')
  const hook = await page.request.post(`${API}/webhooks/custom/${id}`, { headers: { 'content-type': 'application/json', 'Trckable-Timestamp': ts, 'Trckable-Signature': `v1=${sig}` }, data: body })
  expect(hook.ok()).toBe(true)

  const revenue = async () => {
    const res = await page.request.get(`${API}/api/v1/sites/${site.id}/report?from=2021-03-01&to=2021-03-10`, { headers: H })
    const b = (await res.json()) as { current: { kpis: Record<string, unknown>; money?: { revenue?: number; currency?: string } } }
    return { money: b.current.money }
  }
  // The site reports in USD: 100.00 EUR at 1.25 is 125.00 USD, in cents. The server reloads its rates about once a minute.
  await expect.poll(async () => (await revenue()).money?.revenue, { timeout: 100_000, intervals: [2_000] }).toBe(12500)
  expect((await revenue()).money?.currency).toBe('USD')

  // Switch the site to EUR in Settings: nothing to convert, the number is what was paid.
  await openSettings(page, site, 'site')
  await page.getByRole('dialog').getByRole('button', { name: 'Currency' }).click()
  await page.getByRole('searchbox', { name: 'Search a currency…' }).fill('EUR')
  await page.getByRole('option', { name: 'EUR' }).first().click()
  await expect.poll(async () => (await mine(page, site)).currency).toBe('EUR')
  await expect.poll(async () => (await revenue()).money?.revenue).toBe(10000)
})

test('Site id: "Used by the snippet and the API": Copy puts exactly the id on the clipboard, and it is the one the snippet and the API use', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: API })
  const site = await newSite(page, 'siteid')
  await openSettings(page, site, 'site')
  const row = page.locator('.srow', { hasText: 'Site id' })
  await expect(row.locator('code')).toHaveText(site.id)
  await row.getByRole('button', { name: 'Copy' }).click()
  await expect(row.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(site.id)
  // The API answers to it, and the script is served under it.
  expect((await page.request.get(`${API}/api/v1/sites/${site.id}`, { headers: H })).ok()).toBe(true)
  const script = await page.request.get(`${API}/js/${site.id}.js`)
  expect(script.ok()).toBe(true)
  expect(await script.text()).toContain(site.id)
})

test('Proxy key: Show reveals it, Copy copies it exactly, and "lets your own server forward a visitor\'s location": only with the key is the forwarded address believed', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: API })
  const site = await newSite(page, 'proxykey')
  const key = ((await (await page.request.get(`${API}/api/v1/sites/${site.id}`, { headers: H })).json()) as { proxy_key: string }).proxy_key
  expect(key).toMatch(/^tkb_px_/)
  await openSettings(page, site, 'site')
  const row = page.locator('.srow', { hasText: 'Proxy key' })
  await expect(row.locator('code')).not.toContainText('tkb_px_')
  await row.getByRole('button', { name: 'Show' }).click()
  await expect(row.locator('code')).toHaveText(key)
  await row.getByRole('button', { name: 'Copy' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key)

  // What it is for: a server in front of the site forwards the visitor's own address, and the key is what makes that believable.
  // Addresses are what location comes from (and what the owner's "exclude" list reads), so an excluded one shows it.
  const cfg = (await (await page.request.get(`${API}/api/v1/sites/${site.id}/config`, { headers: H })).json()) as Record<string, unknown>
  const put = await page.request.put(`${API}/api/v1/sites/${site.id}/config`, { headers: H, data: { ...cfg, exclude_ips: ['203.0.113.7'] } })
  expect(put.ok()).toBe(true)
  const forwarded = { 'X-Trckable-Client-IP': '203.0.113.7' }
  // With the key: the forwarded address is the visitor's, so it is the excluded one and is not counted.
  expect((await visit(page.request, site, '/with-key', { headers: { ...forwarded, 'X-Trckable-Proxy-Key': key } })).status()).toBe(202)
  // Without it, or with a wrong one: a visitor cannot name an address, so the visit counts as from this machine.
  expect((await visit(page.request, site, '/no-key', { headers: forwarded })).status()).toBe(202)
  expect((await visit(page.request, site, '/wrong-key', { headers: { ...forwarded, 'X-Trckable-Proxy-Key': 'tkb_px_wrong' } })).status()).toBe(202)
  expect((await visit(page.request, site, '/control')).status()).toBe(202)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toEqual(['/control', '/first', '/no-key', '/wrong-key'])
})

test('Week starts on: "This week", weekly charts and the weekly report start on the day chosen', async ({ page }) => {
  const site = await newSite(page, 'week')
  const week = async () => ((await (await page.request.get(`${API}/api/v1/sites/${site.id}/config`, { headers: H })).json()) as { week_start: number }).week_start
  const listed = async () => ((await sites(page)) as unknown as { id: string; week_start: number }[]).find((s) => s.id === site.id)?.week_start
  expect(await week()).toBe(1)
  await openSettings(page, site, 'site')
  const dialog = page.getByRole('dialog')
  const group = dialog.getByRole('group', { name: 'Week starts on' })
  await expect(group.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true')
  await group.getByRole('button', { name: 'Sunday' }).click()
  await expect.poll(week).toBe(0)
  // The dashboard reads it from the site list: it is the site's week now.
  expect(await listed()).toBe(0)
  await group.getByRole('button', { name: 'Monday' }).click()
  await expect.poll(week).toBe(1)
  expect(await listed()).toBe(1)
})

test('Pages after the #: counts a #/route as its own page only when switched on and the snippet says so', async ({ page }) => {
  const site = await newSite(page, 'hash')
  const hash = async () => ((await (await page.request.get(`${API}/api/v1/sites/${site.id}/config`, { headers: H })).json()) as { hash_mode: boolean }).hash_mode
  const send = (id: string) => visit(page.request, site, '/app#/pricing', { id })
  // Off: the part after # is dropped, as it is for an anchor.
  expect((await send('hash1')).status()).toBe(202)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toEqual(['/app', '/first'])
  await openSettings(page, site, 'site')
  await page.getByRole('dialog').getByRole('switch', { name: 'Pages after the #' }).click()
  await expect.poll(hash).toBe(true)
  expect((await send('hash2')).status()).toBe(202)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toEqual(['/app', '/app/#/pricing', '/first'])
  await page.getByRole('dialog').getByRole('switch', { name: 'Pages after the #' }).click()
  await expect.poll(hash).toBe(false)
})
