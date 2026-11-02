// A busy spell in the bell is drawn with its source's own mark (Facebook, Google...), the kind as a badge on its corner,
// one short line of facts without the source's name (the mark says it; the row's label has it), and the footer is one quiet row.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'
import { mockFeed, siteIdOf } from './bell-feed-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the bell')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

for (const width of [1280, 390]) {
  test(`the bell draws a surge by its source's mark, ${width}px`, async ({ page }) => {
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    const site = await siteIdOf(page, STEADY_DOMAIN)
    const ago = (h: number) => Math.floor(Date.now() / 1000) - h * 3600
    await mockFeed(page, () => [
      { id: 'busy:surge:s1', kind: 'busy', what: 'surge', site, at: ago(1), factor: 1.8, source: 'l.facebook.com', visitors: 38 },
      { id: 'busy:spike:s1', kind: 'busy', what: 'spike', site, at: ago(5), factor: 3.2, source: 'www.google.al', visitors: 120 },
    ])
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
    await page.waitForTimeout(4000)
    await page.locator('#bellBtn').click()
    const fb = page.locator('.nf', { has: page.getByRole('img', { name: 'Facebook' }) })
    await expect(fb).toBeVisible({ timeout: 15_000 })
    await expect(fb.locator('.nft b')).toHaveText(`${STEADY_DOMAIN} is busy`)
    await expect(fb.locator('.nft small')).toHaveText(/^38 online · 1\.8× usual · \d\d:\d\d$/)
    await expect(fb).not.toContainText('Facebook') // the mark says it
    await expect(fb).toHaveAttribute('aria-label', /Facebook/)
    await expect(fb.locator('.nfb.up')).toBeVisible()
    await expect(page.locator('.nf', { has: page.getByRole('img', { name: 'Google' }) })).toBeVisible()
    await expect(page.locator('.nff button')).toHaveCount(1) // no archive here: just the alert settings
  })
}
