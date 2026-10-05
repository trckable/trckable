// Data opens on Story: one sentence, four tiles, and a switch to Explore.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

test('Data opens on Story, switches to Explore and back', async ({ page, context }) => {
  await context.addCookies([{ name: 'trckable_session', value: await session('story'), url: API }])
  await page.goto(`${API}/example.com?v=story`)
  await expect(page.locator('.sv-line')).toBeVisible()
  await expect(page.locator('.sv-tile')).toHaveCount(4)

  await page.locator('[aria-label="Data view"] button', { hasText: 'Explore' }).click()
  await expect(page).toHaveURL(/v=explore/)
  await expect(page.locator('.sv-line')).toHaveCount(0)

  await page.locator('[aria-label="Data view"] button', { hasText: 'Story' }).click()
  await expect(page).toHaveURL(/v=story/)
  await expect(page.locator('.sv-tile')).toHaveCount(4)
})
