// A day of goals is one bell card: what stands out first and why, what was as usual after; a tap on a goal tells each time it
// happened, and Open in Goals leads to that goal's own page.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'
import { mockFeed, siteIdOf } from './bell-feed-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the bell')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const ago = (m: number) => Math.floor(Date.now() / 1000) - m * 60

test('the goals card tells what stands out, a goal’s times, and leads to the goal’s page', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const site = await siteIdOf(page, STEADY_DOMAIN)
  const day = new Date().toLocaleDateString('en-CA')
  const goals = [
    { goal: 'scroll', name: 'Scroll', count: 5, last: ago(5), out: true, why: 'times', factor: 5, usual: 1 },
    { goal: 'buy_click', name: 'Buy click', count: 1, last: ago(40), usual: 1 },
  ]
  await mockFeed(page, () => [{ id: `goal:${site}:${day}:2`, kind: 'goal', site, at: ago(5), day, count: 6, goal: 'scroll', goals }])
  // The goal's own read: the site has no such goals, the answer is the one a site that had them would give.
  const detail = (goal: (typeof goals)[number]) => ({
    goal: { goal: goal.goal, name: goal.name, count: goal.count, out: !!goal.out, why: goal.why, factor: goal.factor, usual: goal.usual, spark: [goal.count] },
    events: [{ at: goal.last, path: '/planner', source: 'google.com', country: 'DE', device: 'mobile', os: 'iOS' }],
    sources: [{ source: 'google.com', count: goal.count }],
    days: 1,
    quiet: false,
  })
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\/goal\?/, (route) => {
    const goal = new URL(route.request().url()).searchParams.get('goal')
    const one = goals.find((g) => g.goal === goal)
    return one ? route.fulfill({ json: detail(one) }) : route.fulfill({ status: 404, json: { error: 'no such goal' } })
  })
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
  await page.locator('#bellBtn').click()
  const row = page.locator('.nf.k-goal')
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(row.locator('.nft b')).toHaveText(/^6 goals reached /)
  await expect(row.locator('.nft small')).toHaveText(/^1 stands out\. The rest is a normal day\./)
  await expect(row).toHaveClass(/unread/)
  await row.click()

  const card = page.locator('.gs-card')
  await expect(card).toBeVisible()
  await expect(card.locator('.gs-sec')).toHaveText(['Stands out', 'As usual'])
  await expect(card.locator('.gs-pick.out .gs-pick-why')).toHaveText('5× a usual day')
  await card.locator('.gs-pick', { hasText: 'Buy click' }).click()
  await expect(card.locator('.gs-detail-head')).toHaveText('Buy click')
  await expect(card.locator('.gs-time')).toHaveCount(1)
  await expect(card.locator('.gs-time')).toContainText('/planner')
  await expect(card.locator('.gs-why')).toHaveText('As usual.')
  await expect(card.getByRole('button', { name: 'Only tell me when it stands out' })).toBeVisible()
  await card.getByRole('button', { name: 'Open in Goals' }).click()

  await expect(page).toHaveURL(/x=goals/, { timeout: 5000 })
  await expect(page).toHaveURL(/xg=buy_click/)
  await expect(page.locator('#xp .gp-head h2')).toHaveText('Buy click')
  await expect(page.locator('#xp .gs-time')).toHaveCount(1)
  await page.locator('#xp .gp-back').click()
  await expect(page).not.toHaveURL(/xg=/)
})
