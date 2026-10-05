// A person's picture is their avatar everywhere it shows: the header button,
// Profile and their row in People all change together, with no reload.
// It signs in as the suite's shared owner and takes the picture off again:
// signing in is limited per address, so this spec makes no sign-in of its own.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

test.describe.configure({ mode: 'serial' })

async function png(page: Page) {
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 120
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#2a7'
    ctx.fillRect(0, 0, 120, 120)
    return c.toDataURL('image/png')
  })
  return Buffer.from(url.split(',')[1], 'base64')
}

const shown = (page: Page, where: string) => page.locator(where + ' .avatar img')

test('a new picture shows in the header, Profile and People at once, and goes at once', async ({ page }) => {
  const cookie = await session('people-avatars')
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const headers = { Cookie: 'trckable_session=' + cookie, 'X-Trckable-Request': '1' }
  // Whatever happens below, the shared owner ends without a picture.
  try {
    await page.goto(API + '/example.com?account=profile')
    // The window's name follows its tab, so it is found by its class.
    const window = page.locator('.modal.window')
    await expect(window).toBeVisible({ timeout: 15_000 })
    const header = '.account-btn'
    const profile = '.me-photo'
    await expect(shown(page, header)).toHaveCount(0)
    await expect(shown(page, profile)).toHaveCount(0)

    await page.locator('input[type=file][accept*="image/png"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: await png(page) })
    await page.getByRole('button', { name: 'Save picture' }).click()
    await expect(page.locator('.crop-modal')).toHaveCount(0, { timeout: 10_000 })

    // No reload: the same page shows the picture in both, and in People.
    await expect(shown(page, header)).toHaveCount(1)
    await expect(shown(page, profile)).toHaveCount(1)
    await window.getByRole('tab', { name: /People/ }).click()
    const mine = shown(page, '.person.self')
    await expect(mine).toHaveCount(1)
    await expect(mine).toHaveJSProperty('complete', true)
    expect(await mine.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    // The same version everywhere: a new picture is fetched under the same address.
    const versions = await page.evaluate(() => [...document.querySelectorAll('.account-btn .avatar img, .person.self .avatar img')].map((i) => new URL((i as HTMLImageElement).src).search))
    expect(new Set(versions).size).toBe(1)

    // Their picture is served to their own account by person id too.
    const me = await (await page.request.get(`${API}/api/v1/me`, { headers })).json()
    const list = await (await page.request.get(`${API}/api/v1/people`, { headers })).json()
    const self = list.people.find((p: { email: string }) => p.email === me.email)
    expect(self.has_avatar).toBe(true)
    const byId = await page.request.get(`${API}/api/v1/people/${self.id}/avatar`, { headers })
    expect(byId.status()).toBe(200)
    expect(byId.headers()['content-type']).toMatch(/^image\//)

    // Removing it: initials again, in all three, still without a reload.
    await window.getByRole('tab', { name: 'Account', exact: true }).click()
    await page.getByRole('button', { name: 'Remove your picture' }).click()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(shown(page, profile)).toHaveCount(0)
    await expect(shown(page, header)).toHaveCount(0)
    await window.getByRole('tab', { name: /People/ }).click()
    await expect(window.locator('.person.self')).toBeVisible()
    await expect(shown(page, '.person.self')).toHaveCount(0)
    await expect(window.locator('.person.self .avatar')).toHaveText(/^\S$/)
  } finally {
    await page.request.delete(`${API}/api/v1/account/avatar`, { headers })
  }
})
