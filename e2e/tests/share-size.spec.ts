// Share's size: Square, Story and Wide are the picture the server draws at that size (the preview's own pixels say so),
// and Download names the file after it.
import { mkdirSync } from 'node:fs'
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the sheet')

// SHARE_SHOTS=<folder> saves the dialog for the review.
const SHOTS = process.env.SHARE_SHOTS

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
})

for (const [width, colorScheme] of [[1280, 'dark'], [390, 'light']] as const) {
  test(`Share: the size row picks the picture's size, ${width}px ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=7d`)
    await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
    if (width < 768) {
      await page.locator('.xmore').click()
      await page.getByRole('menuitem', { name: 'Share a picture' }).click()
    } else await page.locator('.share-chip').click()
    const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
    await expect(dialog).toBeVisible()
    // On a phone the sheet opens on the section the menu was in; the Overview is one tap away.
    if (width < 768) await dialog.getByRole('radiogroup', { name: 'Card' }).getByRole('radio', { name: /Overview/ }).click()
    await dialog.getByRole('button', { name: /^Look/ }).click()
    const img = dialog.locator('.sd-preview img.sd-img:not(.is-out, .is-loader)')
    const size = () => img.evaluate((el: HTMLImageElement) => (el.complete ? `${el.naturalWidth}x${el.naturalHeight}` : ''))
    await expect.poll(size).toBe('1200x630')
    // The picture the sheet opens on can give way to the Overview once its numbers say it has nothing to show (the old
    // picture stays up while the new one loads): it is read once the preview's own request and the look agree.
    const shown = () => img.getAttribute('src').then((s) => new URL(s ?? '', API).searchParams.get('t'))

    for (const [name, shape, dims] of [['Square', 'square', '1080x1080'], ['Story', 'story', '1080x1920'], ['Wide', 'wide', '1600x900']] as const) {
      const res = page.waitForResponse((r) => r.url().includes('/card?') && !r.url().includes('format=json') && r.url().includes(`shape=${shape}`))
      await dialog.getByRole('radio', { name }).click()
      expect((await res).status()).toBe(200)
      await expect.poll(size).toBe(dims)
      // However tall the picture, it stands whole inside the sheet.
      const box = (await img.boundingBox())!
      const sheet = (await dialog.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(sheet.x + sheet.width + 1)
      if (SHOTS && shape === 'square') await page.screenshot({ path: `${SHOTS}/size-${width}-${colorScheme}.png` })
      const file = page.waitForEvent('download')
      await dialog.getByRole('button', { name: /^Download \d+×\d+$/ }).click()
      const saved = (await file).suggestedFilename()
      await expect.poll(async () => `trckable-${STEADY_DOMAIN}-${await shown()}-${shape}-7d.png`).toBe(saved)
    }
  })
}
