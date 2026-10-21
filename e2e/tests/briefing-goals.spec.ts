// The goals card of the Briefing: the goal by its human name, the change in percent in the title, the number with its
// usual range under it, one row per goal, and one action. Chromium only (a layout).
import { expect, test, type Page } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const REPORT = /\/api\/v1\/sites\/[^/]+\/report\?/

/** The report as the server gives it, with two goals: both above what they were in the period before, the first by more. */
async function withGoals(page: Page) {
  await page.route(REPORT, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    body.current = { ...body.current, goals: [{ value: 'form_submit', visitors: 672 }, { value: 'outbound_click', visitors: 140 }] }
    body.previous = { ...body.previous, goals: [{ value: 'form_submit', visitors: 455 }, { value: 'outbound_click', visitors: 100 }] }
    await route.fulfill({ response: res, json: body })
  })
}

for (const width of [1440, 390]) {
  test(`the goals card names the goal, says the change in percent and the usual range, ${width}px`, async ({ page }) => {
    await withGoals(page)
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
    const card = page.locator('[data-topic="goals"]:not(.sk)')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Form submissions up 48%')
    await expect(card).not.toContainText(/more goal|Form_submit/i)
    // A phone sees the card as a flat row that opens the detail: the rest is there once it is opened.
    if (width < 500) return
    await expect(card).toContainText('672 in this period · usually')
    await expect(card.getByRole('button', { name: 'Alert me next time' })).toBeVisible()
    await expect(card.locator('.mk-goal')).toHaveCount(2)
  })
}
