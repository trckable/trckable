// What the Data view says beyond its lists, against a trckabled with the demo
// data (skipped unless TRCKABLE_A11Y_URL points at one):
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test extras
// Highlights, the pace line and the moments on the chart, the AI & Search and
// revenue tabs, Latest buyers (and no email anywhere in it), and Compact without any
// of the Full-only ones.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './fixtures'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'
const SHOTS = process.env.TRCKABLE_SHOTS // a folder: screenshots, for review

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')

// One sign-in for every browser here (ten tries in ten minutes are all there are).
async function session(): Promise<string> {
  const file = join(tmpdir(), `trckable-extras-${new URL(BASE!).port}-${process.ppid}`)
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const res = await fetch(BASE + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  const cookie = `trckable_session=${value}`
  const sites = (await (await fetch(BASE + '/api/v1/sites', { headers: { cookie } })).json()) as { sites: { id: string }[] }
  for (const m of ['revenue', 'journeys']) {
    await fetch(`${BASE}/api/v1/sites/${sites.sites[0].id}/modules/${m}`, { method: 'PUT', headers: { cookie, 'Content-Type': 'application/json', 'X-Trckable-Request': '1' }, body: JSON.stringify({ enabled: true }) })
  }
  writeFileSync(file, value)
  return value
}

async function signIn(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: await session(), url: BASE! }])
  await page.goto(BASE + '/')
  return page.evaluate(async () => {
    const s = (await (await fetch('/api/v1/sites')).json()).sites[0]
    return { id: s.id as string, domain: s.domain as string, timezone: s.timezone as string }
  })
}

// "Last 30 days" ends today, so it is live; the pace line needs three whole days of this month.
const dayOfMonth = (tz: string) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: tz, day: '2-digit' }).format(new Date()))

test('the pace line sits in the Visitors tile once three days of the month have gone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const site = await signIn(page)
  await page.goto(`${BASE}/${site.domain}?view=data`)
  await expect(page.locator('.overview-chart')).toBeVisible({ timeout: 20_000 })
  const pace = page.locator('.kpis .kpi-pace')
  if (dayOfMonth(site.timezone) > 3) {
    await expect(pace).toHaveText(/^→ ~[\d.,]+[KkM]? this month$/, { timeout: 20_000 })
  } else {
    await page.waitForTimeout(2000)
    await expect(pace, 'under three whole days: nothing is said').toHaveCount(0)
  }
})

test('moments mark the chart, at most six, each saying what it is', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const site = await signIn(page)
  await page.goto(`${BASE}/${site.domain}?view=data`)
  const marks = page.locator('.overview-chart .moment-mark')
  await expect(marks.first()).toBeVisible({ timeout: 20_000 })
  expect(await marks.count()).toBeLessThanOrEqual(6)
  await marks.first().hover()
  await expect(page.locator('.moment-tip')).toBeVisible()
  // The chart's own hover card steps aside while a marker speaks.
  await expect(page.locator('.chart-tip')).toHaveCount(0)
  if (SHOTS) await page.locator('.overview').screenshot({ path: `${SHOTS}/extras-moments-${info.project.name}.png` })
  // Reachable and readable from the keyboard.
  await page.mouse.move(5, 5)
  await marks.first().focus()
  await expect(page.locator('.moment-tip')).toBeVisible()
  const { violations } = await new AxeBuilder({ page }).include('.overview-chart').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(violations.map((v) => v.id)).toEqual([])
})

test('Full: Highlights lead Who came, and a line applies its filter', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const site = await signIn(page)
  await page.goto(`${BASE}/${site.domain}?mode=full`)
  const who = page.locator('[data-card=who]')
  await expect(who.getByRole('tab').first()).toHaveText('Highlights', { timeout: 20_000 })
  await who.getByRole('tab', { name: 'Highlights' }).click()
  const rows = who.locator('.hl-row')
  expect(await rows.count()).toBeGreaterThan(0)
  expect(await rows.count()).toBeLessThanOrEqual(4)
  await rows.first().click()
  await expect(page).toHaveURL(/[?&]f=/)
})

