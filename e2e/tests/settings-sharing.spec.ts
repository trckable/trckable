// Settings → Sharing: "A read-only link to this one site: no account, nothing
// to change. With revenue off, the server never sends the figure." Each option
// of a new link is made in the card and then followed to a stranger's browser:
// what it opens, what it may do, what it is told, and what stops it.
import { DatabaseSync } from 'node:sqlite'
import { createHmac } from 'node:crypto'
import { join } from 'node:path'
import { expect, test, type Browser, type Locator, type Page } from './fixtures'
import { API } from '../playwright.config'
import { H, newSite, type TestSite } from './audit-kit'

// A report is at most two years: a year back to tomorrow.
const LAST_YEAR = `from=${new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}`

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')

async function sharing(page: Page, site: TestSite) {
  await page.goto(`${API}/settings?site=${site.id}&tab=sharing`)
  const card = page.locator('#shares')
  await expect(card).toBeVisible({ timeout: 15_000 })
  return card
}

/** Fill the card's form and make the link; the address it shows. */
async function make(card: Locator, name: string, how: { password?: string; revenue?: boolean; notes?: boolean; expires?: '7d' | '30d'; embed?: string } = {}) {
  await card.getByRole('button', { name: 'New link' }).first().click()
  await card.getByLabel('Name').fill(name)
  if (how.password) {
    await card.getByRole('button', { name: 'Password' }).click()
    await card.getByLabel('Password', { exact: true }).fill(how.password)
  }
  if (how.revenue) await card.getByRole('switch', { name: 'Revenue' }).click()
  if (how.notes) await card.getByRole('switch', { name: 'Notes' }).click()
  if (how.expires) await card.getByRole('button', { name: how.expires }).click()
  if (how.embed) {
    await card.getByRole('switch', { name: 'Embed on sites' }).click()
    await card.getByLabel('Site addresses').fill(how.embed)
  }
  await card.getByRole('button', { name: 'Create link' }).click()
  const url = await card.locator('.sl-url').inputValue()
  await card.getByRole('button', { name: 'Done' }).click()
  return url
}

const link = (url: string) => url.replace(/^https?:\/\/[^/]+/, API)
const token = (url: string) => url.split('/s/')[1]

async function stranger(browser: Browser) {
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}

const sold = async (page: Page, site: TestSite) => {
  const conn = await page.request.post(`${API}/api/v1/sites/${site.id}/payments`, { headers: H, data: { provider: 'custom', secret: 'whsec_share_check' } })
  expect(conn.status()).toBe(201)
  const { id } = (await conn.json()) as { id: string }
  const body = JSON.stringify({ id: 'evt_sh_1', type: 'payment', at: new Date().toISOString(), payment: { id: 'ord_sh_1', amount: 4900, tax: 0, currency: 'USD', kind: 'one_time' } })
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', 'whsec_share_check').update(`${ts}.${body}`).digest('hex')
  const hook = await page.request.post(`${API}/webhooks/custom/${id}`, { headers: { 'content-type': 'application/json', 'Trckable-Timestamp': ts, 'Trckable-Signature': `v1=${sig}` }, data: body })
  expect(hook.ok()).toBe(true)
}

test('a public link opens read-only, can change nothing, and stops the moment it is revoked', async ({ page, browser }) => {
  const site = await newSite(page, 'sharepub')
  const card = await sharing(page, site)
  const url = await make(card, 'For the team')

  const { context, page: view } = await stranger(browser)
  await view.goto(link(url))
  await expect(view.locator('.overview-chart')).toBeVisible({ timeout: 20_000 })
  // It shows this site's numbers…
  const me = await (await view.request.get(`${API}/api/v1/share/me`)).json()
  expect(me).toMatchObject({ domain: site.domain, name: 'For the team' })
  expect((await view.request.get(`${API}/api/v1/share/report?${LAST_YEAR}`)).ok()).toBe(true)
  // …and nothing else: no site list, no settings, no writes, no other site.
  for (const [method, path, data] of [
    ['get', '/api/v1/sites', undefined],
    ['get', `/api/v1/sites/${site.id}/config`, undefined],
    ['get', `/api/v1/sites/${site.id}/shares`, undefined],
    ['patch', `/api/v1/sites/${site.id}`, { name: 'taken over' }],
    ['post', `/api/v1/sites/${site.id}/annotations`, { day: '2026-01-01', text: 'x' }],
    ['post', `/api/v1/sites/${site.id}/shares`, { name: 'more' }],
  ] as const) {
    const res = await view.request.fetch(`${API}${path}`, { method, headers: H, data })
    expect([401, 403, 404], `${method} ${path}`).toContain(res.status())
  }
  const after = ((await (await page.request.get(`${API}/api/v1/sites`)).json()) as { sites: { id: string; name: string }[] }).sites.find((s) => s.id === site.id)!
  expect(after.name).toBe(site.domain)

  // Revoke it in its row: asked first, then the stranger's very next request is refused.
  const row = card.locator('.sl-row', { hasText: 'For the team' })
  await row.getByRole('button', { name: 'Revoke For the team' }).click()
  await row.getByRole('button', { name: 'Revoke', exact: true }).click()
  await expect(card.getByText('No links yet')).toBeVisible()
  expect((await view.request.get(`${API}/api/v1/share/report?${LAST_YEAR}`)).status()).toBeGreaterThanOrEqual(401)
  const fresh = await context.newPage()
  const open = await fresh.request.post(`${API}/api/v1/share/open`, { headers: H, data: { token: token(url) } })
  expect([404, 410]).toContain(open.status())
  await context.close()
})

