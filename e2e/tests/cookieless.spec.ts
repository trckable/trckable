// A cookieless site says "Off: cookieless mode" where the dashboard would
// show new vs returning or journeys: a daily hash recognises nobody the next
// day, so those numbers would be every visitor new and every journey a day.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'cookieless e2e password 1'
const SHOTS = process.env.POLISH_SHOTS
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const OFF = 'Off: cookieless mode'
const addDay = (d: string, n: number) => new Date(Date.parse(d) + n * 86400_000).toISOString().slice(0, 10)

// Signing in is limited per address, and the other suites need theirs: one
// session for every browser, made by whichever worker gets there first.
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'cookieless-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `cookieless-${Date.now()}@example.com`
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 5) throw e
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
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

type Site = { id: string; domain: string }

/** A site of its own, cookieless, with one visit: example.com stays as the
 *  other suites expect it. */
async function cookielessSite(page: Page, r: APIRequestContext, tag: string): Promise<Site> {
  const made = await r.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `ck-${tag}.example` } })
  expect(made.ok()).toBe(true)
  const site = (await made.json()) as Site
  const cfg = await (await r.get(`${API}/api/v1/sites/${site.id}/config`)).json()
  expect((await r.put(`${API}/api/v1/sites/${site.id}/config`, { headers: H, data: { ...cfg, consent_free: true } })).ok()).toBe(true)
  // A pageview as the script sends it, from a real browser's user agent.
  const ua = await page.evaluate(() => navigator.userAgent)
  const sent = await r.post(`${API}/api/e`, {
    headers: { 'Content-Type': 'text/plain', 'User-Agent': ua, Origin: `https://${site.domain}` },
    data: JSON.stringify({ s: site.id, k: 'pv', u: `https://${site.domain}/`, id: Date.now().toString(36), w: 1280, l: 'en', c: 1 }),
  })
  expect(sent.status()).toBeLessThan(300)
  // Counted: the report has it (else the page opens on the install card,
  // and swaps it for the numbers mid-test).
  const day = new Date().toISOString().slice(0, 10)
  const counted = async () => {
    const res = await r.get(`${API}/api/v1/sites/${site.id}/report?from=${addDay(day, -1)}&to=${addDay(day, 1)}`)
    return res.ok() ? (((await res.json()) as { current: { kpis: { visitors: number } } }).current.kpis.visitors ?? 0) : 0
  }
  await expect.poll(counted, { timeout: 20_000 }).toBeGreaterThan(0)
  await expect
    .poll(async () => ((await (await r.get(`${API}/api/v1/sites`)).json()).sites as (Site & { last_event_at?: number })[]).find((s) => s.id === site.id)?.last_event_at ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(0)
  return site
}

// The sites stay, like the install suite's: deleting one purges its
// analytics, which takes a while under load.

test('new vs returning and journeys say Off, never a number', async ({ page, browserName }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + '/example.com')
  const site = await cookielessSite(page, page.request, `${browserName}-${Date.now()}`)
  const listed = ((await (await page.request.get(`${API}/api/v1/sites`)).json()).sites as (Site & { cookieless?: boolean })[]).find((s) => s.id === site.id)
  expect(listed?.cookieless).toBe(true)

  await page.goto(`${API}/${site.domain}?period=7d&mode=full`)
  const more = page.getByRole('button', { name: /More numbers/ })
  await expect(more).toBeVisible({ timeout: 20_000 })
  // Folded: sessions, and no "% new".
  await expect(more).not.toContainText('% new')
  await more.click()
  const cell = page.locator('.more-grid > *', { hasText: 'New visitors' })
  await expect(cell).toContainText(OFF)

  // The chart's day: a line saying it is off, not a split bar.
  const chart = page.locator('.overview-chart .chart-wrap')
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2)
  const tip = page.locator('.time-tip')
  await expect(tip).toContainText(OFF)
  await expect(tip.locator('.ct-split')).toHaveCount(0)

  // Journeys: the People card says Off, and Live opens nobody.
  const people = page.locator('.card', { has: page.getByRole('heading', { name: 'People' }) })
  await expect(people).toContainText(OFF)
  await expect(people.getByRole('button')).toHaveCount(0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cookieless-${browserName}.png`, fullPage: true })
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Live' }).click()
  await expect(page.getByRole('region', { name: 'Live', exact: true }).locator('.cookieless-note')).toHaveText(`Journeys · ${OFF}`)

  // Data & privacy says what the dashboard shows.
  await page.goto(`${API}/settings?site=${site.id}&tab=privacy`)
  await expect(page.locator('.window-body')).toContainText(`“${OFF}”`)
})

test('a site with cookies still shows its numbers', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const ctx = await page.context().browser()!.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/cookies-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
  await page.goto(`${API}/example.com?period=7d&mode=full`)
  const more = page.getByRole('button', { name: /More numbers/ })
  await expect(more).toContainText('% new', { timeout: 20_000 })
  await expect(page.getByText(OFF)).toHaveCount(0)
})

test('on a phone the Off labels fit the screen', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + '/example.com')
  const site = await cookielessSite(page, page.request, `phone-${browserName}-${Date.now()}`)
  await page.goto(`${API}/${site.domain}?period=7d&mode=full`)
  await page.getByRole('button', { name: /More numbers/ }).click({ timeout: 20_000 })
  const cell = page.locator('.more-grid > *', { hasText: 'New visitors' })
  await expect(cell).toContainText(OFF)
  const b = (await cell.boundingBox())!
  expect(b.x + b.width).toBeLessThanOrEqual(375)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cookieless-phone-${browserName}.png` })
})
