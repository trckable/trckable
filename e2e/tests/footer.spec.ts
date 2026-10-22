// The foot of the dashboard: no logo and no card, one hairline over a quiet line. How things are (a site
// that is down turns it red), the keys that help, this version and what is new, Docs, Feedback and the
// profile marks that have an address. Feedback sends a note the owner can read back.
// Pictures for the review: POLISH_SHOTS=<folder>.
import { expect, test } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const SHOTS = process.env.POLISH_SHOTS
let cookie = ''
test.beforeAll(async () => {
  cookie = await session('footer')
})

// The sites made here are taken away again: an unreachable one would turn up (as "Not reachable") in the site list other specs read.
const made: { id: string; domain: string }[] = []
test.afterEach(async ({ request }) => {
  for (const s of made.splice(0)) await request.delete(`${API}/api/v1/sites/${s.id}`, { headers: { ...H, Cookie: `trckable_session=${cookie}` }, data: { domain: s.domain } })
})

const open = async (page: import('@playwright/test').Page) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const res = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `footer-${Date.now()}.example.org` } })
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as { site?: { id: string; domain: string } } & { id?: string; domain?: string }
  made.push(body.site ?? { id: body.id!, domain: body.domain! })
  await page.goto(`${API}/`)
  const foot = page.locator('footer.app-footer')
  await expect(foot).toBeVisible({ timeout: 20_000 })
  return foot
}

test('the footer says all is normal, hints the keys, and Feedback sends a note', async ({ page }) => {
  const foot = await open(page)
  await expect(foot.getByText('All systems normal')).toBeVisible()
  // No logo, no card: a hairline on top and nothing behind it.
  await expect(foot.locator('.tkb-logo, .tkb-ghost, svg.tkb-ghost')).toHaveCount(0)
  const look = await foot.evaluate((el) => {
    const c = getComputedStyle(el)
    return { top: c.borderTopWidth, bg: c.backgroundColor, shadow: c.boxShadow, radius: c.borderTopLeftRadius }
  })
  expect(look).toEqual({ top: '1px', bg: 'rgba(0, 0, 0, 0)', shadow: 'none', radius: '0px' })
  // The keys that exist here: Filter and Shortcuts. Ask is only hinted where something answers it.
  await expect(foot.locator('.footer-key', { hasText: 'Filter' }).locator('kbd')).toHaveText('/')
  await expect(foot.getByRole('button', { name: /Shortcuts/ })).toBeVisible()
  await expect(foot.locator('.footer-key', { hasText: 'Ask' })).toHaveCount(0)
  await foot.getByRole('button', { name: /Shortcuts/ }).click()
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden()
  // This version and what is new, Docs, and the one profile that has an address.
  await expect(foot.getByRole('link', { name: /^v\d+\.\d+\.\d+ · What’s new/ })).toHaveAttribute('href', /changelog/)
  await expect(foot.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', /docs/)
  await expect(foot.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/trckable/trckable')
  await expect(foot.getByRole('link', { name: 'X', exact: true })).toHaveCount(0)
  await expect(foot.getByRole('link', { name: 'LinkedIn' })).toHaveCount(0)

  if (SHOTS) {
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await foot.scrollIntoViewIfNeeded()
      await foot.screenshot({ path: `${SHOTS}/polish-footer-1440-${scheme}.png` })
    }
  }

  const note = `Footer note ${Date.now()}`
  await foot.getByRole('button', { name: 'Feedback' }).click()
  const dialog = page.getByRole('dialog', { name: 'Feedback' })
  await dialog.getByRole('textbox', { name: 'Your feedback' }).fill(note)
  await dialog.getByRole('button', { name: 'Send' }).click()
  await expect(dialog).toBeHidden()

  const read = await page.request.get(`${API}/api/v1/admin/feedback`)
  const list = ((await read.json()) as { feedback: { message: string }[] }).feedback
  expect(list.map((f) => f.message)).toContain(note)
})

test('a site that is down turns the dot red and says which', async ({ page }) => {
  await page.route('**/api/v1/sites', async (route) => {
    const res = await route.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    body.sites = body.sites.map((s, i) => (i === 0 ? { ...s, down_since: Math.floor(Date.now() / 1000) - 600, down_cause: 'the page did not answer' } : s))
    await route.fulfill({ response: res, json: body })
  })
  const foot = await open(page)
  const status = foot.locator('.footer-status')
  await expect(status).toHaveAttribute('data-status', 'down')
  await expect(status).toContainText(/is down: the page did not answer/)
  await expect(foot.getByText('All systems normal')).toHaveCount(0)
  // The dot wears the theme's own "down" colour, whichever theme this is.
  const down = await page.evaluate(() => {
    const probe = document.createElement('i')
    probe.style.color = 'var(--down)'
    document.body.append(probe)
    const colour = getComputedStyle(probe).color
    probe.remove()
    return colour
  })
  await expect(status.locator('i')).toHaveCSS('background-color', down)
})

test('a quiet site, none down, turns the dot amber and says how many', async ({ page }) => {
  await page.route('**/api/v1/sites', async (route) => {
    const res = await route.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    const last = Math.floor(Date.now() / 1000) - 10 * 3600
    body.sites = body.sites.map((s, i) => (i === 0 ? { ...s, last_event_at: last, check: { at: Math.floor(Date.now() / 1000) }, watched_since: last - 3 * 86400 } : { ...s, last_event_at: Math.floor(Date.now() / 1000) - 30, down_since: undefined }))
    await route.fulfill({ response: res, json: body })
  })
  const foot = await open(page)
  const status = foot.locator('.footer-status')
  await expect(status).toHaveAttribute('data-status', 'quiet')
  await expect(status).toHaveText('1 site quiet')
  await expect(foot.getByText('All systems normal')).toHaveCount(0)
  // The page is still loading under the foot, and the foot can move once after the pointer has arrived (it did on origin/main, in about one run of five under load): the pointer comes again until the tip shows.
  await expect(async () => {
    await page.mouse.move(0, 0)
    await status.hover()
    await expect(page.getByRole('tooltip')).toContainText('traffic, not an outage', { timeout: 1500 })
  }).toPass({ timeout: 15_000 })
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await foot.screenshot({ path: `${SHOTS}/footer-quiet-${scheme}.png` })
    }
  }
})

test('a release this browser has not seen puts a lime dot by What’s new', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tkb_latest', JSON.stringify({ v: '99.0.0', at: Date.now() })))
  const foot = await open(page)
  const news = foot.getByRole('button', { name: /What’s new/ })
  await expect(news).toBeVisible()
  await expect(news.locator('.footer-dot')).toBeVisible()
  await expect(news).toContainText('v99.0.0 is out')
  await news.click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('on a phone the foot is two quiet lines and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const foot = await open(page)
  await foot.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  // Keys are for a keyboard: not here. The status, then the links.
  await expect(foot.locator('.app-footer-keys')).toBeHidden()
  const rows = await foot.evaluate((el) => new Set([...el.querySelectorAll('a, button')].filter((x) => (x as HTMLElement).offsetParent).map((x) => Math.round(x.getBoundingClientRect().top / 10))).size)
  expect(rows).toBeLessThanOrEqual(4) // two lines, each a finger tall
  const box = (await foot.boundingBox())!
  for (const link of await foot.locator('a, button').all()) {
    const b = await link.boundingBox()
    if (b) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(390.5)
    }
  }
  expect(box.width).toBeLessThanOrEqual(390)
  if (SHOTS) {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await foot.screenshot({ path: `${SHOTS}/polish-footer-390-${scheme}.png` })
    }
  }
})
