// Notes on the chart: a flag on the x-axis per day, its words on hover,
// focus or tap, never past the chart's edges; one flag with a count for a
// busy day; the Notes list (search, edit, delete, jump to the day) from the
// chart and from Settings; share links show notes only when allowed.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('notes')
})

async function signIn(page: Page, path: string) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + path)
}

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const siteId = async (r: APIRequestContext) => ((await (await r.get(`${API}/api/v1/sites`)).json()).sites as { id: string; domain: string }[]).find((s) => s.domain === 'example.com')!.id
const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400_000))
/** How the dashboard names a day in a flag's label: "Sat, Sep 26". */
const dayName = (n: number) => new Date(Date.now() - n * 86400_000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
// Each browser writes on its own days, so the three running at once never
// crowd one tooltip.
const OWN: Record<string, number> = { chromium: 3, firefox: 4, webkit: 5 }

/** A visit, so the dashboard has numbers (the chart shows only with data). */
async function visit(page: Page) {
  const ctx = await page.context().browser()!.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/notes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
}

async function addNote(r: APIRequestContext, site: string, day: string, text: string) {
  const res = await r.post(`${API}/api/v1/sites/${site}/annotations`, { headers: H, data: { day, text } })
  expect(res.status()).toBe(201)
  return (await res.json()) as { id: string; author?: string }
}

/** The box of a, inside the box of b (a pixel of rounding allowed). */
async function inside(a: { x: number; y: number; width: number; height: number } | null, b: { x: number; y: number; width: number; height: number } | null) {
  expect(a && b).toBeTruthy()
  expect(a!.x).toBeGreaterThanOrEqual(b!.x - 1)
  expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + b!.width + 1)
}

test('flags on the axis, a count for a busy day, words on hover and focus, never past the edge', async ({ page, browserName }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await visit(page)
  const site = await siteId(page.request)
  const tag = `${browserName}-${Date.now()}`
  // Two on one day, and a long one today: the right edge, where the old label was cut off.
  await addNote(page.request, site, daysAgo(OWN[browserName]), `Launch post ${tag}`)
  await addNote(page.request, site, daysAgo(OWN[browserName]), `Newsletter ${tag}`)
  const edge = await addNote(page.request, site, daysAgo(0), `Integration with a long name that would never fit on the axis ${tag}`)
  expect(edge.author).toMatch(/^owner-\d+@example\.com$/)

  await signIn(page, '/example.com?period=7d&mode=full')
  const chart = page.locator('.overview-chart .chart-wrap')
  const busy = chart.getByRole('button', { name: new RegExp(`^\\d+ notes on ${dayName(OWN[browserName])}`) })
  await expect(busy).toBeVisible({ timeout: 15_000 })
  await expect(busy.locator('i')).toHaveText(/^\d+$/)
  // No label on the axis any more: only flags.
  await expect(page.locator('.note-flag')).toHaveCount(0)

  await busy.hover()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText(`Launch post ${tag}`)
  await expect(tip).toContainText(`Newsletter ${tag}`)
  await expect(tip).toContainText(/by owner-\d+@example\.com/)

  // Today's flag, at the right edge: its words stay inside the chart.
  const last = chart.locator('.note-mark').last()
  await last.focus()
  await expect(tip).toContainText(`Integration with a long name`)
  await inside(await tip.boundingBox(), await chart.boundingBox())
  await page.keyboard.press('Escape')
  await expect(tip).toBeHidden()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/notes-chart-${browserName}.png` })
})

test('the Notes list: search, edit, delete, and a click shows the day', async ({ page, browserName }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await visit(page)
  const site = await siteId(page.request)
  const tag = `${browserName}-${Date.now()}`
  const day = daysAgo(40) // outside the period on screen: the jump opens a month around it
  await addNote(page.request, site, day, `Old outage ${tag}`)
  await addNote(page.request, site, daysAgo(1), `Price change ${tag}`)

  await signIn(page, '/example.com?period=7d&mode=full')
  const dialog = page.getByRole('dialog', { name: 'Notes' })
  // Cards arriving late (a milestone, say) can move the button as it is
  // clicked: open it until it is open.
  const openList = () =>
    expect(async () => {
      if (!(await dialog.isVisible())) await page.getByRole('button', { name: /^Notes/ }).click()
      await expect(dialog).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  await openList()
  await dialog.getByRole('searchbox', { name: 'Search notes' }).fill(tag)
  await expect(dialog.getByRole('listitem')).toHaveCount(2)
  await dialog.getByRole('searchbox', { name: 'Search notes' }).fill(`outage ${tag}`)
  await expect(dialog.getByRole('listitem')).toHaveCount(1)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/notes-list-${browserName}.png` })

  // Edit in place.
  await dialog.getByRole('button', { name: `Edit note: Old outage ${tag}` }).click()
  await dialog.getByLabel('Note', { exact: true }).fill(`Old outage, fixed ${tag}`)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByText(`Old outage, fixed ${tag}`)).toBeVisible()

  // A click shows its day on the chart.
  await dialog.getByRole("button", { name: new RegExp(`^Old outage, fixed ${tag}`) }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`day=${day}`))
  await expect(page).toHaveURL(/from=/)
  // The month around it has loaded, with the note's flag on its day.
  await expect(page.locator('.overview-chart .note-mark').first()).toBeVisible({ timeout: 40_000 })

  // Delete, behind the one confirmation.
  await openList()
  await dialog.getByRole('searchbox', { name: 'Search notes' }).fill(`Price change ${tag}`)
  await dialog.getByRole('button', { name: `Delete note: Price change ${tag}` }).click()
  await page.getByRole('dialog', { name: 'Delete this note?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(dialog.getByText(`No note matches`)).toBeVisible()

  // The same list in Settings.
  await page.goto(`${API}/settings?site=${site}&tab=notes`)
  const body = page.locator('.window-body')
  await body.getByRole('searchbox', { name: 'Search notes' }).fill(tag)
  await expect(body.getByRole('listitem')).toHaveCount(1)
})

