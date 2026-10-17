// The Visitors tile's pace line, on the demo data (skipped unless TRCKABLE_A11Y_URL points at a trckabled with it):
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test extras
import { expect, test } from './fixtures'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')

// "Last 30 days" ends today, so it is live; the pace line needs three whole days of this month.
const dayOfMonth = (tz: string) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: tz, day: '2-digit' }).format(new Date()))

test('the pace line sits in the Visitors tile once three days of the month have gone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(BASE + '/login')
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
  const site = await page.evaluate(async () => ((await (await fetch('/api/v1/sites')).json()) as { sites: { domain: string; timezone: string }[] }).sites[0])
  await page.goto(`${BASE}/${site.domain}?view=briefing&period=30d`)
  await expect(page.locator('.kc[data-k="people"]')).toBeVisible({ timeout: 20_000 })
  const pace = page.locator('.kc[data-k="people"] .kpi-pace')
  if (dayOfMonth(site.timezone) > 3) {
    await expect(pace).toHaveText(/^→ ~[\d.,]+[KkM]? this month$/, { timeout: 20_000 })
  } else {
    await page.waitForTimeout(2000)
    await expect(pace, 'under three whole days: nothing is said').toHaveCount(0)
  }
})
