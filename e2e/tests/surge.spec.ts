// The surge card: the site is far busier than usual right now. What the server
// finds is given by the browser here (its rules are tested in Go); the card, its
// More, See it and the way it comes up in Live and in Data are real.
//   SURGE_SHOTS=/some/folder  also takes the pictures for review.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session, withoutPayments } from './session'

const SHOTS = process.env.SURGE_SHOTS
const DOMAIN = 'example.com'
const now = Math.floor(Date.now() / 1000)

const surge = {
  id: `surge_${Date.now()}`,
  started: now,
  online: 53,
  usual: 20,
  times: 2.7,
  story: { at: now, series: [18, 22, 19, 21, 20, 23, 19, 22, 40, 53, 49, 31], step: 5, start: now - 20 * 60, peak: 53, peak_at: now - 15 * 60, now: 31, mobile: 30, devices: 40, countries: [{ country: 'AL', n: 20 }, { country: 'US', n: 8 }] },
  why: { source: 'Facebook', source_dim: 'referrer', source_value: 'l.facebook.com', source_n: 34, source_usual: 2, page: '/blog/launch-post', page_n: 30, before: 20, minutes: 15 },
}

let cookie = ''
test.beforeAll(async ({ browser }) => {
  cookie = await session('surge')
  // A visit, so the site has had one (it opens in Live).
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/surge-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
})

async function open(page: Page, view: 'live' | 'data', width = 1280) {
  await withoutPayments(page)
  await page.route(/\/api\/v1\/sites\/[^/]+\/surge$/, (r) => r.fulfill({ json: { surge } }))
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`${API}/${DOMAIN}?view=${view}`)
}

const card = (page: Page) => page.getByRole('complementary', { name: 'Busy' })

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  const width = page.viewportSize()!.width
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/${name}-${width}-${scheme}.png` })
  }
}

test('the card comes up in Live and in Data, says it in numbers, and More tells the story', async ({ page }) => {
  await open(page, 'live')
  await expect(card(page)).toBeVisible({ timeout: 30_000 })
  await expect(card(page)).toContainText('53 people on your site right now, about 2.7× usual.')
  await expect(card(page)).toContainText('34 of them came from Facebook (usually about 2).')
  await expect(card(page)).not.toContainText('Peaked at')
  await shoot(page, 'surge-card')
  await card(page).getByRole('button', { name: 'More' }).click()
  await expect(card(page)).toContainText('From 20 to 53 in 15 minutes.')
  await expect(card(page)).toContainText('Looks like a link on Facebook')
  await expect(card(page)).toContainText('Peaked at 53')
  await expect(card(page)).toContainText('Top countries: Albania 20, United States 8.')
  await expect(card(page).locator('svg.side-chart')).toBeVisible()
  await shoot(page, 'surge-card-more')

  await open(page, 'data')
  await expect(card(page)).toBeVisible({ timeout: 30_000 })
})

test('See it opens today in Data filtered to the source, and the card does not come back', async ({ page }) => {
  await open(page, 'live', 390)
  await expect(card(page)).toBeVisible({ timeout: 30_000 })
  await shoot(page, 'surge-card')
  await card(page).getByRole('button', { name: 'See it' }).click()
  await expect(page).toHaveURL(/[?&]f=referrer(:|%3A)l\.facebook\.com/)
  await expect(page).toHaveURL(/[?&]period=today/)
  await expect(card(page)).toHaveCount(0)
  await page.reload()
  await page.waitForTimeout(1500)
  await expect(card(page)).toHaveCount(0)
})
