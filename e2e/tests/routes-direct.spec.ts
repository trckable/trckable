// Every address of the dashboard answers when it is loaded directly (a refresh, a bookmark, a link from an email), for a
// site whose name has dots in it: the server answers the page, and the page shows the route, never a not-found.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const D = HISTORY_DOMAIN
// path, and whether the address must stay as typed (mentions only exist for a site that has them: it may land on the dashboard)
const ROUTES: [string, boolean][] = [
  [`/${D}`, true],
  [`/${D}?view=briefing`, true],
  [`/${D}?view=live`, true],
  [`/${D}?v=explore`, true],
  [`/${D}/incidents`, true],
  [`/${D}/incidents?period=30d`, true],
  [`/${D}/links`, true],
  [`/${D}/mentions`, false],
  ['/sites', true],
]

for (const [route, stays] of ROUTES) {
  test(`loading ${route} directly shows the page, not a not-found`, async ({ page }) => {
    await page.context().addCookies([{ name: 'trckable_session', value: await session('routes-direct'), url: API }])
    const res = await page.goto(API + route)
    expect(res?.status()).toBe(200)
    expect(res?.headers()['content-type']).toContain('text/html')
    await expect(page.locator('.hd').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('body')).not.toContainText(/not found/i)
    if (stays) expect(new URL(page.url()).pathname).toBe(new URL(API + route).pathname)
  })
}
