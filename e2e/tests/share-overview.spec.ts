// Share from the Overview: the header's button opens a sheet over the page (the page stays under the backdrop), the
// picture the server draws loads as a PNG, and Download names the file after the site, the card and the period.
import { mkdirSync } from 'node:fs'
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the sheet')

// SHARE_SHOTS=<folder> saves the pictures for the review.
const SHOTS = process.env.SHARE_SHOTS

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
})

for (const [width, colorScheme] of [[1440, 'dark'], [1440, 'light'], [390, 'dark']] as const) {
  test(`Share opens over the Overview and hands out the picture, ${width}px ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=7d`)
    await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })

    const card = page.waitForResponse((r) => r.url().includes('/card?') && r.url().includes('t=overview'))
    await page.locator('.share-chip').click()
    const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
    await expect(dialog).toBeVisible()
    const res = await card
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('image/png')
    expect((await res.body()).subarray(0, 4).toString('latin1')).toBe('\x89PNG')
    const img = dialog.locator('.sd-preview img')
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1200)

    // The page stays under the backdrop: still there, not put away.
    await expect(page.locator('.modal-back')).toHaveCount(1)
    await expect(page.locator('#xp')).toBeVisible()
    await expect(page.locator('header.hd')).toBeVisible()
    // The picture fits the sheet's width.
    const box = (await img.boundingBox())!
    const sheet = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(sheet.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(sheet.x + sheet.width + 1)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/sheet-${width}-${colorScheme}.png` })

    // Download names the file after the site, the card and the period.
    const file = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download PNG' }).click()
    expect((await file).suggestedFilename()).toBe(`trckable-${STEADY_DOMAIN}-overview-7d.png`)

    if (SHOTS && width === 1440) {
      const sites = (await (await page.request.get(`${API}/api/v1/sites`)).json()) as { sites: { id: string; domain: string }[] }
      const id = sites.sites.find((s) => s.domain === STEADY_DOMAIN)!.id
      const png = await page.request.get(`${API}/api/v1/sites/${id}/card?t=overview&period=7d&theme=${colorScheme}&accent=%23b8ff3c`)
      expect(png.headers()['content-type']).toBe('image/png')
      const { writeFileSync } = await import('node:fs')
      writeFileSync(`${SHOTS}/card-${colorScheme}.png`, await png.body())
    }

    // Escape puts the sheet away and the page is as it was.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('#xp')).toBeVisible()
  })
}