test('Full: AI & Search is one tab of Who came, with the assistants by name', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const site = await signIn(page)
  await page.goto(`${BASE}/${site.domain}?mode=full`)
  const who = page.locator('[data-card=who]')
  await who.getByRole('tab', { name: 'AI & Search', exact: true }).click({ timeout: 20_000 })
  await expect(who.getByRole('group', { name: 'AI assistants' }).locator('.bl-row').first()).toContainText(/ChatGPT|Claude|Perplexity|Gemini|Copilot/, { timeout: 20_000 })
  // The old AI and Search tabs of Sources are gone.
  await who.getByRole('tab', { name: 'Sources', exact: true }).click()
  await expect(who.getByRole('tablist', { name: 'Sources' }).getByRole('tab', { name: /^(AI|Search)$/ })).toHaveCount(0)
})

test('Full: Sources that pay, Pages that sell and Latest buyers, and never an email', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const site = await signIn(page)
  await page.goto(`${BASE}/${site.domain}?mode=full`)
  const what = page.locator('[data-card=what]')
  await expect(what.getByRole('tab', { name: 'Sources that pay' })).toBeVisible({ timeout: 20_000 })
  await what.getByRole('tab', { name: 'Sources that pay' }).click()
  await expect(what.locator('.bl-cols')).toContainText('Per visitor')
  await expect(what.locator('.bl-row').first()).toContainText('$')
  await expect(what.getByRole('group', { name: 'Which visit gets the credit' })).toBeVisible() // first or last touch, as a small switch
  await what.getByRole('tab', { name: 'Pages that sell' }).click()
  await expect(what.locator('.bl-row').first()).toContainText('$', { timeout: 20_000 })
  await what.getByRole('tab', { name: 'Latest buyers' }).click()
  const rows = what.locator('.by-row')
  await expect(rows.first()).toBeVisible({ timeout: 20_000 })
  expect(await rows.count()).toBeLessThanOrEqual(8)
  await expect(rows.first().locator('.by-amount')).toContainText('$')
  const text = await what.locator('.by').innerText()
  expect(text, 'a buyer is never named').not.toMatch(/@/)
  // The buyers are read the way the report credits a sale: its filters and its test mode apply.
  const asked = async (qs: string) => ((await (await page.request.get(`${BASE}/api/v1/sites/${site.id}/buyers?${qs}`)).json()) as { buyers: { channel?: string }[] }).buyers
  const ai = await asked('f=channel:AI&n=20')
  expect(ai.length).toBeGreaterThan(0)
  expect(ai.every((b) => b.channel === 'AI')).toBe(true)
  // Test mode reads the report's own way (live and test payments together): at least what live mode shows.
  expect((await asked('payments=test&n=20')).length).toBeGreaterThanOrEqual((await asked('n=20')).length)
  // The tabs come in this order.
  const names = await what.getByRole('tablist').first().getByRole('tab').allTextContents()
  expect(names.slice(0, 4)).toEqual(['Goals', 'Sources that pay', 'Pages that sell', 'Latest buyers'])
})

test('Compact has none of the Full-only ones', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const site = await signIn(page)
  await page.goto(`${BASE}/${site.domain}?view=data`)
  const who = page.locator('[data-card=who]')
  await expect(who.getByRole('tab', { name: 'Sources', exact: true })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  await expect(who.getByRole('tab', { name: 'Highlights' })).toHaveCount(0)
  await expect(page.locator('[data-card=what]').getByRole('tab', { name: 'Latest buyers' })).toHaveCount(0)
  await expect(page.locator('[data-card=what]').getByRole('tab', { name: 'Pages that sell' })).toHaveCount(0)
  await expect(who.getByRole('tab', { name: 'AI & Search' })).toHaveCount(0)
  await expect(page.locator('.overview-chart .moment-mark').first()).toBeVisible() // the markers cost nothing: Compact has them
})
