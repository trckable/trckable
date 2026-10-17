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
  // The main dashboard is the person's first site: other suites in the same run may have added sites, so any site of theirs will do.
  await expect(page).toHaveURL(new RegExp(`^${API}/(?!no-such-site)[a-z0-9.-]+\\?view=data$`))
  await expect(page.locator('.brief .kcs .kc').first()).toBeVisible()
  await expect(page.getByText('Pick a site')).toHaveCount(0)
})

test('a known site in another case opens as it is', async ({ page }) => {
  await page.goto(API + '/EXAMPLE.com?view=data')
  await expect(page.locator('.brief .kcs .kc').first()).toBeVisible()
  await expect(page).toHaveURL(API + '/EXAMPLE.com?view=data')
})
