// The rule for every overlay: one at a time. Each opener of the Briefing and Live is opened, a child flow is opened from
// it (which takes its place), and Escape walks back out one step at a time with focus returning to the opener.
import { expect, test, type Page } from './fixtures'
import { flowSession, LOOKS, openFlow, overlays } from './flows-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the flows')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const opener = (page: Page, name: RegExp) => page.getByRole('button', { name }).first()

for (const look of LOOKS) {
  test.describe(`${look.width}px, ${look.scheme}`, () => {
    test('the email preview is one sheet, Escape closes it, and focus goes back to its button', async ({ page }) => {
      await openFlow(page, cookie, look)
      await opener(page, /^Emailed daily at|^The daily email is off/).click()
      await expect.poll(() => overlays(page)).toEqual(['Email preview'])
      await page.keyboard.press('Escape')
      await expect.poll(() => overlays(page)).toEqual([])
      await expect(opener(page, /^Emailed daily at|^The daily email is off/)).toBeFocused()
    })

    test('the page behind the email preview does not scroll, and is where it was when the sheet closes', async ({ page }) => {
      await openFlow(page, cookie, look)
      // The fixture's briefing fits the screen: make the page long enough to scroll.
      await page.evaluate(() => {
        document.body.style.minHeight = `${innerHeight + 600}px`
        document.documentElement.style.scrollBehavior = 'auto'
        window.scrollTo(0, 120)
      })
      await opener(page, /^Emailed daily at|^The daily email is off/).click()
      await expect.poll(() => overlays(page)).toEqual(['Email preview'])
      const y = () => page.evaluate(() => window.scrollY)
      const open = await y()
      await page.mouse.move(look.width - 4, 300)
      await page.mouse.wheel(0, 400)
      await page.waitForTimeout(300)
      expect(await y()).toBe(open)
      await page.keyboard.press('Escape')
      await expect.poll(() => overlays(page)).toEqual([])
      expect(await y()).toBe(open)
      await page.mouse.wheel(0, 200)
      await expect.poll(y).toBeGreaterThan(open)
    })

    test('settings open alone from the address, and a click on the backdrop or Escape closes them', async ({ page }) => {
      await openFlow(page, cookie, look, '?view=briefing&settings=alerts')
      await expect.poll(() => overlays(page)).toEqual(['Settings for history.example'])
      await page.keyboard.press('Escape')
      await expect.poll(() => overlays(page)).toEqual([])
    })

    test('Explore opens over the Briefing and Escape closes it', async ({ page }) => {
      await openFlow(page, cookie, look)
      await page.getByRole('button', { name: /^Explore all data/ }).last().click()
      await expect(page.locator('#xp.on')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('#xp.on')).toHaveCount(0)
    })
  })
}
