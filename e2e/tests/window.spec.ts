// Profile and a site's settings are one window: whichever section is open, it
// keeps its size and its place, on a phone and on a desktop.
import { expect, test, type Page } from '@playwright/test'
import { API, TOKEN } from '../playwright.config'
import { session } from './session'

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
]

async function box(page: Page) {
  // The window pops in: measure it once that has finished.
  await page.locator('.modal.window').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const b = await page.locator('.modal.window').boundingBox()
  expect(b).not.toBeNull()
  return b!
}

for (const size of SIZES) {
  test(`Profile and settings keep one window across every section (${size.name})`, async ({ page, request, browserName }) => {
    // Two windows, every section of each, each step waiting for the window to settle: WebKit takes three times Chromium's time.
    test.slow(browserName === 'webkit')
    const sites = (await (await request.get(`${API}/api/v1/sites`, { headers: { Authorization: 'Bearer ' + TOKEN } })).json()).sites as { id: string; domain: string }[]
    const site = sites.find((s) => s.domain === 'example.com')!.id
    await page.context().addCookies([{ name: 'trckable_session', value: await session('window'), url: API }])
    await page.setViewportSize({ width: size.width, height: size.height })

    for (const url of ['/example.com?account=sites', `/settings?site=${site}&tab=site`]) {
      await page.goto(API + url)
      const window = page.locator('.modal.window')
      await expect(window).toBeVisible({ timeout: 15_000 })
      const tabs = window.getByRole('tab')
      const count = await tabs.count()
      expect(count).toBeGreaterThan(1)
      const first = await box(page)
      for (let i = 0; i < count; i++) {
        await tabs.nth(i).scrollIntoViewIfNeeded()
        await tabs.nth(i).click()
        await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true')
        const now = await box(page)
        expect(now, `section ${i} of ${url}`).toEqual(first)
      }
      if (size.name === 'phone') expect(first).toMatchObject({ x: 8, y: 44, width: size.width - 16, height: size.height - 52 })
      await page.keyboard.press('Escape')
      await expect(window).toBeHidden()
    }
  })
}
