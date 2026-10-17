// An address that names none of the person's sites goes to their main
// dashboard, with the address corrected: never the Settings page.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('unknown-site'), url: API }])
})

test('an unknown site goes to the main dashboard, not Settings', async ({ page }) => {
  await page.goto(API + '/no-such-site.example?view=data')
  // Which of the owner's sites is the main one depends on what the other suites did to them: any of them will do.
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:18300\/(example\.com|busy\.example|history\.example)\?view=data$/)
  await expect(page.locator('.brief .kcs .kc').first()).toBeVisible()
  await expect(page.getByText('Pick a site')).toHaveCount(0)
})

test('a known site in another case opens as it is', async ({ page }) => {
  await page.goto(API + '/EXAMPLE.com?view=data')
  await expect(page.locator('.brief .kcs .kc').first()).toBeVisible()
  await expect(page).toHaveURL(API + '/EXAMPLE.com?view=data')
})
