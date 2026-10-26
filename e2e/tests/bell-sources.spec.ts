// A busy spell in the bell is drawn with its source's own mark (Facebook, Google...), the kind as a badge on its corner,
// one short line of facts without the source's name (the mark says it; the row's label has it), and the footer is one quiet row.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the bell')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

for (const width of [1280, 390]) {
  test(`the bell draws a surge by its source's mark, ${width}px`, async ({ page }) => {
    const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString().slice(0, 16)
    await page.route(/\/moments\?/, (r) =>
      r.fulfill({
        json: {
          moments: [
            { t: iso(1), kind: 'surge', factor: 1.8, referrer: 'l.facebook.com', visitors: 38 },
            { t: iso(5), kind: 'spike', factor: 3.2, referrer: 'www.google.al', visitors: 120 },
          ],
        },
      }),
    )
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
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