test('a share link shows notes only when the owner allows it, and never the author', async ({ page, browser, browserName }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await visit(page)
  const site = await siteId(page.request)
  const tag = `${browserName}-${Date.now()}`
  await addNote(page.request, site, daysAgo(2), `Shared note ${tag}`)
  const made = await page.request.post(`${API}/api/v1/sites/${site}/shares`, { headers: H, data: { name: `notes ${tag}`, revenue: false, days: 1 } })
  const { share, url } = (await made.json()) as { share: { id: string; notes: boolean }; url: string }
  expect(share.notes).toBe(false)

  const stranger = await browser.newContext()
  const shared = await stranger.newPage()
  const link = url.replace(/^https?:\/\/[^/]+/, API)
  const notes = async () => (await (await shared.request.get(`${API}/api/v1/share/annotations?from=${daysAgo(10)}&to=${daysAgo(0)}`)).json()).annotations as { text: string; author?: string }[]
  await shared.goto(link + '?period=7d')
  await expect(shared.locator('.overview-chart')).toBeVisible({ timeout: 15_000 })
  expect(await notes()).toEqual([])
  await expect(shared.locator('.note-mark')).toHaveCount(0)

  // The owner turns them on from the link's row.
  await signIn(page, '/example.com')
  await page.goto(`${API}/settings?site=${site}&tab=sharing`)
  await page.getByRole('button', { name: `Notes hidden: notes ${tag}` }).click()
  await expect(page.getByText('This link shows the notes now')).toBeVisible()

  await shared.reload()
  await expect(shared.locator('.note-mark').first()).toBeVisible({ timeout: 15_000 })
  const list = await notes()
  expect(list.some((n) => n.text === `Shared note ${tag}`)).toBe(true)
  expect(list.every((n) => n.author === undefined)).toBe(true)
  await stranger.close()
  await page.request.delete(`${API}/api/v1/sites/${site}/shares/${share.id}`, { headers: H })
})

test('on a phone the flag opens with a tap and its words fit the screen', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await visit(page)
  const site = await siteId(page.request)
  await addNote(page.request, site, daysAgo(1), `A phone-sized note that is long enough to wrap onto several lines ${browserName}`)
  await signIn(page, '/example.com?period=7d')
  const mark = page.locator('.overview-chart').getByRole('button', { name: new RegExp(`on ${dayName(1)}$`) })
  await expect(mark).toBeVisible({ timeout: 15_000 })
  // On a week by day the next day's flag is one slot away and its box touches this one's: tap the near edge.
  const tap = { position: { x: 10, y: 30 } }
  await mark.click(tap)
  const tip = page.getByRole('tooltip')
  await expect(tip).toBeVisible()
  const box = await tip.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  // Every flag, and its count, inside the chart: the last day's too.
  const chart = await page.locator('.overview-chart .chart-wrap').boundingBox()
  for (const m of await page.locator('.overview-chart .note-mark, .overview-chart .note-mark i').all()) await inside(await m.boundingBox(), chart)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/notes-phone-${browserName}.png` })
  // A second tap closes it.
  await mark.click(tap)
  await expect(tip).toBeHidden()
})
