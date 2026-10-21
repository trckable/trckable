// "Who changed": one card for the source, country, device or page that moved most, the others named under it with a way
// to all of it, and a card's one action with the rest behind "⋯". Chromium only (a layout).
import { expect, test, type Page } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const row = (value: string, visitors: number) => ({ value, visitors })

/** A period in which a source and a country are well above what they were in the period before. */
async function withMovers(page: Page) {
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\?/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    if (!body.current || !body.previous) return route.fulfill({ response: res, json: body })
    body.current = { ...body.current, dims: { ...body.current.dims, referrer: [row('news.ycombinator.com', 186)], country: [row('US', 5000)] } }
    body.previous = { ...body.previous, dims: { ...body.previous.dims, referrer: [row('news.ycombinator.com', 9)], country: [row('US', 500)] } }
    await route.fulfill({ response: res, json: body })
  })
}

test('one card for who changed, the rest named under it, and the card’s extras behind the ⋯', async ({ page }) => {
  await withMovers(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
  const who = page.locator('[data-topic="sources"]:not(.sk)')
  await expect(who).toBeVisible()
  await expect(page.locator('[data-topic="countries"]:not(.sk)')).toHaveCount(0)
  await expect(who).toContainText('Also changed: ')
  await expect(who.getByRole('button', { name: 'See all' })).toBeVisible()
  // One action beside Why?, and the rest behind the ⋯: Watch and Go deeper are not on the card until it is opened.
  await expect(who.locator('[data-watch]')).toBeHidden()
  await who.getByRole('button', { name: 'More' }).click()
  await expect(who.getByRole('menuitem', { name: 'Watch' })).toBeVisible()
  await who.getByRole('menuitem', { name: 'Go deeper' }).click()
  await expect(page.locator('#xp.on')).toBeVisible()
})
