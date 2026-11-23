// A page's title above its path in Explore's Pages table, as Search Console shows it: sent by the script with a
// pageview, kept once per path, the path small and grey under it, and the path alone for a page with no title.
// A site of its own, so no other suite's counts move.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'
import { useCookies } from './audit-kit'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

const SHOTS = process.env.TITLES_SHOTS

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('titles')
})

test('Pages shows each page title with its path under it', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'chromium', 'one browser is enough: the server does the work')
  await page.setViewportSize({ width: 1280, height: 900 })
  await context.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const domain = `titles-${Date.now()}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.ok()).toBe(true)
  const site = ((await made.json()) as { id: string }).id
  await useCookies(page.request, site)
  const visit = (path: string, id: string, ti?: string) =>
    page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site, k: 'pv', u: `https://${domain}${path}`, id, v: `${id}.k3j2`, ...(ti ? { ti } : {}) } })
  expect((await visit('/pricing', 'aaaa1', 'Pricing | Acme')).ok()).toBe(true)
  expect((await visit('/pricing', 'aaaa2', 'Plans and pricing | Acme')).ok()).toBe(true) // the latest title wins
  expect((await visit('/about', 'aaaa3')).ok()).toBe(true) // no title: the path alone
  expect((await visit('/blog', 'aaaa4', 'Notes for jane@example.com')).ok()).toBe(true) // an email never stays

  for (let i = 0; i < 30; i++) await visit('/pricing', `bbbb${i}`, 'Plans and pricing | Acme') // enough people for What changed to list

  const report = async () => {
    const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10)
    const res = await page.request.get(`${API}/api/v1/sites/${site}/report?from=${day(1)}&to=${day(0)}`, { headers: H })
    return ((await res.json()) as { current: { dims: { page?: { value: string; title?: string; visitors: number }[] } } }).current.dims.page ?? []
  }
  // The title shows with the first batch the writer commits; What changed needs every view of /pricing written (20 people is its floor).
  await expect.poll(async () => (await report()).find((r) => r.value === '/pricing'), { timeout: 30_000 }).toMatchObject({ title: 'Plans and pricing | Acme', visitors: 32 })
  expect((await report()).find((r) => r.value === '/about')?.title).toBeUndefined()
  expect((await report()).find((r) => r.value === '/blog')?.title).toBe('Notes for')

  for (const [width, height, theme] of [
    [1440, 900, 'dark'],
    [1440, 900, 'light'],
    [390, 844, 'dark'],
  ] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await page.setViewportSize({ width, height })
    await page.goto(`${API}/${domain}?view=briefing&period=7d&x=pages`)
    const rows = page.locator('#xp [data-xcard="pages"] .xt .xrw')
    const pricing = rows.filter({ hasText: '/pricing' })
    await expect(pricing.locator('b')).toHaveText('Plans and pricing | Acme')
    await expect(pricing.locator('small')).toHaveText('/pricing')
    const about = rows.filter({ hasText: '/about' })
    await expect(about).toBeVisible()
    await expect(about.locator('small')).toHaveCount(0)
    if (SHOTS) await page.locator('#xp [data-xcard="pages"]').screenshot({ path: `${SHOTS}/pages-${width}-${theme}.png` })

    // What changed: the same title above the path in the Top list.
    await page.goto(`${API}/${domain}?view=briefing&period=7d&x=changed`)
    const trend = page.locator('#xp [data-briefing="pages"]')
    await expect(trend.locator('.xtr-row', { hasText: '/pricing' }).locator('b').first()).toHaveText('Plans and pricing | Acme')
    await expect(trend.locator('.xtr-row', { hasText: '/about' }).locator('small')).toHaveCount(0)
    if (SHOTS) await trend.screenshot({ path: `${SHOTS}/changed-${width}-${theme}.png` })
  }
})
