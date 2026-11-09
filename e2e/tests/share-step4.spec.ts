// Share, step 4: an Explore section's Share icon opens the sheet on that section's pictures; the sheet gives the
// picture or its text post; Copy link puts the site's public link on the clipboard.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

async function openExplore(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=explore&period=7d`)
  await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
}

test('Share: the Explore icon opens the sheet on its section, left of the menu', async ({ page }) => {
  await openExplore(page, 1280)
  await page.locator('nav, aside').getByText('Sources', { exact: true }).first().click()
  const icon = page.locator('#xp .xtb').getByRole('button', { name: 'Share' })
  await expect(icon).toBeVisible()
  const [a, b] = await Promise.all([icon.boundingBox(), page.locator('#xp .xtb .xmore').boundingBox()])
  expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x)
  await icon.click()
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^What to share/ })).toContainText('Top sources')
  await expect(dialog.getByRole('radio', { name: /^Top sources/ })).toHaveAttribute('aria-checked', 'true')
})

test('Share: on a phone it is the first item of the menu', async ({ page }) => {
  await openExplore(page, 390)
  await page.locator('.xmore').click()
  const first = page.locator('#xm-more [role=menuitem]').first()
  await expect(first).toHaveText(/Share a picture/)
  await first.click()
  await expect(page.getByRole('dialog', { name: 'Share your numbers' })).toBeVisible()
})

test('Share: a text post says the picture, and Copy link puts the public link on the clipboard', async ({ page }) => {
  const sites = await (await page.request.get(`${API}/api/v1/sites`, { headers: { Cookie: `trckable_session=${cookie}` } })).json()
  const id = sites.sites.find((s: { domain: string }) => s.domain === STEADY_DOMAIN).id
  const made = await (await page.request.post(`${API}/api/v1/sites/${id}/shares`, { headers: { Cookie: `trckable_session=${cookie}`, 'X-Trckable-Request': '1' }, data: { name: 'Step 4' } })).json()
  await openExplore(page, 1280)
  await page.locator('nav, aside').getByText('Sources', { exact: true }).first().click()
  await page.locator('#xp .xtb').getByRole('button', { name: 'Share' }).click()
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  await dialog.getByRole('radio', { name: 'Text post' }).click()
  await expect(dialog.locator('.sd-post')).toContainText(STEADY_DOMAIN)
  await expect(dialog.locator('.sd-post')).toContainText('Top sources')
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Top sources')
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(made.url)
})
