// The first visit lands while the page is open: the ring and its panel say the install is done, with no reload
// (the checklist is read again once, and the server no longer reuses an empty page count).
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { newSite, visit } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the page is the same')

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`${size.width}: a first visit flips Install to done and the ring counts it, without a reload`, async ({ page }) => {
    test.slow()
    await page.setViewportSize(size)
    const site = await newSite(page, 'setuplive', false)
    await page.goto(`${API}/${site.domain}?v=`)
    const ring = page.locator('.ringb')
    await expect(ring).toBeVisible({ timeout: 20_000 })
    await expect(ring).toHaveAttribute('aria-label', /Setup: 0 of/)
    await ring.click()
    await expect(page.locator('.setupmenu .snext')).toContainText('Install', { timeout: 15_000 })
    await page.keyboard.press('Escape')
    const reads: string[] = []
    page.on('request', (r) => r.method() === 'GET' && /\/setup$/.test(new URL(r.url()).pathname) && reads.push(r.url()))
    await visit(page.request, site, '/first')
    await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(ring).not.toHaveAttribute('aria-label', /Setup: 0 of/, { timeout: 20_000 })
    await ring.click()
    await expect(page.locator('.setupmenu.on')).toBeVisible()
    await expect(page.locator('.setupmenu .snext')).not.toContainText('Install')
    await expect(page.locator('.setupmenu')).not.toContainText('Waiting for the first visit')
    // One look for the visit and none stormed.
    expect(reads.length).toBeLessThanOrEqual(3)
  })
}
