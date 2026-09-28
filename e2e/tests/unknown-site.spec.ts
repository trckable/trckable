// An address that names none of the person's sites goes to their main
// dashboard, with the address corrected: never the Settings page.
import { expect, test } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('unknown-site'), url: API }])
})

test('an unknown site goes to the main dashboard, not Settings', async ({ page }) => {
  await page.goto(API + '/no-such-site.example')
  await expect(page).toHaveURL(API + '/example.com')
  await expect(page.locator('.kpi').first()).toBeVisible()
  await expect(page.getByText('Pick a site')).toHaveCount(0)
})

test('a known site in another case opens as it is', async ({ page }) => {
  await page.goto(API + '/EXAMPLE.com')
  await expect(page.locator('.kpi').first()).toBeVisible()
  await expect(page).toHaveURL(API + '/EXAMPLE.com')
})
