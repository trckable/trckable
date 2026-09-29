// Live mode: the site right now. A visit from another browser slides into
// "On the site right now" and moves the numbers, without a reload; the switch,
// the L key and the Online now tile all lead there; a phone gets the panels
// stacked with the list scrolling inside.
import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'live mode e2e password 1'

// Signing in is limited to ten tries in ten minutes from one address, and the
// other suites need theirs: every browser here shares one session, made once
// by whichever worker gets there first.
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'livemode-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `livemode-${Date.now()}@example.com`
  // Other suites add their people at the same moment: a busy database is
  // tried again.
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 4) throw e
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

let cookie = ''
test.beforeAll(async () => {
  cookie = await session()
})

async function signIn(page: Page, path = '/example.com') {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + path)
}

/** A new visitor on the test site, from a browser context of its own. */
async function visit(page: Page, name: string) {
  const ctx = await page.context().browser()!.newContext()
  const p = await ctx.newPage()
  const run = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await p.goto(`/r/${run}/index.html`)
  await p.waitForTimeout(1500) // the pageview leaves
  await ctx.close()
  return run
}

const num = async (page: Page, sel: string) => Number((await page.locator(sel).innerText()).replace(/[^\d]/g, '') || 0)

test('a visit slides in and the numbers move, without a reload', async ({ page }) => {
  await signIn(page)
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Live' }).click()
  await expect(page).toHaveURL(/[?&]view=live/)
  const live = page.getByRole('region', { name: 'Live', exact: true })
  await expect(live.locator('.live-online')).toBeVisible({ timeout: 15_000 })
  // Live is always now: no period, no filters, and no ⋯ page menu at all.
  await expect(page.locator('.range-picker')).toHaveCount(0)
  await expect(page.locator('.subbar .btn.filter')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'More', exact: true })).toHaveCount(0)
  // One screen: the page itself does not scroll.
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0)

  let reloads = 0
  page.on('framenavigated', (f) => f === page.mainFrame() && reloads++)
  const online = await num(page, '.live-online')
  const visitors = await num(page, '.live-visitors')
  const run = await visit(page, 'livemode')
  // The path is cut in the middle on screen; its full text is the title.
  const row = live.locator('.live-feed .live-row', { has: page.locator(`.live-page[title*="${run}"]`) })
  await expect(row).toBeVisible({ timeout: 5_000 })
  // Near the top: newest first (other browsers' tests may visit at the same time).
  expect(await row.evaluate((li) => [...li.parentElement!.children].indexOf(li))).toBeLessThan(4)
  await expect.poll(() => num(page, '.live-online'), { timeout: 5_000 }).toBeGreaterThan(online)
  await expect.poll(() => num(page, '.live-visitors'), { timeout: 5_000 }).toBeGreaterThan(visitors)
  // The chart counted it: its label carries the 30 minutes' total.
  await expect(live.getByRole('img', { name: /Pageviews per minute/ })).not.toHaveAttribute('aria-label', /: 0 pageviews/)
  expect(reloads).toBe(0)
})

test('Live has no dots of its own: the switch has the one, and it dims while the connection is down', async ({ page }) => {
  await signIn(page, '/example.com?view=live')
  const live = page.getByRole('region', { name: 'Live', exact: true })
  await expect(live.locator('.live-online')).toBeVisible({ timeout: 15_000 })
  await expect(live.locator('.live-now .pulse, .live-now .live-dot')).toHaveCount(0)
  const dot = page.getByRole('group', { name: 'View' }).locator('.pulse')
  await expect(dot).toHaveCount(1)
  await expect(dot).toHaveCSS('opacity', '1')
  // The stream refused: Live says so in words, and the switch's dot dims.
  await page.route('**/api/v1/sites/*/live', (route) => route.abort())
  await page.reload()
  await expect(live.getByText('Reconnecting…')).toBeVisible({ timeout: 15_000 })
  await expect(dot).toHaveCSS('opacity', '0.3')
})

