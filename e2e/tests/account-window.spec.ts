// The account window keeps one size on every tab, and on a phone its tabs are
// one row that does not scroll sideways.
import { expect, test } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
]
const THEMES = ['dark', 'light'] as const
const SHOTS = process.env.ACCOUNT_SHOTS

for (const size of SIZES) {
  test(`the account window keeps one size on every tab (${size.name})`, async ({ page }) => {
    await page.context().addCookies([{ name: 'trckable_session', value: await session('account-window'), url: API }])
    await page.setViewportSize({ width: size.width, height: size.height })
    for (const theme of THEMES) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.goto(API + '/example.com?account=sites')
      const window = page.locator('.modal.window')
      await expect(window).toBeVisible({ timeout: 15_000 })
      const tabs = window.getByRole('tab')
      const count = await tabs.count()
      expect(count).toBeGreaterThan(1)
      const boxes: unknown[] = []
      for (let i = 0; i < count; i++) {
        await tabs.nth(i).click()
        await expect(tabs.nth(i)).toHaveAttribute('aria-current', 'true')
        await window.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
        boxes.push(await window.boundingBox())
        if (size.name === 'phone') {
          const nav = window.locator('.window-nav')
          expect(await nav.evaluate((el) => el.scrollWidth <= el.clientWidth), `tab row scrolls at tab ${i}`).toBe(true)
        }
        if (SHOTS) await page.waitForTimeout(300)
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${size.width}-${theme}-${i}-${await tabs.nth(i).getAttribute('aria-label')}.png` })
      }
      for (const b of boxes) expect(b).toEqual(boxes[0])
      if (size.name === 'desktop') expect((boxes[0] as { height: number }).height).toBe(Math.min(720, size.height - 64))
      if (size.name === 'phone') expect(boxes[0]).toMatchObject({ x: 8, y: 44, width: size.width - 16, height: size.height - 52 })
    }
  })
}
