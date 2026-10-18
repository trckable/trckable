// A site with no verified install is one setup screen: the compact install, a live line that looks for the first visit,
// "Not verified" in the header, the setup ring with Install first and the rest locked, and no Live, Briefing or Explore.
// A first visit turns the line green and Live opens by itself.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { newSite, visit } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the page is the same')

test('before the first visit: the setup screen, Not verified, a locked ring, no Live or Briefing; a visit opens Live', async ({ page }) => {
  test.slow()
  const site = await newSite(page, 'fresh', false)
  // An empty v is the address with no view: the suite would otherwise send it to Explore.
  await page.goto(`${API}/${site.domain}?v=`)
  const screen = page.getByRole('region', { name: 'Waiting for the first visit' })
  await expect(screen.locator('.setup-title')).toContainText(`Add trckable to ${site.domain}`, { timeout: 20_000 })
  // The install is the compact one: tabs, the code with this site's id and a Copy button inside it, cookieless, the AI prompt.
  await expect(screen.getByRole('tablist', { name: 'How to install' })).toBeVisible()
  await expect(screen.locator('pre.code').first()).toContainText(`data-site="${site.id}"`)
  await expect(screen.locator('.code-corner').getByRole('button', { name: 'Copy the code' })).toBeVisible()
  await expect(screen.getByRole('switch', { name: 'Cookieless' })).toBeVisible()
  await expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeVisible()
  // Help is behind a small link, not shown up front.
  await expect(screen.getByRole('link', { name: 'Support' })).toBeHidden()
  // The header: amber Not verified, no Live | Briefing, no Explore, no phone bar.
  await expect(page.locator('#siteBtn')).toContainText('Not verified')
  await expect(page.locator('#siteBtn .mk-dot')).toHaveCount(0)
  await expect(page.locator('#views')).toHaveCount(0)
  await expect(page.locator('.exb')).toHaveCount(0)
  await expect(page.locator('nav.tabbar')).toHaveCount(0)
  // No empty numbers on the page.
  await expect(page.locator('.hero, .kcs')).toHaveCount(0)
  // The ring: Install is the step to do, the ones after it wait.
  await page.locator('.ringb').click()
  await expect(page.locator('.setupmenu .snext')).toContainText('Install', { timeout: 15_000 })
  await expect(page.locator('.setupmenu .sprow.locked').first()).toBeVisible()
  await page.keyboard.press('Escape')
  // One card says where it stands. The server cannot reach the suite's site: it says so, and never "found".
  const status = screen.locator('.setup-status')
  await expect(status.locator('h2')).toContainText(/Waiting for the first visit|Can’t reach/, { timeout: 20_000 })
  await expect(status).toContainText('last check', { timeout: 20_000 })
  await status.getByRole('button', { name: /Check (now|again)/ }).click()
  await status.locator('summary').click()
  await expect(screen.getByRole('link', { name: 'Support' })).toBeVisible()
  // A real pageview: the line turns green, then Live opens with no reload.
  await visit(page.request, site, '/first')
  await expect(screen.locator('.setup-status.ok')).toContainText('First visit received', { timeout: 30_000 })
  await expect(page.locator('#siteBtn')).not.toContainText('Not verified')
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('#views')).toBeVisible()
  await expect(page.locator('.setup-title')).toHaveCount(0)
})

for (const size of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test(`before the first visit, on a ${size.width}x${size.height} phone, the setup screen does not scroll sideways`, async ({ page }) => {
    test.slow()
    await page.setViewportSize(size)
    const site = await newSite(page, 'freshfit', false)
    await page.goto(`${API}/${site.domain}?v=`)
    await expect(page.locator('.setup-title')).toContainText(site.domain, { timeout: 20_000 })
    const [width, inner] = await page.evaluate(() => [document.scrollingElement!.scrollWidth, window.innerWidth])
    expect(width).toBeLessThanOrEqual(inner)
    await expect(page.locator('nav.tabbar')).toHaveCount(0)
  })
}
