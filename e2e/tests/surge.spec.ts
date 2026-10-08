// The surge card: the site is far busier than usual right now. What the server
// finds is given by the browser here (its rules are tested in Go); the card, its
// More, the story's See it and the way it comes up in Live and in Data are real.
//   SURGE_SHOTS=/some/folder  also takes the pictures for review.
import { expect, test, type Page } from './fixtures'
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
  story: { at: now, sources: [{ name: 'Facebook', n: 34 }, { name: 'Google', n: 6 }], pages: [{ name: '/blog/launch-post', n: 30 }], series: [18, 22, 19, 21, 20, 23, 19, 22, 40, 53, 49, 31], step: 5, start: now - 20 * 60, peak: 53, peak_at: now - 15 * 60, now: 31, mobile: 30, devices: 40, countries: [{ country: 'AL', n: 20 }, { country: 'US', n: 8 }] },
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
const story = (page: Page) => page.getByRole('dialog', { name: 'The busy moment' })

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  const width = page.viewportSize()!.width
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOTS}/${name}-${width}-${scheme}.png` })
  }
}

test('the card comes up in Live and in Data: a number, a chip, one line, one button', async ({ page }) => {
  await open(page, 'live')
  await expect(card(page)).toBeVisible({ timeout: 30_000 })
  await expect(card(page).locator('.sg-count')).toHaveText('53')
  await expect(card(page).locator('.sg-chip')).toHaveText('2.7× usual')
  await expect(card(page).locator('.sg-source')).toContainText('Mostly from Facebook')
  await expect(card(page).getByRole('button', { name: 'More' })).toBeVisible()
  await expect(card(page).getByRole('button', { name: 'See it in Data' })).toBeVisible()
  await shoot(page, 'surge-card')
  await open(page, 'data')
  await expect(card(page)).toBeVisible({ timeout: 30_000 })
})

test('the entrance, in three frames', async ({ page }) => {
  test.skip(!SHOTS, 'pictures only')
  await open(page, 'live')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.reload()
  await expect(card(page)).toBeAttached({ timeout: 30_000 })
  mkdirSync(SHOTS!, { recursive: true })
  const clip = { x: 1280 - 400, y: 900 - 520, width: 400, height: 440 }
  for (const [i, ms] of [0, 220, 700].entries()) {
    await page.waitForTimeout(ms)
    await page.screenshot({ path: `${SHOTS}/surge-entrance-${i + 1}.png`, clip })
  }
})

test('More opens the story as a dialog; Escape closes it and focus comes back', async ({ page }) => {
  await open(page, 'live')
  await expect(card(page)).toBeVisible({ timeout: 30_000 })
  const more = card(page).getByRole('button', { name: 'More' })
  await more.click()
  await expect(story(page)).toBeVisible()
  await expect(story(page)).toContainText('20 → 53 in 15 min')
  await expect(story(page)).toContainText('peak 53')
  await expect(story(page)).toContainText('now 31')
  await expect(story(page)).toContainText('Albania')
  await expect(story(page)).toContainText('/blog/launch-post')
  await expect(story(page)).toContainText('The exact post isn’t visible.')
  await expect(story(page).getByRole('img', { name: /People online in the last hour/ })).toBeVisible()
  await shoot(page, 'surge-story')
  await page.keyboard.press('Escape')
  await expect(story(page)).toHaveCount(0)
  await expect(more).toBeFocused()
})

test('on a phone the story is a sheet that fills the screen; See it in Data filters to the source', async ({ page }) => {
  await open(page, 'live', 390)
  await expect(card(page)).toBeVisible({ timeout: 30_000 })
  await shoot(page, 'surge-card')
  await card(page).getByRole('button', { name: 'More' }).click()
  await expect(story(page)).toBeVisible()
  const box = await story(page).boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(389)
  expect(box!.height).toBeGreaterThanOrEqual((await page.evaluate(() => window.innerHeight)) - 1)
  await shoot(page, 'surge-story')
  await story(page).getByRole('button', { name: 'See it in Data' }).click()
  await expect(page).toHaveURL(/[?&]f=referrer(:|%3A)l\.facebook\.com/)
  await expect(page).toHaveURL(/[?&]period=today/)
  await expect(card(page)).toHaveCount(0)
  await page.reload()
  await page.waitForTimeout(1500)
  await expect(card(page)).toHaveCount(0)
})