test('Revenue: with it off the server never sends the figure; with it on the link carries it', async ({ page, browser }) => {
  const site = await newSite(page, 'sharemoney')
  await sold(page, site)
  const card = await sharing(page, site)
  const without = await make(card, 'No money')
  const withMoney = await make(card, 'With money', { revenue: true })
  const range = `from=${new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}`
  for (const [url, want] of [
    [without, false],
    [withMoney, true],
  ] as const) {
    const { context, page: view } = await stranger(browser)
    await view.goto(link(url))
    await expect(view.locator('.overview-chart')).toBeVisible({ timeout: 20_000 })
    const body = await (await view.request.get(`${API}/api/v1/share/report?${range}`)).text()
    expect(body.includes('"money"'), `${url}: money in the report`).toBe(want)
    expect(body.includes('"revenue":'), `${url}: revenue on the rows`).toBe(want)
    expect(((await (await view.request.get(`${API}/api/v1/share/me`)).json()) as { revenue: boolean }).revenue).toBe(want)
    await context.close()
  }
})

test('a password link asks first, refuses a wrong one, and opens with the right one', async ({ page, browser }) => {
  const site = await newSite(page, 'sharepass')
  const card = await sharing(page, site)
  const url = await make(card, 'Locked', { password: 'a long enough phrase' })
  const row = card.locator('.sl-row', { hasText: 'Locked' })
  await expect(row.getByRole('img', { name: 'Password link' })).toBeVisible()

  const { context, page: view } = await stranger(browser)
  const asked = await view.request.post(`${API}/api/v1/share/open`, { headers: H, data: { token: token(url) } })
  expect(asked.status()).toBe(401)
  expect(((await asked.json()) as { needs_password: boolean }).needs_password).toBe(true)
  const wrong = await view.request.post(`${API}/api/v1/share/open`, { headers: H, data: { token: token(url), password: 'not the phrase' } })
  expect(wrong.status()).toBe(401)
  expect((await view.request.get(`${API}/api/v1/share/report?${LAST_YEAR}`)).status()).toBeGreaterThanOrEqual(401)

  await view.goto(link(url))
  await view.getByLabel(/password/i).fill('a long enough phrase')
  await view.keyboard.press('Enter')
  await expect(view.locator('.overview-chart')).toBeVisible({ timeout: 20_000 })
  await context.close()
})

test('Expires: 7 days ends it a week out, Never does not, and a link past its end answers "expired"', async ({ page, browser }) => {
  const site = await newSite(page, 'shareends')
  const card = await sharing(page, site)
  const week = await make(card, 'A week', { expires: '7d' })
  const forever = await make(card, 'For good')
  const list = async () => ((await (await page.request.get(`${API}/api/v1/sites/${site.id}/shares`, { headers: H })).json()) as { shares: { id: string; name: string; expires_at?: number }[] }).shares
  const byName = async (n: string) => (await list()).find((s) => s.name === n)!
  const ends = (await byName('A week')).expires_at!
  expect(Math.abs(ends - (Date.now() / 1000 + 7 * 86_400))).toBeLessThan(3_600)
  expect((await byName('For good')).expires_at ?? 0).toBe(0)
  await expect(card.locator('.sl-row', { hasText: 'A week' }).getByText(/^Ends /)).toBeVisible()
  await expect(card.locator('.sl-row', { hasText: 'For good' }).getByText('No end date')).toBeVisible()

  // Time passes: the end is moved to a minute ago in the store, and the link says so.
  const db = new DatabaseSync(join(process.env.TRCKABLE_DATA_DIR!, 'trckable.db'))
  try {
    db.exec('PRAGMA busy_timeout = 10000')
    db.prepare('UPDATE site_shares SET expires_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000) - 60, (await byName('A week')).id)
  } finally {
    db.close()
  }
  const { context, page: view } = await stranger(browser)
  expect((await view.request.post(`${API}/api/v1/share/open`, { headers: H, data: { token: token(week) } })).status()).toBe(410)
  expect((await view.request.post(`${API}/api/v1/share/open`, { headers: H, data: { token: token(forever) } })).ok()).toBe(true)
  await context.close()
})

test('Embed on sites: only the sites named may frame the link, and a link without it cannot be framed at all', async ({ page }) => {
  const site = await newSite(page, 'shareembed')
  const card = await sharing(page, site)
  const plain = await make(card, 'Not embedded')
  const embedded = await make(card, 'On two sites', { embed: 'https://example.org' })
  const csp = async (url: string) => (await page.request.get(link(url) + '?embed=1')).headers()
  const unframed = await csp(plain)
  expect(unframed['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(unframed['x-frame-options']).toBe('DENY')
  const framed = await csp(embedded)
  expect(framed['content-security-policy']).toContain('frame-ancestors https://example.org;')
  expect(framed['x-frame-options']).toBeUndefined()
  // The row says so, and the embed code carries this link.
  await expect(card.locator('.sl-row', { hasText: 'On two sites' }).getByRole('img', { name: 'Embeddable on https://example.org' })).toBeVisible()
})
