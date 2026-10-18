// The logo is Home: from Explore with a filter on, one click lands on the site's Live with no filter and no panel open,
// and the tooltip says only "Home".
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the header')

test('the logo goes Home: Live, no filter, nothing open', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('logo-home'), url: API }])
  await page.addInitScript(() => localStorage.setItem('trckable.onboarding.skipped', '1'))
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&f=country%3AUS`)
  await expect(page.locator('#xp.on .xchip2')).toHaveCount(1)
  const logo = page.locator('.hd #logo')
  await expect(logo).toHaveAttribute('title', 'Home')
  await logo.click()
  await expect(page.locator('#xp.on')).toHaveCount(0)
  await expect(page).toHaveURL(/view=live/)
  await expect(page).not.toHaveURL(/f=country|xf=|xp=|x=|period=7d/)
  await expect(page.getByRole('tab', { name: /^Live/ })).toHaveAttribute('aria-selected', 'true')
})
