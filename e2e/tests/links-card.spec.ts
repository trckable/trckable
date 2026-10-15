// The Your links card on the dashboard: the three busiest tagged links, a tap
// filters the dashboard to one, "All links" opens the page; with no tagged visit
// a slim sample line that can be put away. The links read is faked through the
// API route; the card, the tap and the dismissal are the real dashboard.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
// The card is asked for when it is about to be seen: scroll to the foot of the page first.
const down = (page: Page) => page.locator('.yc-mark, section.yc, section.yc-hint').first().scrollIntoViewIfNeeded()
const NOW = Math.floor(Date.now() / 1000)
const link = (o: Record<string, unknown>) => ({ dim: 'referrer', value: '', visitors: 0, goals: 0, last: NOW - 7200, spark: Array(30).fill(0), ...o })

test('three links with their bars, a tap filters, All links opens the page', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('links-card'), url: API }])
  await page.route('**/api/v1/sites/*/report/links*', (r) =>
    r.fulfill({
      json: {
        goals: true,
        links: [
          link({ value: 'trustmrr.com', visitors: 412, goals: 18 }),
          link({ dim: 'source', value: 'newsletter', visitors: 96, goals: 3 }),
          link({ value: 'friend', visitors: 7 }),
          link({ value: 'fourth', visitors: 2 }),
        ],
      },
    }),
  )
  await page.goto(`${API}/${HISTORY_DOMAIN}?period=7d`)
  const card = page.locator('section.yc')
  await down(page)
  await expect(card.locator('.yc-row')).toHaveCount(3, { timeout: 30_000 })
  await expect(card.locator('.yc-row').nth(0)).toContainText('trustmrr.com')
  await expect(card.locator('.yc-row').nth(0)).toContainText('412')
  if (SHOTS) {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        await card.scrollIntoViewIfNeeded()
        await card.screenshot({ path: `${SHOTS}/links-card-${width}-${scheme}.png` })
      }
    }
  }
  await card.locator('.yc-row').nth(1).click()
  await expect(page).toHaveURL(/f=source(%3A|:)newsletter/)
  await page.goBack()
  await down(page)
  await page.getByRole('button', { name: /^All links/ }).click()
  await expect(page).toHaveURL(new RegExp(`/${HISTORY_DOMAIN.replace('.', '\\.')}/links`))
})

test('no tagged visit: a slim sample line, and it can be put away', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('links-card'), url: API }])
  await page.route('**/api/v1/sites/*/report/links*', (r) => r.fulfill({ json: { links: [], goals: false } }))
  await page.goto(`${API}/${HISTORY_DOMAIN}?period=7d`)
  const hint = page.locator('section.yc-hint')
  await down(page)
  await expect(hint.locator('code')).toHaveText(`${HISTORY_DOMAIN}/?ref=newsletter`, { timeout: 30_000 })
  if (SHOTS) {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        await hint.screenshot({ path: `${SHOTS}/links-hint-${width}-${scheme}.png` })
      }
    }
  }
  await hint.getByRole('button', { name: 'Hide this' }).click()
  await expect(hint).toHaveCount(0)
  await page.reload()
  await page.locator('.overview').waitFor({ timeout: 30_000 })
  // Nothing is left on the page to scroll to once the hint is put away (the
  // marker goes as soon as the answer is in), so go to the foot of the page.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(1500)
  await expect(page.locator('section.yc-hint')).toHaveCount(0)
})
