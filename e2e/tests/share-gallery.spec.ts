// Share's gallery: the Overview pictures are thumbnails to pick from; each picked picture, in each size, is drawn and
// downloaded at that size under its own name.
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
  test(`Share: pick a picture and a size, download it, ${width}px ${colorScheme}`, async ({ page }) => {
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

    // The gallery: one thumbnail per Overview picture, the chart picture picked.
    const pics = dialog.getByRole('radiogroup', { name: 'Card' })
    for (const name of ['Overview', 'Big number', 'In numbers', 'Leaderboard']) await expect(pics.getByRole('radio', { name })).toBeEnabled()
    // On a phone the sheet opens on the section the menu was in; the Overview is one tap away.
    if (width < 768) await pics.getByRole('radio', { name: /Overview/ }).click()
    await expect(pics.getByRole('radio', { name: /Overview/ })).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => pics.locator('.sd-thumb img').evaluateAll((l) => l.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 360))).toBe(true)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/gallery-${width}-${colorScheme}.png` })

    const img = dialog.locator('.sd-preview img.sd-img:not(.is-out, .is-loader)')
    const size = () => img.evaluate((el: HTMLImageElement) => (el.complete ? `${el.naturalWidth}x${el.naturalHeight}` : ''))
    for (const [name, id] of [['Big number', 'numbers'], ['In numbers', 'grid'], ['Overview', 'overview']] as const) {
      await pics.getByRole('radio', { name: new RegExp(name) }).click()
      await dialog.getByRole('button', { name: /^Look/ }).click()
      for (const [shape, label, dims] of [['link', 'Link', '1200x630'], ['story', 'Story', '1080x1920']] as const) {
        await dialog.getByRole('radio', { name: label }).click()
        await expect.poll(size).toBe(dims)
        const file = page.waitForEvent('download')
        await dialog.getByRole('button', { name: /^Download \d+×\d+$/ }).click()
        expect((await file).suggestedFilename()).toBe(`trckable-${STEADY_DOMAIN}-${id}${shape === 'link' ? '' : `-${shape}`}-7d.png`)
      }
      await dialog.getByRole('button', { name: /^What to share/ }).click()
    }
  })
}
