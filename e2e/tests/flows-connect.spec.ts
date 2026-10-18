// "Connect ..." buttons inside Explore: the dialog or window they open is the only overlay (the panel waits out of sight
// and is back when it closes), Escape goes back one step, and the panel's content is never under its header.
import { expect, test, type Page } from './fixtures'
import { flowSession, LOOKS, openFlow, overlays } from './flows-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the flows')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const panel = (page: Page) => page.locator('#xp')

for (const look of LOOKS) {
  test.describe(`${look.width}px, ${look.scheme}`, () => {
    test('Connect crawler data opens its steps alone, and Escape returns to Explore', async ({ page }) => {
      await openFlow(page, cookie, look, '?view=briefing&x=ai')
      await expect(panel(page).getByRole('button', { name: 'Connect crawler data' })).toBeVisible({ timeout: 20_000 })
      await panel(page).getByRole('button', { name: 'Connect crawler data' }).click()
      await expect.poll(() => overlays(page)).toEqual(['Connect crawler data'])
      await expect(panel(page)).toBeHidden()
      await page.keyboard.press('Escape')
      await expect.poll(() => overlays(page)).toEqual([])
      await expect(panel(page)).toBeVisible()
      await expect(panel(page)).toHaveClass(/\bon\b/)
      await expect(panel(page).getByRole('button', { name: 'Connect crawler data' })).toBeFocused()
    })

    test('Connect Search Console opens the settings alone, and closing them returns to Explore', async ({ page }) => {
      await openFlow(page, cookie, look, '?view=briefing&x=ai')
      await panel(page).getByRole('button', { name: 'Connect', exact: true }).click()
      await expect.poll(() => overlays(page)).toEqual(['Settings for history.example'])
      await expect(panel(page)).toBeHidden()
      await page.keyboard.press('Escape')
      await expect.poll(() => overlays(page)).toEqual([])
      await expect(panel(page)).toHaveClass(/\bon\b/)
    })

    test('what is scrolled to in the panel is not left under its header', async ({ page }) => {
      await openFlow(page, cookie, look, '?view=briefing&x=ai')
      const title = panel(page).getByText('Connect Search Console', { exact: true })
      await title.scrollIntoViewIfNeeded()
      await panel(page).getByRole('button', { name: 'Connect', exact: true }).focus()
      const gap = await page.evaluate(() => {
        const head = document.querySelector('#xp .xph')!.getBoundingClientRect().bottom
        const t = [...document.querySelectorAll('#xp b, #xp h3, #xp h2')].find((e) => e.textContent?.trim() === 'Connect Search Console')!
        return t.getBoundingClientRect().top - head
      })
      expect(gap).toBeGreaterThanOrEqual(0)
    })
  })
}
