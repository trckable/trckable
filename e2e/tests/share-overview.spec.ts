// Share from the Overview: the header's button opens a sheet over the page (the page stays under the backdrop), the
// picture the server draws loads as a PNG, and Download names the file after the site, the card and the period.
import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from './fixtures'
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

async function openFromMenu(page: Page) {
  await page.locator('.xmore').click()
  await page.getByRole('menuitem', { name: 'Share a picture' }).click()
}

for (const [width, colorScheme] of [[1440, 'dark'], [1440, 'light'], [390, 'dark']] as const) {
  test(`Share opens over the Overview and hands out the picture, ${width}px ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=7d`)
    await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })

    const card = page.waitForResponse((r) => r.url().includes('/card?') && r.url().includes('t=overview'))
    // The header's button on a wide screen; on a phone it is the ⋯ menu's "Share a picture".
    if (width < 768) await openFromMenu(page)
    else await page.locator('.share-chip').click()
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

test('the page\'s Share key opens the same sheet', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d`)
  await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
  await page.locator('[data-key=share]').evaluate((el: HTMLElement) => el.click())
  await expect(page.getByRole('dialog', { name: 'Share your numbers' })).toBeVisible()
})

// Under 768 px the header has no Share button: it is an item in the page's ⋯ menu, and from 768 px up it is
// the header's button and not in the menu.
for (const [width, colorScheme] of [[390, 'dark'], [390, 'light'], [767, 'dark']] as const) {
  test(`on a phone Share is in the ⋯ menu, not the header, ${width}px ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width, height: 844 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=7d`)
    await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('header.hd')).toBeVisible()
    await expect(page.locator('.share-chip')).toHaveCount(0)
    await page.locator('.xmore').click()
    const item = page.getByRole('menuitem', { name: 'Share a picture' })
    await expect(item).toBeVisible()
    await expect(item.locator('svg')).toHaveCount(1)
    if (SHOTS && width === 390) await page.screenshot({ path: `${SHOTS}/menu-${width}-${colorScheme}.png` })
    await item.click()
    await expect(page.getByRole('dialog', { name: 'Share your numbers' })).toBeVisible()
  })
}

test('from 768 px Share is the header button and the ⋯ menu does not repeat it', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=7d`)
  await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.share-chip')).toBeVisible()
  await page.locator('.xmore').click()
  await expect(page.getByRole('menuitem', { name: 'Export CSV' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Share a picture' })).toHaveCount(0)
})
