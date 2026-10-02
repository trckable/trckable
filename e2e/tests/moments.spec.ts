// What the Data view says on its own: moments on the chart (at most six, the
// most important first, each a button with its own shape, a line on hover or
// focus, a click that applies its filter through the address and opens the
// card with the numbers and one action); the one thing today (Next, See it,
// put away for the day); the Revenue tile and the providers card, for an
// owner only; and a first-week card. What the server finds is given by the
// browser here (its rules are tested in Go); everything else is real.
//   MOMENTS_SHOTS=/some/folder  also takes the pictures for review.
import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API } from '../playwright.config'
import { session, withoutPayments } from './session'

const SHOTS = process.env.MOMENTS_SHOTS
const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const day = (ago: number) => new Date(Date.now() - ago * 86400_000).toISOString().slice(0, 10)

/** Twelve moments: more than a chart can carry, with one spike that has a source. */
const moments = () => [
  { t: `${day(2)}T00:00`, kind: 'spike', factor: 4.2, visitors: 816, referrer: 'news.example' },
  ...[8, 9, 11, 13, 15, 17, 19, 21].map((ago, k) => ({ t: `${day(ago)}T00:00`, kind: 'spike', factor: 3 + k / 10, visitors: 40 })),
  { t: `${day(5)}T00:00`, kind: 'milestone', family: 'visitors', value: 1000, step: '1k' },
  { t: `${day(7)}T00:00`, kind: 'ai', bot: 'ChatGPT' },
  { t: `${day(25)}T00:00`, kind: 'country', country: 'DE' },
]
const insights = () => [
  { kind: 'source_move', dim: 'channel', value: 'Search', now: 900, was: 600, change: 0.5 },
  { kind: 'conversion_drop', dim: 'entry_page', value: '/pricing', now: 1204, was: 1100, rate: 0.031, was_rate: 0.051, change: -0.4, since: day(10) },
  { kind: 'new_referrer', dim: 'referrer', value: 'linkedin.com', now: 463, since: day(4) },
]

/** The server's findings, given: all of them, none (`quiet`), or only the findings that have a day (`findings`). */
async function given(page: Page, what: 'all' | 'quiet' | 'findings' = 'all') {
  await withoutPayments(page)
  await page.route(/\/api\/v1\/sites\/[^/]+\/moments\?/, (r) => r.fulfill({ json: { bucket: 'day', moments: what === 'all' ? moments() : [] } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/insights\?/, (r) => r.fulfill({ json: { insights: what === 'quiet' ? [] : insights() } }))
}

const DOMAIN = 'example.com'

let cookie = ''
test.beforeAll(async ({ browser }) => {
  cookie = await session('moments')
  // A visit, so the site has had one (the cards wait for the first).
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/moments-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
})

async function open(page: Page, width = 1280, domain = DOMAIN) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`${API}/${domain}?view=data`)
  await expect(page.locator('.chart-wrap svg[role="img"]')).toBeVisible({ timeout: 30_000 })
}

const card = (page: Page, name: string) => page.getByRole('complementary', { name })

/** One picture of the page, both themes, at the width the page is at. */
async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  const width = page.viewportSize()!.width
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(400) // the theme changes a moment after the media does
    await page.screenshot({ path: `${SHOTS}/${name}-${width}-${scheme}.png` })
  }
}

test('markers on the chart: at most six, each a button that says what it is, and a line on focus', async ({ page }) => {
  await given(page)
  await open(page)
  const marks = page.locator('.moment-mark')
  await expect(marks.first()).toBeVisible({ timeout: 20_000 })
  // Twelve moments, six markers; a country's first visit is not one of them.
  await expect(marks).toHaveCount(6)
  // A shape inside each, a name for assistive tech, in the page's tab order.
  for (const m of await marks.all()) {
    await expect(m.locator('svg')).toHaveCount(1)
    await expect(m).toHaveAttribute('aria-label', /: .+\. Show it$/)
  }
  // The page that lost buyers matters most, and has a day of its own: it sits on the chart.
  await expect(page.getByRole('button', { name: /\/pricing converts 3\.1%, was 5\.1%/ })).toHaveCount(1)
  // Focus says it in a line, and Escape puts it away.
  await marks.first().focus()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.mouse.move(5, 5)
  await shoot(page, 'chart-markers')
})

test('a new referrer sits on the day it first sent anyone', async ({ page }) => {
  await given(page, 'findings')
  await open(page)
  const mark = page.getByRole('button', { name: /New referrer: linkedin\.com sent 463 visitors/ })
  await expect(mark).toBeVisible({ timeout: 20_000 })
  await mark.click()
  // It filters to the referrer; it has no day to pick, so the period stays whole.
  await expect(page).toHaveURL(/[?&]f=referrer(:|%3A)linkedin\.com/)
  await expect(page).not.toHaveURL(/[?&]day=/)
  // When it first sent anyone: in words, with the date as its tooltip.
  await expect(card(page, 'New referrer').locator('.side-when')).toHaveText('4 days ago')
  await expect(card(page, 'New referrer').locator('.side-when')).toHaveAttribute('title', new Date(Date.now() - 4 * 86400_000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }))
})

