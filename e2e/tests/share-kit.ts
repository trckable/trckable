// What the share specs share: the studio, opened on a site at a width.
import { expect, type Page } from './fixtures'
import { API, STEADY_DOMAIN } from '../playwright.config'

/** The studio over the briefing of a site, at `width`, with its first picture drawn. */
export async function openStudio(page: Page, width: number, cookie: string, domain = STEADY_DOMAIN) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${domain}?view=briefing&period=7d`)
  await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
  if (width < 768) {
    await page.locator('.xmore').click()
    await page.getByRole('menuitem', { name: 'Share a picture' }).click()
  } else await page.locator('.share-chip').click()
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.sd-preview img.sd-img:not(.is-out, .is-loader)')).toBeVisible({ timeout: 20_000 })
  return dialog
}
