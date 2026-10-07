// All sites: on a wide screen the site cards run four to a row.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }

test('four site cards share one row at 1440 px', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('all-sites-grid'), url: API }])
  const tag = Date.now()
  for (let i = 0; i < 4; i++) {
    const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `grid${i}-${tag}.example.org` } })
    expect(made.ok()).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${API}/all?layout=cards`)
  const items = page.locator('.all-cards .all-item')
  await expect(items.nth(3)).toBeVisible({ timeout: 20_000 })
  const tops = await items.evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().top)))
  expect(new Set(tops).size, 'the first four cards are on one row').toBe(1)
})
