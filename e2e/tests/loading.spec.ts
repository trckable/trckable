// The loading ghost: the first paint (before any JavaScript) and the app's
// wait for the server are the ghost, announced as a status, and it holds
// still for people who ask for reduced motion.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'

// Hold the app's first question to the server so the loader stays up.
async function holdBoot(page: Page) {
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/v1/setup', async (route) => {
    await held
    await route.continue()
  })
  return release
}

test('the first paint is the ghost, announced as a status', async ({ page }) => {
  const release = await holdBoot(page)
  await page.goto(API + '/', { waitUntil: 'commit' })
  const status = page.getByRole('status', { name: /loading/i })
  await expect(status).toBeVisible()
  await expect(status).toHaveAttribute('aria-busy', 'true')
  await expect(status.locator('.ld-boo')).toHaveCount(1)
  const name = await status.locator('.ld-boo').evaluate((el) => getComputedStyle(el).animationName)
  expect(name).toMatch(/\bld-/) // the ghost moves (its motion: loading/Loading.css)
  release()
})

test('reduced motion: the ghost holds still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const release = await holdBoot(page)
  await page.goto(API + '/', { waitUntil: 'commit' })
  const ghost = page.getByRole('status').locator('.ld-boo')
  await expect(ghost).toHaveCount(1)
  // Firefox can read the style before the sheet applies: wait for it.
  await expect.poll(() => ghost.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  release()
})
