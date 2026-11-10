// Moving to another site with the bell's menu open: the page's change shuts the menu, the badge and the rows stay the same ones,
// and the bell does not ask the server again for a change of page that is not a change of team or of sites.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, BUSY_DOMAIN, STEADY_DOMAIN } from '../playwright.config'
import { mockFeed, siteIdOf } from './bell-feed-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the bell')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

test('the bell keeps its list when another site is chosen with the menu open', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const steady = await siteIdOf(page, STEADY_DOMAIN)
  const busy = await siteIdOf(page, BUSY_DOMAIN)
  const ago = (h: number) => Math.floor(Date.now() / 1000) - h * 3600
  let reads = 0
  await mockFeed(page, () => {
    reads++
    return [
      { id: 'busy:surge:s1', kind: 'busy', what: 'surge', site: steady, at: ago(1), factor: 1.8, source: 'l.facebook.com', visitors: 38 },
      { id: 'busy:surge:s2', kind: 'busy', what: 'surge', site: busy, at: ago(2), factor: 2.1, source: 'www.google.al', visitors: 50 },
    ]
  })
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
  await page.waitForTimeout(4000)
  await page.locator('#bellBtn').click()
  await expect(page.locator('.nfw')).toHaveCount(2, { timeout: 15_000 })
  const before = reads
  await page.evaluate((to) => {
    history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, `/${BUSY_DOMAIN}?view=briefing&period=30d&v=`)
  await page.waitForTimeout(1500)
  await expect(page.locator('#bellBtn')).toContainText('2')
  await page.locator('#bellBtn').click()
  await expect(page.locator('.nfw')).toHaveCount(2)
  expect(reads).toBeLessThanOrEqual(before + 1) // opening the menu may read once; the switch itself reads nothing
})
