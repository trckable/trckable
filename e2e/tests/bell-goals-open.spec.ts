// A day of several goals is one bell row; a tap on it lists each goal with its count and when it was last reached, and a
// tap on one opens Explore narrowed to that goal.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'
import { mockFeed, siteIdOf } from './bell-feed-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the bell')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

test('the goals row opens into its goals, and one goal opens Explore on it', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const site = await siteIdOf(page, STEADY_DOMAIN)
  const ago = (m: number) => Math.floor(Date.now() / 1000) - m * 60
  const day = new Date().toLocaleDateString('en-CA')
  await mockFeed(page, () => [
    {
      id: `goal:${site}:${day}:2`,
      kind: 'goal',
      site,
      at: ago(5),
      count: 6,
      goal: 'scroll',
      goals: [
        { goal: 'scroll', name: 'Scroll', count: 5, last: ago(5) },
        { goal: 'buy_click', name: 'Buy click', count: 1, last: ago(40) },
      ],
    },
  ])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
  await page.locator('#bellBtn').click()
  const row = page.locator('.nf.k-goal')
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(row.locator('.nft b')).toHaveText('Goals')
  await expect(row.locator('.nft small')).toHaveText(/^5 Scroll · 1 Buy click/)
  const parts = page.locator('.nfp .nfn')
  await expect(parts).toHaveCount(0)
  await expect(row).toHaveClass(/unread/)
  await row.click()
  await expect(row).toHaveAttribute('aria-expanded', 'true')
  await expect(row).not.toHaveClass(/unread/) // opening the row reads it
  await expect(parts).toHaveCount(2)
  await expect(parts.nth(0)).toHaveText(/^5 Scroll · \d\d:\d\d$/)
  await expect(parts.nth(1)).toHaveText(/^1 Buy click · \d\d:\d\d$/)
  await parts.nth(1).click()
  await expect(page).toHaveURL(/xf=goal(%3A|:)buy_click/, { timeout: 5000 })
})
