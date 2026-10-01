// All sites: a site's colour follows the site. Each of the first seven sites of
// the account has a colour of its own (the chart's key and its row's line agree,
// and no two repeat); the sites past the palette are one "Other sites" band,
// never a colour taken again.
import { expect, test } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
let cookie = ''
test.beforeAll(async () => {
  cookie = await session('all-sites-colors')
})

test('no two sites share a colour, and the ones past the palette are Other', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const tag = Date.now()
  for (let i = 0; i < 9; i++) {
    const domain = `colors${i}-${tag}.example.org`
    const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
    expect(made.ok()).toBe(true)
    const site = ((await made.json()) as { id: string }).id
    const pv = await page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site, k: 'pv', u: `https://${domain}/` } })
    expect(pv.ok()).toBe(true)
  }
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/overview?days=30`, { headers: H })).json()) as { sites: { domain: string; visitors: number }[] }).sites.filter((s) => s.domain.endsWith(`-${tag}.example.org`) && s.visitors > 0).length, { timeout: 30_000 }).toBe(9)

  await page.goto(`${API}/all`)
  const key = page.locator('.all-legend span')
  await expect(key.first()).toBeVisible()
  const swatches = await key.evaluateAll((els) => els.map((e) => ({ name: (e.textContent ?? '').trim(), color: getComputedStyle(e.querySelector('i')!).backgroundColor })))
  const named = swatches.filter((s) => s.name !== 'Other sites')
  // More than seven sites have visits: seven colours, then one grey band.
  expect(named).toHaveLength(7)
  expect(swatches.at(-1)!.name).toBe('Other sites')
  expect(new Set(named.map((s) => s.color)).size, 'every coloured site has its own colour').toBe(7)
  expect(named.map((s) => s.color), 'Other is not one of the seven').not.toContain(swatches.at(-1)!.color)

  // The row's line is the key's colour: a colour belongs to the site, here and there.
  for (const s of named) {
    const row = page.locator('.all-row', { has: page.locator('.all-name b', { hasText: new RegExp(`^${s.name.replace(/\./g, '\\.')}$`) }) })
    const stroke = await row.locator('.all-spark path[stroke]').evaluate((p) => getComputedStyle(p).stroke)
    expect(stroke, `${s.name}: its line and its key agree`).toBe(s.color)
  }
  // The newest site is past the palette: no colour of its own in its row either.
  const last = page.locator('.all-row', { has: page.locator('.all-name b', { hasText: `colors8-${tag}.example.org` }) })
  const other = await last.locator('.all-spark path[stroke]').evaluate((p) => getComputedStyle(p).stroke)
  expect(named.map((s) => s.color)).not.toContain(other)
})