test('L, the Online now tile and the switch lead to Live and back', async ({ page }) => {
  await signIn(page)
  const tile = page.locator('button.kpi', { has: page.locator('.label', { hasText: 'Online now' }) })
  await expect(tile).toBeVisible({ timeout: 15_000 })
  await tile.click()
  await expect(page).toHaveURL(/[?&]view=live/)
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible()
  await page.keyboard.press('l')
  await expect(page).not.toHaveURL(/view=live/)
  await expect(page.locator('.range-picker')).toBeVisible()
  await page.keyboard.press('l')
  await expect(page).toHaveURL(/[?&]view=live/)
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Data' }).click()
  await expect(page).not.toHaveURL(/view=live/)
  await expect(page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Data' })).toHaveAttribute('aria-pressed', 'true')
})

test('on a phone the panels stack and the list scrolls inside', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, '/example.com?view=live')
  const live = page.getByRole('region', { name: 'Live', exact: true })
  await expect(live.locator('.live-online')).toBeVisible({ timeout: 15_000 })
  const now = await live.locator('.live-now').boundingBox()
  const onSite = await live.locator('.live-onsite').boundingBox()
  expect(now && onSite && onSite.y >= now.y + now.height - 1).toBe(true)
  expect(now!.width).toBeLessThanOrEqual(375)
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(wide).toBeLessThanOrEqual(375)
  expect(await live.locator('.live-feed').evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto')
})

// Switching is one movement, not two pages: Live's code is fetched on hover,
// so no placeholder ever shows; the top bar does not move; Live opens at the
// top and Data comes back scrolled where it was left.
test('switching both ways: no blank frame, no shift, scroll kept', async ({ page }) => {
  await visit(page, 'switch') // a site with data shows the full Data view
  await signIn(page)
  const view = page.getByRole('group', { name: 'View' })
  await expect(page.locator('button.kpi', { has: page.locator('.label', { hasText: 'Online now' }) })).toBeVisible({ timeout: 15_000 })
  await page.evaluate(() => {
    const w = window as unknown as { blanks: number }
    w.blanks = 0
    new MutationObserver(() => {
      if (document.querySelector('.live-wait')) w.blanks++
    }).observe(document.body, { childList: true, subtree: true })
  })
  const chunk = page.waitForRequest(/\/assets\/LiveView-[^/]+\.js$/)
  await view.hover()
  await chunk
  const top = await view.boundingBox()
  const y = await page.evaluate(() => {
    window.scrollTo(0, Math.min(400, document.documentElement.scrollHeight - innerHeight))
    return scrollY
  })

  // Scrolled down, the switch is out of sight: L is the way to Live.
  await page.keyboard.press('l')
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/[?&]view=live/)
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await view.boundingBox()).toEqual(top)

  await view.getByRole('button', { name: 'Data' }).click()
  await expect(page.locator('.range-picker')).toBeVisible()
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(y)
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await view.boundingBox()).toEqual(top)
  expect(await page.evaluate(() => (window as unknown as { blanks: number }).blanks)).toBe(0)
})

test('reduced motion: an instant switch, no transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const d = document as Document & { startViewTransition?: unknown; transitions?: number }
    d.transitions = 0
    if (typeof d.startViewTransition !== 'function') return
    const real = d.startViewTransition as (cb: () => void) => unknown
    d.startViewTransition = function (cb: () => void) {
      d.transitions!++
      return real.call(this, cb)
    }
  })
  await signIn(page)
  const view = page.getByRole('group', { name: 'View' })
  await view.getByRole('button', { name: 'Live' }).click()
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible()
  await view.getByRole('button', { name: 'Data' }).click()
  await expect(page.locator('.range-picker')).toBeVisible()
  expect(await page.evaluate(() => (document as Document & { transitions?: number }).transitions)).toBe(0)
  expect(await page.evaluate(() => document.documentElement.dataset.swap)).toBeUndefined()
  // The pill jumps rather than slides.
  expect(await page.locator('.view-pill').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.01)
})

test('a site with no visit yet shows its install screen in Live, and the mode comes back', async ({ page }) => {
  const domain = `nolive-${Date.now()}.example`
  await signIn(page)
  await page.evaluate(async (d) => {
    await fetch('/api/v1/sites', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Trckable-Request': '1' }, body: JSON.stringify({ domain: d }) })
  }, domain)
  const view = page.getByRole('group', { name: 'View' })
  // Live on a working site, then the switcher to the new one.
  await view.getByRole('button', { name: 'Live' }).click()
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible({ timeout: 15_000 })
  await page.goto(`${API}/${domain}?view=live`)
  await expect(page.getByText('Waiting for the first visit').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toHaveCount(0)
  await expect(view).toHaveCount(0)
  // Data mode shows the same screen; back on a working site, the choice is kept.
  await page.goto(`${API}/${domain}`)
  await expect(page.getByText('Waiting for the first visit').first()).toBeVisible()
  await page.goto(`${API}/example.com?view=live`)
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible({ timeout: 15_000 })
})
