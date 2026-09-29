// The account window keeps one size on every tab, and on a phone its tabs are
// one row that does not scroll sideways.
import { expect, test } from '@playwright/test'
import { API, TOKEN } from '../playwright.config'
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
      // The owner badge in the head stays.
      await expect(window.locator('.window-head .tag').first()).toBeVisible()
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

test('site settings never scrolls sideways on a phone or a big phone, and a tab keeps its flag in its name', async ({ page, request }) => {
  const sites = (await (await request.get(`${API}/api/v1/sites`, { headers: { Authorization: 'Bearer ' + TOKEN } })).json()).sites as { id: string; domain: string }[]
  const site = sites.find((s) => s.domain === 'example.com')!.id
  await page.context().addCookies([{ name: 'trckable_session', value: await session('account-window'), url: API }])
  for (const width of [390, 660, 700]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(API + `/settings?site=${site}&tab=site`)
    const window = page.locator('.modal.window')
    await expect(window).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(300)
    const over = await window.evaluate((el) => [el, ...Array.from(el.querySelectorAll('.window-body'))].map((n) => n.scrollWidth - n.clientWidth))
    expect(over.every((o) => o <= 0), `sideways overflow at ${width}: ${over}`).toBe(true)
  }
  const flagged = page.locator('.window-nav button:has(.tag)')
  const n = await flagged.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    const text = (await flagged.nth(i).locator('.tag').innerText()).trim()
    await expect(flagged.nth(i)).toHaveAccessibleName(new RegExp(text))
  }
})
