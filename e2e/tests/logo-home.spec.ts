// The logo is Home: from the Briefing on another period, one click lands on the site's Live with the period back to
// default, no panel open, and the tooltip says only "Home".
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the header')

test('the logo goes Home: Live, default view, nothing open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: await session('logo-home'), url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
  await expect(page.getByRole('tab', { name: 'Briefing' })).toHaveAttribute('aria-selected', 'true')
  // A sheet is open over the page: Home closes it too.
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.locator('.pal.on .palbox input')).toBeVisible()
  await page.keyboard.press('Escape')
  const logo = page.locator('.hd #logo')
  await expect(logo).toHaveAttribute('title', 'Home')
  await logo.click()
  await expect(page).toHaveURL(/view=live/)
  await expect(page).not.toHaveURL(/f=|xf=|xp=|period=7d/)
  await expect(page.getByRole('tab', { name: /^Live/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.xscrim.on, .pal.on')).toHaveCount(0)
})
