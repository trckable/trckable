// All sites: a site's colour follows the site. Each of the first seven sites of
// the account has a colour of its own on its line, and the sites past the
// palette are drawn neutral, never a colour taken again.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
let cookie = ''
test.beforeAll(async () => {
  cookie = await session('all-sites-colors')
})

test('a site line has the colour of its site, and the ones past the palette are neutral', async ({ page }) => {
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
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites?days=30`, { headers: H })).json()) as { sites: { domain: string; visitors: number }[] }).sites.filter((s) => s.domain.endsWith(`-${tag}.example.org`) && s.visitors > 0).length, { timeout: 30_000 }).toBe(9)

  // The account's sites in their own order: the n-th has the n-th colour, whether or not it has visits.
  const listed = ((await (await page.request.get(`${API}/api/v1/sites`, { headers: H })).json()) as { sites: { domain: string; name: string }[] }).sites
  expect(listed.length).toBeGreaterThan(7)

  await page.goto(`${API}/sites`)
  await expect(page.locator('.nx-line', { hasText: `colors8-${tag}.example.org` }).locator('.all-spark')).toBeVisible({ timeout: 20_000 })
  const palette = await page.evaluate((n) => Array.from({ length: n }, (_, i) => {
    const probe = document.body.appendChild(document.createElement('i'))
    probe.style.color = `var(--ch-${i + 1})`
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  }), 7)
  const neutral = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('i'))
    probe.style.color = 'var(--text-3)'
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })
  const strokeOf = async (name: string) => {
    const tile = page.locator('.nx-line', { has: page.locator('.nx-name b', { hasText: new RegExp(`^${name.replace(/\./g, '\\.')}$`) }) })
    return tile.locator('.all-spark path[stroke]').evaluate((p) => getComputedStyle(p).stroke)
  }
  // The n-th site of the account has the n-th colour, whichever line it is on the page.
  let checked = 0
  for (const [at, l] of listed.slice(0, 7).entries()) {
    const name = l.name || l.domain
    const line = page.locator('.nx-line', { has: page.locator('.nx-name b', { hasText: new RegExp(`^${name.replace(/\./g, '\\.')}$`) }) }).locator('.all-spark path[stroke]')
    if (!(await line.count())) continue
    expect(await strokeOf(name), `${name}: the colour of its place`).toBe(palette[at])
    checked++
  }
  expect(checked, 'at least one of the first seven sites has a line').toBeGreaterThan(0)
  // Past the palette: the neutral colour, never one taken again.
  expect(await strokeOf(`colors8-${tag}.example.org`)).toBe(neutral)
})
