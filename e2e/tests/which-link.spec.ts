// "Which link worked?" on the story: the best tagged link of the period, one runner-up, one button that
// shows that link's visitors. It is there only when it has something to say, never counts the machine
// the site is built on as a link, and the old Your links card under the cards is gone. The links read
// is faked through the API route (the server's own query is covered by its Go tests).
// Pictures for the review: POLISH_SHOTS=<folder>.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const NOW = Math.floor(Date.now() / 1000)
const link = (o: Record<string, unknown>) => ({ dim: 'referrer', value: '', visitors: 0, goals: 0, last: NOW - 7200, spark: Array.from({ length: 30 }, (_, i) => (i % 5) + 1), ...o })

const read = (page: Page, links: unknown[], goals = true) => page.route('**/api/v1/sites/*/report/links*', (r) => r.fulfill({ json: { links, goals } }))

const open = async (page: Page, width = 1440) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('which-link'), url: API }])
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?v=story&period=7d`)
  await expect(page.locator('.sv-answers')).toBeVisible({ timeout: 30_000 })
}
const card = (page: Page) => page.locator('.sv-answer', { has: page.getByText('Which link worked?') })

test('the best link and one runner-up, after Which source pays?, and the button filters to it', async ({ page }) => {
  await read(page, [link({ value: 'betalist', visitors: 40 }), link({ value: 'producthunt', visitors: 120, goals: 6 }), link({ value: 'localhost', visitors: 900, goals: 30 })])
  await open(page)
  await expect(card(page)).toBeVisible({ timeout: 30_000 })
  await expect(card(page)).toContainText('Your producthunt link brought 120 visitors and 6 sign-ups. betalist brought 40, none signed up.')
  await expect(card(page).locator('.sv-big')).toHaveText('6')
  await expect(card(page)).toContainText('5%')
  // Same anatomy as its neighbours, and it follows Which source pays?.
  const names = await page.locator('.sv-answer .kit-title, .sv-answer h3').allInnerTexts()
  expect(names.indexOf('Which link worked?')).toBe(names.indexOf('Which source pays?') + 1)
  // The machine's own address is never a link.
  await expect(card(page)).not.toContainText('localhost')
  if (SHOTS) {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        await card(page).scrollIntoViewIfNeeded()
        await page.locator('.sv-cards').screenshot({ path: `${SHOTS}/which-link-${width}-${scheme}.png` })
      }
    }
  }
  await card(page).getByRole('button', { name: /See producthunt’s visitors|See producthunt's visitors/ }).click()
  await expect(page).toHaveURL(/f=referrer(%3A|:)producthunt/)
  await expect(page).toHaveURL(/v=explore/)
})

test('with visitors only (no goal counted) it tells visitors', async ({ page }) => {
  await read(page, [link({ dim: 'source', value: 'newsletter', visitors: 30 }), link({ value: 'friend', visitors: 7 })], false)
  await open(page)
  await expect(card(page)).toContainText('Your newsletter link brought 30 visitors. friend brought 7.', { timeout: 30_000 })
  await expect(card(page).locator('.sv-big')).toHaveText('30')
})

test('with nothing to say there is no card, and no empty state', async ({ page }) => {
  await read(page, [link({ value: 'friend', visitors: 7 }), link({ value: 'localhost', visitors: 500, goals: 12 }), link({ value: '127.0.0.1', visitors: 300 })])
  await open(page)
  await page.waitForTimeout(3000) // past the quiet moment the card waits for
  await expect(card(page)).toHaveCount(0)
  await expect(page.locator('.sv-answer')).toHaveCount(5)
})

test('the old Your links card is gone from the dashboard, the page stays in the menu', async ({ page }) => {
  await read(page, [link({ value: 'producthunt', visitors: 120, goals: 6 })])
  await open(page)
  await expect(card(page)).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(500)
  await expect(page.locator('section.yc, .yc-mark, .yc-hint')).toHaveCount(0)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Your links' })).toBeVisible()
})

test('on a phone the card is one of the stacked answers', async ({ page }) => {
  await read(page, [link({ value: 'producthunt', visitors: 120, goals: 6 })])
  await open(page, 390)
  await expect(card(page)).toBeVisible({ timeout: 30_000 })
  const b = (await card(page).boundingBox())!
  expect(b.width).toBeGreaterThan(330)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

// Two columns on a desktop and a tablet, one on a phone; an odd last card spans the row.
const columns = (page: Page) =>
  page.locator('.sv-answer').evaluateAll((els) => {
    const rects = els.map((e) => e.getBoundingClientRect())
    return { lefts: new Set(rects.map((r) => Math.round(r.left))).size, last: rects[rects.length - 1].width, first: rects[0].width }
  })

test('the answers sit in two columns, one on a phone, and a hidden card leaves no hole', async ({ page }) => {
  await read(page, [link({ value: 'producthunt', visitors: 120, goals: 6 })])
  await open(page)
  await expect(page.locator('.sv-answer')).toHaveCount(6, { timeout: 30_000 })
  await expect.poll(async () => (await columns(page)).lefts).toBe(2)
  await page.setViewportSize({ width: 800, height: 900 })
  await expect.poll(async () => (await columns(page)).lefts).toBe(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => (await columns(page)).lefts).toBe(1)

  await page.unroute('**/api/v1/sites/*/report/links*')
  await read(page, [link({ value: 'friend', visitors: 7 })])
  await open(page)
  await expect(page.locator('.sv-answer')).toHaveCount(5, { timeout: 30_000 })
  await page.waitForTimeout(3000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect.poll(async () => { const c = await columns(page); return c.last / c.first }).toBeGreaterThan(1.8) // the fifth spans both columns
})
