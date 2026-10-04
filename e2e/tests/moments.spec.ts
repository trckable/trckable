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

async function open(page: Page, width = 1280, domain = DOMAIN, height = 900) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height })
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

/** New traffic on a quiet site (no usual to multiply): its count is the line, the card and the figure. */
const quiet = () => ({ moments: [{ t: `${day(3)}T00:00`, kind: 'spike', visitors: 1955, referrer: 'google.com' }, { t: `${day(10)}T00:00`, kind: 'spike', factor: 3.2, visitors: 300, referrer: 'news.example' }] })

test('one number for one moment: the line, the card and the markers after the filter say the same, and a card open says one thing at a time', async ({ page }) => {
  await only(page, quiet())
  const asked: string[] = []
  page.on('request', (r) => /\/moments\?/.test(r.url()) && asked.push(r.url()))
  await open(page)
  const mark = page.getByRole('button', { name: /New traffic · 1,955 visitors · mostly from google\.com/ })
  await expect(mark).toBeVisible({ timeout: 20_000 })
  await mark.hover()
  await expect(page.getByRole('tooltip')).toContainText('1,955 visitors')
  await mark.click()
  // The filter is applied; the moments are the site's, so they were not asked again narrowed by it.
  await expect(page).toHaveURL(/[?&]f=referrer(:|%3A)google\.com/)
  const why = card(page, 'New traffic')
  await expect(why).toContainText('1,955')
  await expect(mark).toBeVisible()
  expect(asked.filter((u) => /[?&]f=/.test(u))).toEqual([])
  // One thing at a time: pointing at another marker lights it and says nothing.
  const other = page.locator('.moment-mark:not(.on)').first()
  await other.hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(why).toContainText('1,955')
  // The card is docked in the corner, over nothing the markers need; the chart tints the day it is about.
  const box = (await why.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 84)
  await expect(page.locator('.moment-day')).toHaveCount(1)
  // When it happened in plain sans, the date in a tooltip, nothing underlined; the header is not selectable.
  const when = why.locator('.side-when')
  await expect(when).toHaveText('3 days ago')
  expect(await when.evaluate((e) => getComputedStyle(e).borderBottomWidth)).toBe('0px')
  expect(await when.evaluate((e) => getComputedStyle(e).fontFamily.toLowerCase())).not.toContain('mono')
  expect(await why.locator('.side-kind').evaluate((e) => getComputedStyle(e).userSelect)).toBe('none')
})

test('markers sit on a lane above the plot, one a day, none touching another', async ({ page }) => {
  await given(page)
  await open(page)
  const marks = page.locator('.moment-mark')
  await expect(marks.first()).toBeVisible({ timeout: 20_000 })
  const boxes = await marks.evaluateAll((all) => all.map((e) => e.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number }))
  const line = (await page.locator('.chart-wrap .chart-line').first().boundingBox())!
  for (const b of boxes) expect(b.y + b.height).toBeLessThanOrEqual(line.y + 0.5)
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) expect(boxes[a].x + boxes[a].width <= boxes[b].x || boxes[b].x + boxes[b].width <= boxes[a].x).toBe(true)
  const days = (await marks.evaluateAll((all) => all.map((e) => (e.getAttribute('aria-label') ?? '').split(':')[0])))
  expect(new Set(days).size).toBe(days.length)
  // The count of a cluster is inside its marker.
  for (const n of await page.locator('.moment-n').all()) {
    const [m, c] = await Promise.all([n.locator('xpath=..').boundingBox(), n.boundingBox()])
    expect(c!.x).toBeGreaterThanOrEqual(m!.x)
    expect(c!.x + c!.width).toBeLessThanOrEqual(m!.x + m!.width)
  }
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

/** The marker "See it" lights is lit for a couple of seconds, and a slow machine can be late for that: watch for it
 *  from before the click, so that it counts when it was lit, not only when it is looked at. */
async function watchLit(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __lit: boolean }
    w.__lit = false
    const look = () => {
      if (document.querySelector('.moment-mark.hit')) w.__lit = true
    }
    new MutationObserver(look).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
    look()
  })
}
const lit = (page: Page) => expect.poll(() => page.evaluate(() => (window as unknown as { __lit: boolean }).__lit), { timeout: 10_000 }).toBe(true)

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
    await watchLit(page)
    await today.first().getByRole('button', { name: kind.button }).click()
    await expect(page).toHaveURL(kind.url)
    await expect(today).toHaveCount(0)
    await expect(toast(page)).toContainText(kind.said)
    await expect(page.locator('.overview-chart')).toBeInViewport()
    // The marker is lit for a moment (it has a day on the chart).
    await lit(page)
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
  await watchLit(page)
  await again.getByRole('button', { name: 'Filter source' }).click()
  await expect(page).toHaveURL(url)
  await expect(again).toHaveCount(0)
  await expect(toast(page)).toContainText('Showing linkedin.com')
  await expect(page.locator('.overview-chart')).toBeInViewport()
  await lit(page)
})

