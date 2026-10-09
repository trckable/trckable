// All sites: the Online now card and the sites' own live counts come from one
// read, so the card is the sum of the counts at every moment, and a visit
// raises the card and its site's count together, without a reload.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

test('a visit raises Online now and the site\'s count together, without a reload', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('all-sites-online'), url: API }])
  const domain = `live-${Date.now()}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.ok()).toBe(true)
  const site = ((await made.json()) as { id: string }).id

  await page.goto(`${API}/all?layout=cards`)
  await expect(page.locator('.all-item', { hasText: domain })).toBeVisible({ timeout: 20_000 })
  // Every 50 ms: the card, the sum of the counts, and this site's count.
  await page.evaluate((d) => {
    const w = window as unknown as { seen: { card: number; sum: number; mine: number }[] }
    w.seen = []
    setInterval(() => {
      const card = [...document.querySelectorAll('.kit-metric')].find((c) => c.textContent?.includes('Online now'))
      const num = (el: Element | null | undefined) => Number((el?.textContent ?? '').replace(/\D/g, '')) || 0
      const dots = [...document.querySelectorAll('.all-item')].map((i) => ({ d: i.textContent?.includes(d), n: num(i.querySelector('.all-online:not(.none)')) }))
      w.seen.push({ card: num(card?.querySelector('.rn-text')), sum: dots.reduce((a, x) => a + x.n, 0), mine: dots.filter((x) => x.d).reduce((a, x) => a + x.n, 0) })
    }, 50)
  }, domain)

  const sent = await page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site, k: 'pv', u: `https://${domain}/` } })
  expect(sent.ok()).toBe(true)

  await expect.poll(() => page.evaluate(() => (window as unknown as { seen: { mine: number }[] }).seen.some((s) => s.mine === 1)), { timeout: 40_000 }).toBe(true)
  const seen = await page.evaluate(() => (window as unknown as { seen: { card: number; sum: number; mine: number }[] }).seen)
  const apart = seen.filter((s) => s.card !== s.sum)
  expect(apart, 'the card equals the sum of the counts at every sample').toEqual([])
  expect(seen.find((s) => s.mine === 1)!.card).toBeGreaterThanOrEqual(1)
})
