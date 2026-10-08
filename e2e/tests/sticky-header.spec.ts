// The control line keeps working once it is stuck at the top: Story, Explore,
// Filter and the period act from there, their menus open under it, and the
// line stays where it is (a dialog's scroll lock must not carry it off).
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

async function stuck(page: Page, view: 'story' | 'explore') {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('sticky-header'), url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?v=${view}`)
  await expect(page.locator('.subbar')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.subbar .btn.range')).toBeVisible()
  if (view === 'story') await expect(page.locator('.sv-tile')).toHaveCount(4, { timeout: 30_000 })
  else await expect(page.locator('.overview-chart .chart-wrap svg')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => window.scrollTo(0, 400))
  await expect(page.locator('.subbar')).toHaveAttribute('data-stuck', 'true')
}

const barTop = (page: Page) => page.locator('.subbar').evaluate((el) => Math.round(el.getBoundingClientRect().top))

test('the period opens under the stuck line, and the line stays', async ({ page }) => {
  await stuck(page, 'explore')
  await page.locator('.subbar .btn.range').click()
  const dialog = page.getByRole('dialog', { name: 'Choose a date range' })
  await expect(dialog).toBeVisible()
  const box = (await dialog.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(50)
  expect(await barTop(page)).toBe(0)
  await expect(page.locator('.subbar')).toHaveAttribute('data-stuck', 'true')
})

test('Filter opens under the stuck line, and the line stays', async ({ page }) => {
  await stuck(page, 'explore')
  await page.locator('.subbar .btn.filter').click()
  await expect(page.getByRole('menu', { name: 'Search filters' })).toBeVisible()
  expect(await barTop(page)).toBe(0)
  await expect(page.locator('.subbar')).toHaveAttribute('data-stuck', 'true')
})

test('Story and Explore switch from the stuck line, and the line is still there', async ({ page }) => {
  await stuck(page, 'story')
  const sw = page.locator('[aria-label="Story or Explore"]')
  await sw.getByRole('button', { name: 'Explore' }).click()
  await expect(page).toHaveURL(/v=explore/)
  await expect(page.locator('.subbar')).toBeVisible()
  expect(await barTop(page)).toBeGreaterThanOrEqual(0)
  await page.evaluate(() => window.scrollTo(0, 400))
  await expect(page.locator('.subbar')).toHaveAttribute('data-stuck', 'true')
  await sw.getByRole('button', { name: 'Story' }).click()
  await expect(page).toHaveURL(/v=story/)
  await expect(page.locator('.subbar')).toBeVisible()
})