test('a marker applies its filter and day through the address, and opens the card with the numbers', async ({ page }) => {
  await given(page)
  await open(page)
  const spike = page.getByRole('button', { name: /4\.2× the usual · mostly from news\.example/ })
  await expect(spike).toBeVisible({ timeout: 20_000 })
  await spike.click()
  // Every view reads the address: the filter is a chip like any other, the day is the picked one.
  await expect(page).toHaveURL(/[?&]f=referrer(:|%3A)news\.example/)
  await expect(page).toHaveURL(new RegExp(`[?&]day=${day(2)}`))
  const why = card(page, 'Traffic spike')
  await expect(why).toBeVisible()
  await expect(why).toContainText('816')
  await expect(why).toContainText('visitors')
  await expect(why).toContainText('4.2×')
  await expect(why.getByText('news.example')).toBeVisible()
  await shoot(page, 'marker-card')
  // One action: Share opens the share dialog.
  await why.getByRole('button', { name: 'Share' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Put away with Escape.
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Escape')
  await expect(why).toHaveCount(0)
})

test('one thing today: the best first, ← → turn to the others, See it shows it and the card leaves, put away it stays away for the day', async ({ page }) => {
  await given(page)
  await open(page)
  const today = card(page, 'One thing today')
  await expect(today).toBeVisible({ timeout: 20_000 })
  // Where it is in the deck: dots, with the next card peeking out behind.
  await expect(today.getByRole('img', { name: '1 of 3' })).toBeVisible()
  await expect(page.locator('.side-peek')).toHaveCount(2)
  // The page that lost buyers matters most.
  await expect(today).toContainText('/pricing')
  await expect(today.getByRole('button', { name: 'Previous' })).toBeDisabled()
  await shoot(page, 'one-thing')
  await today.getByRole('button', { name: 'Next' }).click()
  await expect(today.getByRole('img', { name: '2 of 3' })).toBeVisible()
  await today.getByRole('button', { name: 'Previous' }).click()
  await expect(today.getByRole('img', { name: '1 of 3' })).toBeVisible()
  // The arrow keys turn it with focus in the card (they are the page's own for the period, otherwise).
  await today.getByRole('button', { name: 'Next' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(today.getByRole('img', { name: '2 of 3' })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(today.getByRole('img', { name: '1 of 3' })).toBeVisible()
  await today.getByRole('button', { name: 'Next' }).click()
  await today.getByRole('button', { name: /^Show / }).click()
  await expect(page).toHaveURL(/[?&]f=/)
  await expect(today).toHaveCount(0)
  // Put away: not back on a reload the same day.
  await page.reload()
  await expect(page.locator('.moment-mark').first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(500)
  await expect(today).toHaveCount(0)
})

/** The findings the server makes, only these. */
async function only(page: Page, found: { moments?: object[]; insights?: object[] }) {
  await withoutPayments(page)
  await page.route(/\/api\/v1\/sites\/[^/]+\/moments\?/, (r) => r.fulfill({ json: { bucket: 'day', moments: found.moments ?? [] } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/insights\?/, (r) => r.fulfill({ json: { insights: found.insights ?? [] } }))
}

const toast = (page: Page) => page.getByRole('status').filter({ hasText: 'Showing' })

// "See it" is never a click that seems to do nothing: whatever the kind, the card leaves, a toast says what
// is on screen (and clears it), the chart comes into view and the marker lights up.
for (const kind of [
  { name: 'a spike', found: () => ({ moments: [{ t: `${day(3)}T00:00`, kind: 'spike', factor: 6, visitors: 900, referrer: 'news.example' }] }), card: 'Traffic spike', button: /^Show /, url: /[?&]f=referrer(:|%3A)news\.example/, said: /Showing news\.example · /, lit: true },
  { name: 'a new referrer', found: () => ({ insights: [{ kind: 'new_referrer', dim: 'referrer', value: 'google.com', now: 312, since: day(3) }] }), card: 'One thing today', button: 'Filter source', url: /[?&]f=referrer(:|%3A)google\.com/, said: /Showing google\.com · /, lit: true },
  { name: 'lost buyers', found: () => ({ insights: [{ kind: 'conversion_drop', dim: 'entry_page', value: '/pricing', now: 350, was: 400, rate: 0.031, was_rate: 0.048, change: -0.35, since: day(3) }] }), card: 'One thing today', button: 'Filter page', url: /[?&]f=entry_page(:|%3A)(\/|%2F)pricing/, said: /Showing \/pricing · /, lit: true },
]) {
  test(`See it on ${kind.name}: the card leaves, the toast says what is shown, the chart is in view`, async ({ page }) => {
    await only(page, kind.found())
    await open(page)
    const today = card(page, 'One thing today').or(card(page, 'Traffic spike'))
    await expect(today.first()).toBeVisible({ timeout: 20_000 })
    await today.first().getByRole('button', { name: kind.button }).click()
    await expect(page).toHaveURL(kind.url)
    await expect(today).toHaveCount(0)
    await expect(toast(page)).toContainText(kind.said)
    await expect(page.locator('.overview-chart')).toBeInViewport()
    // The marker is lit for a moment (it has a day on the chart).
    await expect(page.locator('.moment-mark.hit').first()).toBeVisible({ timeout: 5000 })
    // Clear takes the filter off again.
    await toast(page).getByRole('button', { name: 'Clear' }).click()
    await expect(page).not.toHaveURL(/[?&]f=/)
  })
}

test('See it with everything already applied still closes the card, says what is shown and lights the marker', async ({ page }) => {
  await only(page, { insights: [{ kind: 'new_referrer', dim: 'referrer', value: 'linkedin.com', now: 463, since: day(4) }] })
  await open(page)
  const card1 = card(page, 'One thing today')
  await expect(card1).toBeVisible({ timeout: 20_000 })
  await card1.getByRole('button', { name: 'Filter source' }).click()
  await expect(page).toHaveURL(/[?&]f=referrer(:|%3A)linkedin\.com/)
  await expect(card1).toHaveCount(0)
  // The same click again, from a card that is back (a new day): the address is already what it asks for.
  const url = page.url()
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('trckable:today:')).forEach((k) => localStorage.removeItem(k)))
  await page.reload()
  await expect(page).toHaveURL(url)
  const again = card(page, 'One thing today')
  await expect(again).toBeVisible({ timeout: 20_000 })
  await again.getByRole('button', { name: 'Filter source' }).click()
  await expect(page).toHaveURL(url)
  await expect(again).toHaveCount(0)
  await expect(toast(page)).toContainText('Showing linkedin.com')
  await expect(page.locator('.overview-chart')).toBeInViewport()
  await expect(page.locator('.moment-mark.hit').first()).toBeVisible({ timeout: 5000 })
})

test('with nothing to say, a new site gets one first-week card, and not another that day', async ({ page }) => {
  await given(page, 'quiet')
  await open(page)
  const replay = card(page, 'Replay')
  await expect(replay).toBeVisible({ timeout: 20_000 })
  await expect(replay).toContainText('Replay this period')
  await shoot(page, 'first-week')
  await replay.getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await expect(page.locator('.chart-wrap svg[role="img"]')).toBeVisible()
  await page.waitForTimeout(3500)
  await expect(page.getByRole('complementary')).toHaveCount(0)
})

test('the Revenue tile: dimmed, in the key numbers, and a card of the five providers', async ({ page }) => {
  await given(page, 'quiet')
  await open(page)
  const tiles = page.getByRole('group', { name: 'Key numbers' })
  const tile = tiles.getByRole('button', { name: /^Revenue/ })
  await expect(tile).toBeVisible()
  await expect(tile).toHaveClass(/dim/)
  // The same width as the tiles beside it.
  const [t, v] = await Promise.all([tile.boundingBox(), tiles.getByRole('button', { name: /^Visitors/ }).boundingBox()])
  expect(Math.abs(t!.width - v!.width)).toBeLessThan(1)
  await tile.click()
  const providers = card(page, 'Revenue')
  await expect(providers).toBeVisible()
  for (const name of ['Stripe', 'Lemon Squeezy', 'Polar', 'Paddle', 'Dodo Payments']) await expect(providers.getByRole('button', { name: `Connect ${name}` })).toBeVisible()
  await shoot(page, 'revenue-tile')
  // A provider's link opens Settings → Payments with its connect step open.
  await providers.getByRole('button', { name: 'Connect Stripe' }).click()
  await expect(page.getByRole('dialog', { name: /^Settings for/ })).toBeVisible()
  await expect(page.getByRole('dialog').filter({ hasText: /Stripe/ }).first()).toBeVisible()
})

test('a viewer sees no Revenue tile and no first-week card', async ({ page }) => {
  const email = `moments-viewer-${Date.now()}@example.com`
  execFileSync(BIN, ['admin', 'add-user', email, '--role', 'viewer'], { input: 'moments e2e password 1\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'moments e2e password 1' }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  expect(res.ok && value).toBeTruthy()
  await given(page, 'quiet')
  await page.context().addCookies([{ name: 'trckable_session', value: value!, url: API }])
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${API}/${DOMAIN}?view=data`)
  const tiles = page.getByRole('group', { name: 'Key numbers' })
  await expect(tiles.getByRole('button', { name: /^Visitors/ })).toBeVisible({ timeout: 30_000 })
  await expect(tiles.getByRole('button', { name: /^Revenue/ })).toHaveCount(0)
  await page.waitForTimeout(3500)
  await expect(page.getByRole('complementary')).toHaveCount(0)
})

test('at 390 px the markers and their card fit the screen', async ({ page }) => {
  await given(page)
  await open(page, 390)
  const marks = page.locator('.moment-mark')
  await expect(marks.first()).toBeVisible({ timeout: 20_000 })
  expect(await marks.count()).toBeLessThanOrEqual(6)
  await shoot(page, 'chart-markers')
  await page.getByRole('button', { name: /4\.2× the usual/ }).click()
  const why = card(page, 'Traffic spike')
  await expect(why).toBeVisible()
  const box = await why.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await shoot(page, 'marker-card')
})
