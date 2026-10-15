// Source markers on the charts: a known source's first visits or jump is a
// marker (badge and what it added), opened it says it in words with one action
// that narrows the dashboard to that source; the Markers menu turns kinds on
// and off and remembers it; the day-by-day chart shows the same markers.
// What the server counts is given by the browser here (its rules are tested in
// Go and vitest); everything else is real.
//   MARKERS_SHOTS=/some/folder  also takes the pictures for review.
import { expect, test, type Page } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session, withoutPayments } from './session'

const SHOTS = process.env.MARKERS_SHOTS
const DOMAIN = 'example.com'
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Hacker News sends 40 visitors four days ago, after nothing; Google stays level. */
async function given(page: Page) {
  await withoutPayments(page)
  await page.route(/\/api\/v1\/sites\/[^/]+\/moments\?/, (r) => r.fulfill({ json: { bucket: 'day', moments: [] } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/insights\?/, (r) => r.fulfill({ json: { insights: [] } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\/links/, (r) => r.fulfill({ json: { links: [], goals: false } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/sparks\?/, (r) => {
    const q = new URL(r.request().url()).searchParams
    const days: string[] = []
    for (let t = Date.parse(q.get('from')!); t <= Date.parse(q.get('to')!); t += 86400_000) days.push(iso(t))
    const rows: Record<string, number[]> = {}
    for (const v of q.getAll('v')) rows[v] = days.map((d) => (v === 'news.ycombinator.com' && d === iso(Date.now() - 4 * 86400_000) ? 40 : v === 'google.com' ? 12 : 0))
    return r.fulfill({ json: { days, rows } })
  })
}

let cookie = ''
test.beforeAll(async ({ browser }) => {
  cookie = await session('source-markers')
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/source-markers-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
})

async function open(page: Page, width: number, path = `?view=data`) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`${API}/${DOMAIN}${path}`)
}

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/markers-${name}-${scheme}.png` })
  }
}

for (const width of [1440, 390]) {
  test(`a source's jump is a marker that says it in words and narrows to the source (${width})`, async ({ page }) => {
    await given(page)
    await open(page, width)
    const mark = page.locator('.chart-wrap .sm-mark')
    await expect(mark).toHaveCount(1, { timeout: 30_000 })
    await expect(mark).toContainText('+40')
    await mark.click()
    const pop = page.getByRole('dialog', { name: /Hacker News sent 40 visitors on/ })
    await expect(pop).toBeVisible()
    await shoot(page, `open-${width}`)
    await pop.getByRole('button', { name: 'See these visitors' }).click()
    await expect(page).toHaveURL(/news\.ycombinator\.com/)
  })
}

test('the Markers menu turns kinds off, offers Goals off by default, and remembers', async ({ page }) => {
  await given(page)
  await open(page, 1440)
  await expect(page.locator('.chart-wrap .sm-mark')).toHaveCount(1, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Markers on the charts' }).click()
  const items = page.getByRole('menuitemcheckbox')
  await expect(items).toHaveText(['Sources', 'Links', 'Goals', 'Moments'])
  await expect(page.getByRole('menuitemcheckbox', { name: 'Sources' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('menuitemcheckbox', { name: 'Goals' })).toHaveAttribute('aria-checked', 'false')
  await shoot(page, 'menu-1440')
  await page.getByRole('menuitemcheckbox', { name: 'Sources' }).click()
  await expect(page.locator('.chart-wrap .sm-mark')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.chart-wrap svg[role="img"]')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(3000)
  await expect(page.locator('.chart-wrap .sm-mark')).toHaveCount(0)
})

test('the day-by-day chart shows the same marker, from the same setting', async ({ page }) => {
  await given(page)
  await open(page, 1440, '?v=story')
  await expect(page.locator('.sv-plot .sm-mark')).toHaveCount(1, { timeout: 30_000 })
  await shoot(page, 'story-1440')
})
