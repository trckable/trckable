// Share's period: the presets, All time, a custom range on the dashboard's calendar, and the comparison. Each choice is
// the picture the server draws (the request says so), and Download names the file after it.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the sheet')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

test('Share: All time, a custom range and Compare reach the picture', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=7d`)
  await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
  await page.locator('.share-chip').click()
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  await expect(dialog).toBeVisible()
  const picture = (params: string[]) => page.waitForResponse((r) => r.url().includes('/card?') && params.every((p) => r.url().includes(p)) && r.url().includes('t=overview'))

  await dialog.getByRole('button', { name: /^Period/ }).click()
  // Compare is off until asked for.
  await expect(dialog.getByRole('switch', { name: 'Compare' })).toHaveAttribute('aria-checked', 'false')
  let res = picture(['period=30d', 'compare=1'])
  await dialog.getByRole('button', { name: '30 days' }).click()
  await dialog.getByRole('switch', { name: 'Compare' }).click()
  expect((await res).status()).toBe(200)

  // All time: the comparison is not offered, and the picture does not ask for it.
  res = picture(['period=all'])
  await dialog.getByRole('button', { name: 'All time' }).click()
  const all = await res
  expect(all.url()).not.toContain('compare=1')
  expect(all.headers()['content-type']).toBe('image/png')
  await expect(dialog.getByRole('switch', { name: 'Compare' })).toHaveCount(0)

  // A custom range: two days picked on the calendar.
  await dialog.getByRole('button', { name: 'Custom range' }).click()
  const days = dialog.locator('.cal .mk-day[data-day]:not([disabled])')
  res = picture(['period=custom', 'from=', 'to='])
  await days.nth(2).click()
  await days.nth(4).click()
  expect((await res).status()).toBe(200)
  const img = dialog.locator('.sd-preview img')
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1200)

  const file = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download PNG' }).click()
  expect((await file).suggestedFilename()).toMatch(/^trckable-.*-overview-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.png$/)
})
