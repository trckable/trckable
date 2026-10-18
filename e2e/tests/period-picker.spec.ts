// The pages that carry their own period (Uptime & incidents, Your links) use the Briefing's period pill, and offer no
// comparison: they have nothing to set the numbers against.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('period-picker'), url: API }])
})

for (const page of ['links', 'incidents']) {
  test(`${page}: the pill opens the Briefing's menu with no comparison, and has no back link`, async ({ page: p }) => {
    await p.goto(`${API}/${HISTORY_DOMAIN}/${page}?period=30d`)
    await p.locator('main .pill').click()
    await expect(p.locator('main .pmenu.on')).toBeVisible()
    await expect(p.locator('main .pmenu.on')).not.toContainText('Compare')
    await expect(p.getByText('Back to the dashboard')).toHaveCount(0)
  })
}
