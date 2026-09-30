// The header's one quiet row and the Data view's overview, against a
// trckabled with the demo data (like fullcharts, skipped unless
// TRCKABLE_A11Y_URL points at one):
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test header
// One row at every width down to 375 px; no filled button (Share is an icon in the second row); what
// left the row (Refresh, Create, Core/Full, Milestones, Export) is in the ⋯
// beside the period with its key, and the keys still work; the person's own
// things (Profile, theme, shortcuts, sign out) are the avatar's menu.
// Each tile carries its change, readable without colour; the
// chart starts at the first visit when that falls in the period, draws a
// short span by the hour, and keeps Replay as a small ▶.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')

// Signing in is rate limited per address: every browser here shares one
// session, made once by whichever worker gets there first.
async function session(): Promise<string> {
  const file = join(tmpdir(), `trckable-header-${new URL(BASE!).port}-${process.ppid}`)
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const res = await fetch(BASE + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

async function open(page: Page, query = ''): Promise<string> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: await session(), url: BASE! }])
  await page.goto(BASE + '/')
  const domain = await page.evaluate(async () => (await (await fetch('/api/v1/sites')).json()).sites[0].domain as string)
  await page.goto(`${BASE}/${domain}${query}`)
  await expect(page.locator('.overview-chart .chart-wrap svg')).toBeVisible({ timeout: 20_000 })
  return domain
}

/** After its opening animation: a box measured mid-flight is not where it lands. */
const settled = (el: Locator) => el.evaluate((n) => Promise.all(n.getAnimations().map((a) => a.finished)))

const more = (page: Page) => page.getByRole('button', { name: 'More', exact: true })
const menu = (page: Page) => page.getByRole('menu', { name: 'More' })

/** The controls in a row, each as its middle and right edge. */
const controls = (page: Page, sel: string) =>
  page.locator(sel).evaluate((h) =>
    [...h.querySelectorAll('button, a')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ mid: r.top + r.height / 2, right: r.right })),
  )

