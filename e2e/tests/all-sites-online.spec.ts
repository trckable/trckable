// All sites: a site with no visit yet waits for one, and shows its numbers once one arrives.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

test('a visit turns the waiting tile into numbers', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('all-sites-online'), url: API }])
  const domain = `live-${Date.now()}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.ok()).toBe(true)
  const site = ((await made.json()) as { id: string }).id

  await page.goto(`${API}/all`)
  const tile = page.locator('.all-tile', { hasText: domain })
  await expect(tile).toBeVisible({ timeout: 20_000 })
  await expect(tile).toContainText('Waiting for the first visit')

  const sent = await page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site, k: 'pv', u: `https://${domain}/` } })
  expect(sent.ok()).toBe(true)
  // The sites list is read once; the numbers refresh every 15 s: after a reload the visit is there.
  await expect.poll(async () => {
    await page.reload()
    await tile.waitFor()
    return tile.locator('.all-tile-num b').count()
  }, { timeout: 40_000 }).toBe(1)
})
