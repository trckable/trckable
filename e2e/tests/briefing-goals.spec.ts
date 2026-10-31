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
    // The rows say the number and its usual: no second line repeats them under the rows.
    await expect(card.locator('.ic-goal').first()).toContainText('usually')
    await expect(card).not.toContainText('in this period · usually')
    await expect(card.getByRole('button', { name: 'Alert me next time' })).toBeVisible()
    await expect(card.locator('.ic-goal')).toHaveCount(2)
  })
}

// The goals as small cards under the Briefing's story, and the Goals button before Explore in the header.
const cardsOn = async (page: Page, width: number, path = 'view=briefing&period=30d') => {
  await withGoals(page)
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?${path}&v=`)
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test('the Briefing shows each goal as a card with its count and change, and a click opens it in Explore', async ({ page }) => {
  await cardsOn(page, 1440)
  const cards = page.locator('[data-goal-cards] [data-goal-card]')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toContainText('672')
  await expect(cards.first()).toContainText('Form submissions')
  await expect(cards.first()).toContainText('48%')
  await expect(cards.last()).toContainText('Outbound clicks')
  await cards.first().click()
  await expect(page).toHaveURL(/x=funnels/)
  await expect(page.locator('#xp.on')).toBeVisible()
})

for (const width of [360, 390, 768, 1440, 1920]) {
  test(`the cards and the Goals button fit, ${width}px`, async ({ page }) => {
    await cardsOn(page, width)
    await expect(page.locator('[data-goal-card]')).toHaveCount(2)
    await expect(page.locator('#goalsBtn')).toBeVisible()
    expect(await noOverflow(page)).toBe(true)
    await page.locator('#goalsBtn').click()
    await expect(page.getByRole('dialog', { name: 'Goals and funnels' })).toBeVisible()
    expect(await noOverflow(page)).toBe(true)
  })
}

for (const view of ['briefing', 'live']) {
  test(`the Goals menu opens on ${view}, lists the goals, closes on Escape and opens Track a goal`, async ({ page }) => {
    await cardsOn(page, 1440, `view=${view}`)
    const menu = page.getByRole('dialog', { name: 'Goals and funnels' })
    await page.locator('#goalsBtn').click()
    await expect(menu).toBeVisible()
    await expect(menu).toContainText('Form submissions')
    await expect(menu).toContainText('672')
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await page.locator('#goalsBtn').click()
    await menu.getByRole('button', { name: 'Track a goal' }).click()
    await expect(page.getByRole('dialog', { name: 'Add goals' })).toBeVisible()
  })
}

test('with no goals the Briefing offers to track the first one', async ({ page }) => {
  await page.route(REPORT, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    body.current = { ...body.current, goals: [] }
    body.previous = { ...body.previous, goals: [] }
    await route.fulfill({ response: res, json: body })
  })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
  const row = page.locator('[data-goal-cards-empty]')
  await expect(row).toContainText('Track your first goal')
  await row.click()
  await expect(page.getByRole('dialog', { name: 'Add goals' })).toBeVisible()
})

test('a viewer sees the cards but is offered nothing to add', async ({ page }) => {
  await page.route(/\/api\/v1\/me(\?|$)/, async (route) => {
    const me = await (await route.fetch()).json()
    await route.fulfill({ json: { ...me, role: 'viewer' } })
  })
  await cardsOn(page, 1440)
  await expect(page.locator('[data-goal-card]')).toHaveCount(2)
  await page.locator('#goalsBtn').click()
  const menu = page.getByRole('dialog', { name: 'Goals and funnels' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Track a goal' })).toHaveCount(0)
  await expect(menu.getByRole('button', { name: 'See all' })).toBeVisible()
})

/** The site's one saved funnel (two steps), and what it counted in each period: 100 in and 30 through now, 100 and 20 before. */
async function withFunnel(page: Page) {
  await page.route(/\/api\/v1\/sites\/[^/]+\/funnels$/, (route) => route.fulfill({ json: { funnels: [{ id: 'f1', name: 'Signup path', steps: [{ kind: 'page', value: '/' }, { kind: 'goal', value: 'form_submit' }] }], max: 5 } }))
  let reads = 0
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\/funnel/, (route) => {
    const through = reads++ % 2 === 0 ? 30 : 20 // this period is read first, the one before second
    return route.fulfill({ json: { steps: [{ kind: 'page', value: '/', visitors: 100, rate: 1, of_total: 1, median_s: 0, dropped: 0 }, { kind: 'goal', value: 'form_submit', visitors: through, rate: through / 100, of_total: through / 100, median_s: 0, dropped: 0 }] } })
  })
}

test('the first saved funnel is the last card, with the share who get through', async ({ page }) => {
  await withFunnel(page)
  await cardsOn(page, 1440)
  const cards = page.locator('[data-goal-cards] [data-goal-card]')
  await expect(cards).toHaveCount(3)
  const last = cards.last()
  await expect(last).toHaveAttribute('data-goal-card', 'funnel')
  await expect(last).toContainText('Signup path')
  await expect(last).toContainText('30%')
  await expect(last).toContainText('50%') // up from 20%
})