for (const width of [1440, 700, 375]) {
  test(`two quiet rows at ${width}px, nothing lost`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await open(page)
    // Row 1: who and which site, then Peek, the avatar. Row 2:
    // Live/Data, then the period and Filter, Share and ⋯ in two capsules. Each one line, inside the screen.
    for (const sel of ['.header.quiet', '.subbar']) {
      const boxes = await controls(page, sel)
      expect(boxes.length, sel).toBeGreaterThan(1)
      const mids = boxes.map((b) => b.mid)
      expect(Math.max(...mids) - Math.min(...mids), `${sel}: one line`).toBeLessThanOrEqual(8)
      expect(Math.max(...boxes.map((b) => b.right)), `${sel}: inside the screen`).toBeLessThanOrEqual(width)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'no sideways scroll').toBeLessThanOrEqual(0)

    // No filled button in either row; Share is an icon (in ⋯ on a phone);
    // Peek and Filter stay one tap away.
    await expect(page.locator('.header .btn.primary')).toHaveCount(0)
    await expect(page.locator('.subbar .btn.primary')).toHaveCount(0)
    if (width > 640) await expect(page.locator('.subbar').getByRole('button', { name: 'Share' })).toBeVisible()
    else await expect(page.locator('.subbar').getByRole('button', { name: 'Share' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Peek' })).toBeVisible()
    await expect(page.locator('.site-zone').getByRole('button', { name: /^Settings for/ })).toBeVisible()
    // Row 2 says what the numbers are. A phone has one pill for it (Live/Data,
    // the periods and Filter are in its sheet); the comparison is the
    // period's title, not a line of text.
    if (width > 640) {
      await expect(page.locator('.subbar .btn.filter')).toBeVisible()
      await expect(page.locator('.subbar').getByRole('group', { name: 'View' })).toBeVisible()
    } else {
      await expect(page.locator('.subbar .phone-pill')).toBeVisible()
    }
    await expect(page.locator('.subbar .range-vs')).toHaveCount(0)
    if (width > 640) await expect(page.getByRole('button', { name: 'Next period' })).toBeVisible()

    // What left the row is in ⋯, each with its key.
    await more(page).click()
    const items = menu(page).getByRole('menuitem')
    if (width <= 640) await expect(items.first()).toHaveText(/Share/)
    await expect(items.filter({ hasText: 'Refresh' })).toBeVisible()
    await expect(items.filter({ hasText: 'Create…' })).toContainText('A')
    await expect(items.filter({ hasText: 'Full view' })).toContainText('F')
    // The site's settings are the cog in the site card, on a phone too, not an item here.
    await expect(items.filter({ hasText: 'Site settings' })).toHaveCount(0)
    await expect(items.filter({ hasText: 'Export as CSV' })).toBeVisible()
    // Nothing of the person's is in it.
    await expect(items.filter({ hasText: /Profile|Shortcuts|Sign out/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(menu(page)).toBeHidden()
  })
}

test('the avatar menu holds the person\'s own things, by keyboard too', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page)
  const avatar = page.getByRole('button', { name: 'Account', exact: true })
  // Opened from the keyboard: a click focuses nothing in Safari, and a key is what puts focus on the first item.
  await avatar.focus()
  await page.keyboard.press('Enter')
  const account = page.getByRole('menu', { name: 'Account' })
  await expect(account.getByRole('menuitem')).toHaveText([/Profile/, /Shortcuts/, /Sign out/])
  await expect(account.getByRole('menuitemradio')).toHaveCount(3)
  await expect(account.getByRole('menuitem', { name: /Refresh|Create|Export/ })).toHaveCount(0)
  // Arrows move between items, Escape closes and hands focus back.
  await expect(account.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(account.getByRole('menuitemradio').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(account).toBeHidden()
  await expect(avatar).toBeFocused()
  // Profile opens the account window.
  await avatar.click()
  await account.getByRole('menuitem', { name: 'Profile, your account' }).click()
  await expect(page.getByRole('dialog', { name: 'Profile, your account' })).toBeVisible()
})

test('Live keeps only Live/Data on row 2, in the same place, and has no ⋯', async ({ page }) => {
  await open(page)
  const view = page.locator('.subbar').getByRole('group', { name: 'View' })
  const before = await view.boundingBox()
  await view.getByRole('button', { name: 'Live' }).click()
  await expect(page).toHaveURL(/view=live/)
  await expect(page.locator('.subbar .range-picker')).toHaveCount(0)
  await expect(more(page)).toHaveCount(0)
  expect(await view.boundingBox()).toEqual(before)
})

test('⋯ runs what left the row, and the keys still work', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page)
  // Create: from ⋯, then Escape hands focus back to ⋯.
  await more(page).click()
  await menu(page).getByRole('menuitem', { name: /Create/ }).click()
  const create = page.getByRole('menu', { name: 'Create something' })
  await expect(create).toBeVisible()
  await expect(create.getByRole('menuitem').first()).toBeFocused()
  // The picker hangs right under ⋯, aligned to its right edge, like ⋯'s own menu.
  const dots = (await more(page).boundingBox())!
  await settled(create)
  const pick = (await create.boundingBox())!
  expect(pick.y).toBeGreaterThanOrEqual(dots.y + dots.height)
  expect(pick.y - (dots.y + dots.height)).toBeLessThan(16)
  expect(Math.abs(pick.x + pick.width - (dots.x + dots.width))).toBeLessThan(12)
  await page.keyboard.press('Escape')
  await expect(create).toBeHidden()
  await expect(more(page)).toBeFocused()
  // A still opens it, F still switches the view, both ways.
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('a')
  await expect(create).toBeVisible()
  await settled(create)
  const viaKey = (await create.boundingBox())!
  const dotsNow = (await more(page).boundingBox())!
  expect(Math.abs(viaKey.x + viaKey.width - (dotsNow.x + dotsNow.width))).toBeLessThan(12)
  expect(viaKey.y).toBeGreaterThanOrEqual(dotsNow.y + dotsNow.height)
  await page.keyboard.press('Escape')
  await page.keyboard.press('f')
  await expect(page).toHaveURL(/mode=full/)
  await more(page).click()
  await menu(page).getByRole('menuitem', { name: /Core view/ }).click()
  await expect(page).not.toHaveURL(/mode=full/)
  // Refresh asks for the report again, in place.
  const again = page.waitForRequest(/\/report\?/)
  await more(page).click()
  await menu(page).getByRole('menuitem', { name: 'Refresh' }).click()
  await again
})

test('each tile carries its change, readable without colour', async ({ page }) => {
  // The demo data is 30 days old: a week has a week before it.
  await open(page, '?period=7d')
  const tiles = page.getByRole('group', { name: 'Key numbers' })
  const visitors = tiles.getByRole('button', { name: /^Visitors/ })
  await expect(visitors).toHaveAttribute('aria-pressed', 'true')
  const chip = visitors.locator('.kpi-delta')
  await expect(chip.locator('[aria-hidden]')).toHaveText(/^[\d.]+% (↑|↓)$/)
  // The words a screen reader hears name the comparison too.
  await expect(chip.locator('.sr')).toHaveText(/(up|down) [\d.]+ percent vs /)
  // The charted tile: a thin underline, no box.
  const lit = await visitors.evaluate((el) => ({ line: getComputedStyle(el, '::after').content, border: getComputedStyle(el).borderTopWidth, back: getComputedStyle(el).backgroundColor }))
  expect(lit.line).not.toBe('none')
  expect(lit.border).toBe('0px')
  expect(lit.back).toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
})

test('nothing in the period before: no change chips, not "new" on every tile', async ({ page }) => {
  await open(page, '?period=90d')
  await expect(page.getByRole('group', { name: 'Key numbers' }).locator('.kpi-delta')).toHaveCount(0)
})

test('a period that starts before the first visit: the chart starts at it', async ({ page }) => {
  // The demo data is 30 days old: 90 days start well before it.
  await open(page, '?period=90d')
  const chip = page.locator('.overview-chart .since-chip')
  await expect(chip).toHaveText(/^since [A-Z][a-z]{2} \d+$/)
  const day = (await chip.innerText()).replace('since ', '')
  const labels = page.locator('.overview-chart .chart-wrap svg text.num')
  await expect(labels.filter({ hasText: day }).first()).toBeVisible()
  await page.getByRole('button', { name: `Show since ${day}` }).click()
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=/)
  await expect(chip).toHaveCount(0)
})

test('three days or fewer are drawn by the hour', async ({ page }) => {
  const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)
  await open(page, `?from=${day(4)}&to=${day(2)}`)
  const chart = page.locator('.overview-chart .chart-wrap svg[role=img]')
  await expect(chart).toHaveAttribute('aria-label', /: 72 points,/)
})

test('Replay is a small ▶; its speed and scrubber show on hover or focus', async ({ page }) => {
  await open(page)
  const play = page.getByRole('button', { name: 'Replay this period day by day' })
  await expect(play).toBeVisible()
  const speed = page.locator('.overview-chart .replay-speed')
  const scrub = page.locator('.overview-chart .scrub.quiet')
  await page.mouse.move(5, 5)
  await expect(speed).toHaveCSS('opacity', '0')
  await expect(scrub).toHaveCSS('opacity', '0')
  await play.focus()
  await expect(speed).toHaveCSS('opacity', '1')
  await expect(scrub).toHaveCSS('opacity', '1')
  await play.click()
  await expect(page).toHaveURL(/day=\d{4}-\d{2}-\d{2}/)
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  await page.getByRole('button', { name: 'Pause replay' }).click()
})

test('Replay speeds are durations for this period, remembered, and [ ] change them while it plays', async ({ page }) => {
  await open(page)
  const trigger = page.locator('.overview-chart .speed-btn')
  await page.getByRole('button', { name: 'Replay this period day by day' }).focus()
  await trigger.click()
  const rows = page.getByRole('menuitemradio')
  await expect(rows).toHaveCount(5)
  await expect(rows.nth(0)).toContainText('Slow')
  await expect(rows.nth(4)).toContainText('Rapid')
  await expect(rows.nth(1)).toContainText(/~\d+(\.5)? s/)
  await expect(page.getByRole('menuitemradio', { name: /Normal/ })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(trigger).toContainText('Fast')
  await expect(trigger).toHaveAttribute('aria-label', /Fast, plays in ~/)
  expect(await page.evaluate(() => localStorage.getItem('tkb_replay_speed'))).toBe('fast')
  await page.getByRole('button', { name: 'Replay this period day by day' }).click()
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  await page.keyboard.press(']')
  await expect(trigger).toContainText('Faster')
  await page.keyboard.press('[')
  await page.keyboard.press('[')
  await expect(trigger).toContainText('Normal')
  await page.getByRole('button', { name: 'Pause replay' }).click()
})

test('Online now pulses while anyone is on, and its count rolls', async ({ page }) => {
  await open(page)
  const tile = page.locator('.kpi-online')
  await expect(tile.locator('.roll')).toBeVisible()
  await expect(tile).toHaveAttribute('title', /last 5 min|connecting/)
})
