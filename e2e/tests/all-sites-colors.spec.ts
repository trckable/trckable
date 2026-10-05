// All sites: a site's colour follows the site. Each of the first seven sites of
// the account has a colour of its own (the chart's key and its row's line agree,
// and no two repeat); the sites past the palette are one "Other sites" band,
// never a colour taken again.
import { expect, test } from './fixtures'
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

  // The account's sites in their own order: the n-th has the n-th colour, whether or not it has visits.
  const listed = ((await (await page.request.get(`${API}/api/v1/sites`, { headers: H })).json()) as { sites: { domain: string; name: string }[] }).sites
  expect(listed.length).toBeGreaterThan(7)

  await page.goto(`${API}/all`)
  const key = page.locator('.all-legend span')
  await expect(key.first()).toBeVisible()
  const swatches = await key.evaluateAll((els) => els.map((e) => ({ name: (e.textContent ?? '').trim(), color: getComputedStyle(e.querySelector('i')!).backgroundColor })))
  const palette = await page.evaluate((n) => Array.from({ length: n }, (_, i) => {
    const probe = document.body.appendChild(document.createElement('i'))
    probe.style.color = `var(--ch-${i + 1})`
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  }), 7)
  const other = swatches.find((s) => s.name === 'Other sites')
  const named = swatches.filter((s) => s !== other)

  expect(named.length).toBeLessThanOrEqual(7)
  expect(new Set(named.map((s) => s.color)).size, 'no two sites share a colour').toBe(named.length)
  for (const s of named) {
    const at = listed.findIndex((l) => (l.name || l.domain) === s.name)
    expect(at, `${s.name}: one of the account's first seven sites`).toBeGreaterThanOrEqual(0)
    expect(at).toBeLessThan(7)
    expect(s.color, `${s.name}: the colour of its place in the list`).toBe(palette[at])
  }
  // Past the palette: one grey band, never a colour taken again. Our nine sites are the newest, so some are past it.
  expect(other, 'the sites past the seventh are one Other band').toBeDefined()
  expect(named.map((s) => s.color)).not.toContain(other!.color)
  expect(swatches.at(-1)).toBe(other)

  // The row's line is the key's colour: a colour belongs to the site, here and there.
  for (const s of named) {
    const row = page.locator('.all-row', { has: page.locator('.all-name b', { hasText: new RegExp(`^${s.name.replace(/\./g, '\\.')}$`) }) })
    const stroke = await row.locator('.all-spark path[stroke]').evaluate((p) => getComputedStyle(p).stroke)
    expect(stroke, `${s.name}: its line and its key agree`).toBe(s.color)
    expect(await row.locator('.site-mark').evaluate((m) => getComputedStyle(m).color), `${s.name}: its mark is the same colour`).toBe(s.color)
  }
  // The newest site is past the palette: its row line is the neutral one too.
  const last = page.locator('.all-row', { has: page.locator('.all-name b', { hasText: `colors8-${tag}.example.org` }) })
  expect(await last.locator('.all-spark path[stroke]').evaluate((p) => getComputedStyle(p).stroke)).toBe(other!.color)
})