test('with nothing to say, a new site gets one first-week card, and not another that day', async ({ page }) => {
  await given(page, 'quiet')
  await open(page)
  // On the first day with traffic, the first card is about your own visits.
  const own = card(page, 'Your visits')
  await expect(own).toBeVisible({ timeout: 20_000 })
  await expect(own).toContainText('Exclude your own visits?')
  await shoot(page, 'first-week')
  await own.getByRole('button', { name: 'Close' }).click()
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
  // Markers that landed together carry a count, and it is text: 12 px at the least, like all of it.
  const counts = page.locator('.moment-n')
  expect(await counts.count()).toBeGreaterThan(0)
  expect(await counts.evaluateAll((all) => Math.min(...all.map((e) => parseFloat(getComputedStyle(e).fontSize))))).toBeGreaterThanOrEqual(12)
  await shoot(page, 'chart-markers')
  await page.getByRole('button', { name: /4\.2× the usual/ }).click()
  const why = card(page, 'Traffic spike')
  await expect(why).toBeVisible()
  const box = await why.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await shoot(page, 'marker-card')
})

/** Eight moments on one day: three milestones, a spike, a sale, an AI assistant and two new referrers. */
const crowd = () => ({
  moments: [
    { t: `${day(5)}T00:00`, kind: 'spike', factor: 4.2, visitors: 816, referrer: 'news.example' },
    { t: `${day(5)}T00:00`, kind: 'sale', count: 3, amount: 14700, channel: 'Email' },
    { t: `${day(5)}T00:00`, kind: 'milestone', family: 'visitors', value: 100, step: '100' },
    { t: `${day(5)}T00:00`, kind: 'milestone', family: 'countries', value: 10, step: '10' },
    { t: `${day(5)}T00:00`, kind: 'milestone', family: 'pageviews', value: 1000, step: '1000' },
    { t: `${day(5)}T00:00`, kind: 'ai', bot: 'ChatGPT' },
  ],
  insights: [
    { kind: 'new_referrer', dim: 'referrer', value: 'google.com', now: 6204, since: day(5) },
    { kind: 'new_referrer', dim: 'referrer', value: 'linkedin.com', now: 463, since: day(5) },
  ],
})

test('at 390 px a cluster of eight is a short card: three lines, "+N more" in place, milestones in one row, one Share', async ({ page }) => {
  await only(page, crowd())
  await open(page, 390, DOMAIN, 844)
  const mark = page.locator('.moment-mark', { has: page.locator('.moment-n') })
  await expect(mark).toBeVisible({ timeout: 20_000 })
  await expect(mark.locator('.moment-n')).toHaveText('8')
  await mark.click()
  const why = card(page, 'Traffic spike')
  await expect(why).toBeVisible()
  // Three rows, then "+2 more"; the milestones are one row.
  const rows = why.locator('.why-more > li > button:not(.why-all)')
  await expect(rows).toHaveCount(3)
  await expect(why.getByRole('button', { name: '3 milestones' })).toBeVisible()
  await expect(why.getByRole('button', { name: '+2 more' })).toBeVisible()
  await expect(why.getByRole('button', { name: 'Share' })).toHaveCount(1)
  const fits = async () => {
    const box = (await why.boundingBox())!
    expect(box.height).toBeLessThanOrEqual(844 * 0.6 + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
  }
  await fits()
  await shoot(page, 'cluster-collapsed')
  // "+N more" opens the rest where it is; the milestones open on tap.
  await why.getByRole('button', { name: '+2 more' }).click()
  await expect(why.getByRole('button', { name: '+2 more' })).toHaveCount(0)
  await expect(rows).toHaveCount(5)
  await why.getByRole('button', { name: '3 milestones' }).click()
  await expect(why.locator('.why-group ul button')).toHaveCount(3)
  await fits()
  // Each line is there once.
  const lines = await why.locator('.why-more button').allInnerTexts()
  expect(new Set(lines).size).toBe(lines.length)
  await shoot(page, 'cluster-open')
  // A milestone picked becomes the card, with its one Share.
  await why.locator('.why-group ul button').first().click()
  const milestone = card(page, 'Milestone')
  await expect(milestone).toBeVisible()
  await expect(milestone.getByRole('button', { name: 'Share' })).toHaveCount(1)
  await expect(page.getByRole('complementary')).toHaveCount(1)
})
