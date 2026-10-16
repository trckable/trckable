// The site list on a phone is really a sheet on the screen, not only a dimmed page, on an iPhone
// profile in every engine, light and dark. Two stylesheets position it (the phone scale and the
// list's own), and which one loads last must not decide where it lands.
import { devices } from '@playwright/test'
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const { defaultBrowserType: _engine, ...iphone } = devices['iPhone 14 Pro Max']
test.use({ ...iphone })

for (const scheme of ['light', 'dark'] as const) {
  // fixme: the old site switcher (pins, groups, state line, seal, domain choice) has no home in the one v2 header (v2/PageHeader); the code is kept.
  test.fixme(`the site list sheet is on the screen (${scheme})`, async ({ page }, info) => {
    await page.context().addCookies([{ name: 'trckable_session', value: await session('phone-sheets'), url: API }])
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(API + '/example.com?view=data')
    await expect(page.locator('button.site-btn')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1500) // a person looks first: the list's chunk is fetched when the browser is idle
    await page.locator('button.site-btn').tap()
    const sheet = page.locator('.pop.sites')
    await expect(sheet).toBeVisible()
    await expect.poll(() => sheet.evaluate((e) => getComputedStyle(e).opacity)).toBe('1')
    const { width, height } = page.viewportSize()!
    await expect
      .poll(async () => {
        const b = await sheet.boundingBox()
        return !!b && b.y >= 0 && b.y < height - 100 && Math.abs(b.y + b.height - height) <= 16 && b.width >= width - 16
      })
      .toBe(true)
    const hit = await sheet.evaluate((e) => {
      const r = e.getBoundingClientRect()
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(r.height / 2, 60))
      return !!top && e.contains(top)
    })
    expect(hit, 'the sheet is what a finger would touch').toBe(true)
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/public-port-sheet-${info.project.name}-${scheme}.png` })
  })
}
