// On a phone the header has no period button: the period line in the Briefing's hero is the way in, and it opens the
// period menu as a sheet whose last choice can be pressed.
import { expect, test } from './fixtures'
import { flowSession, openFlow } from './flows-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the flows')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

test('the period line in the hero opens the period menu at 390, and a choice changes the period', async ({ page }) => {
  await openFlow(page, cookie, { width: 390, scheme: 'dark' })
  // At scroll 0 the line sits just under the header, not behind it.
  const line = page.locator('.tline')
  await expect(line).toBeVisible()
  const gap = await page.evaluate(() => document.querySelector('.tline')!.getBoundingClientRect().top - document.querySelector('.hd')!.getBoundingClientRect().bottom)
  expect(gap).toBeGreaterThanOrEqual(0)
  await line.click()
  const menu = page.locator('#perMenu.on')
  await expect(menu).toBeVisible()
  const last = menu.getByRole('button').last()
  await last.scrollIntoViewIfNeeded()
  const hit = await last.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return at === el || el.contains(at)
  })
  expect(hit).toBe(true)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await line.click()
  await menu.getByRole('button', { name: /^Last 7 days/ }).click()
  await expect(page).toHaveURL(/period=7d/)
})
