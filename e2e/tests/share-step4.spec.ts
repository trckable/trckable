// Share: the header's button (a wide screen) or the page menu's first item (a phone) opens the studio.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

async function openExplore(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=explore&period=7d`)
  await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
}

test('Share: on a desktop it is the header button alone, with no second one in the section row', async ({ page }) => {
  await openExplore(page, 1280)
  await page.locator('nav, aside').getByText('Sources', { exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(1)
  await expect(page.locator('#xp .xtb').getByRole('button', { name: 'Share' })).toHaveCount(0)
  await page.locator('.share-chip').click()
  await expect(page.getByRole('dialog', { name: 'Share your numbers' })).toBeVisible()
})

test('Share: on a phone it is the first item of the menu', async ({ page }) => {
  await openExplore(page, 390)
  await page.locator('.xmore').click()
  const first = page.locator('#xm-more [role=menuitem]').first()
  await expect(first).toHaveText(/Share a picture/)
  await first.click()
  await expect(page.getByRole('dialog', { name: 'Share your numbers' })).toBeVisible()
})
