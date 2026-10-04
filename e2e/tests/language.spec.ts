// The language picker in the avatar menu: Deutsch changes the dashboard's words
// and its numbers, the choice survives a reload, and English comes back.
import { expect, test, type Page } from '@playwright/test'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('language'), url: API }])
})

const lang = (page: Page) => page.evaluate(() => ({ html: document.documentElement.lang, saved: localStorage.getItem('trckable:lang') }))

test('German, and back to English', async ({ page }) => {
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data`)
  await expect(page.locator('.overview-chart .chart-wrap svg[role="img"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Visitors', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: /^Language/ }).click()
  const list = page.getByRole('menuitemradio')
  await expect(list).toHaveText(['Auto', 'English', 'Deutsch', 'Français', 'Español', 'Italiano', 'Nederlands'])
  await expect(page.getByRole('menuitemradio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemradio', { name: 'Deutsch' }).click()

  // The page starts again in German: the chosen language is kept, the words and the date picker follow.
  await expect(page.locator('.overview-chart .chart-wrap svg[role="img"]')).toBeVisible({ timeout: 15_000 })
  expect(await lang(page)).toEqual({ html: 'de', saved: 'de' })
  await expect(page.getByText('Besucher', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Visitors', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Besucher', { exact: true }).first()).toBeVisible({ timeout: 15_000 })

  await page.locator('.account-btn').click()
  await page.getByRole('menuitem', { name: /^Sprache/ }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Deutsch' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemradio', { name: 'English' }).click()

  await expect(page.getByText('Visitors', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  expect(await lang(page)).toEqual({ html: 'en', saved: 'en' })
})

test('Auto follows the browser', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-FR', baseURL: undefined })
  await context.addCookies([{ name: 'trckable_session', value: await session('language'), url: API }])
  const page = await context.newPage()
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data`)
  await expect(page.locator('.overview-chart .chart-wrap svg[role="img"]')).toBeVisible({ timeout: 15_000 })
  expect((await lang(page)).html).toBe('fr')
  await expect(page.getByText('Visiteurs', { exact: true }).first()).toBeVisible()
  await context.close()
})
