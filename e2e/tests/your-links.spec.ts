// Your links: each tagged link a site shared, with what it brought. The read is
// faked through the API route (the server's own query is covered by its Go
// tests); the page, a tap on a row and the empty state are the real dashboard.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const NOW = Math.floor(Date.now() / 1000)
const days = (n: number[]) => [...Array(30 - n.length).fill(0), ...n]

const link = (o: Record<string, unknown>) => ({ dim: 'referrer', value: '', visitors: 0, goals: 0, last: NOW - 7200, spark: days([]), ...o })

test('each link shows what it brought, and a tap opens the dashboard for it', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('your-links'), url: API }])
  await page.route('**/api/v1/sites/*/report/links*', (r) =>
    r.fulfill({
      json: {
        goals: true,
        currency: 'USD',
        exponent: 2,
        links: [
          link({ value: 'trustmrr.com', visitors: 412, goals: 18, revenue: 54000, spark: days([2, 5, 9, 14, 30, 22, 40, 31, 12]) }),
          link({ dim: 'source', value: 'newsletter', visitors: 96, goals: 3, last: NOW - 86400 * 2, spark: days([0, 4, 8, 3]) }),
          link({ value: 'friend', visitors: 7, spark: days([1, 0, 2]) }),
        ],
      },
    }),
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${API}/example.com/links?period=30d`)
  await expect(page.getByRole('heading', { name: /Your links/ })).toBeVisible({ timeout: 20_000 })
  const rows = page.locator('.yl-row')
  await expect(rows).toHaveCount(3)
  // The figures are the rows added up: 3 links, 515 visitors, 21 goals, $540.
  const stat = (name: string) => page.locator('.ps-stats div').filter({ hasText: name }).locator('dd')
  await expect(stat('Links')).toHaveText('3')
  await expect(stat('Visitors')).toHaveText('515')
  await expect(stat('Reached a goal')).toHaveText('21')
  await expect(stat('Revenue')).toHaveText('$540')
  await expect(page.getByText('Back to the dashboard')).toHaveCount(0)
  await expect(rows.nth(0)).toContainText('trustmrr.com')
  await expect(rows.nth(0)).toContainText('412')
  await expect(rows.nth(0)).toContainText('$540')
  await expect(rows.nth(0)).toContainText('Last visit')
  if (SHOTS) {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.reload()
      await expect(rows).toHaveCount(3)
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        await page.screenshot({ path: `${SHOTS}/your-links-${width}-${scheme}.png`, fullPage: true })
      }
    }
  }

  await rows.nth(1).click()
  await expect(page).toHaveURL(/\/example\.com\?.*f=source(%3A|:)newsletter/)
})

test('before any tagged visit, a sample link to copy', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('your-links'), url: API }])
  await page.route('**/api/v1/sites/*/report/links*', (r) => r.fulfill({ json: { links: [], goals: false } }))
  await page.goto(`${API}/example.com/links`)
  await expect(page.locator('.yl-sample code')).toHaveText('example.com/?ref=newsletter', { timeout: 20_000 })
  if (SHOTS) {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.reload()
      await expect(page.locator('.yl-sample')).toBeVisible()
      await page.screenshot({ path: `${SHOTS}/your-links-empty-1440-${scheme}.png` })
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: `${SHOTS}/your-links-empty-390-light.png` })
  }
})

