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
async function given(page: Page, ago = 4, crowd = false) {
  await withoutPayments(page)
  const at = Date.now() - ago * 86400_000
  // `crowd`: a spike and a mention on the very day of the jump, to see that no marker touches another.
  await page.route(/\/api\/v1\/sites\/[^/]+\/moments\?/, (r) => r.fulfill({ json: { bucket: 'day', moments: crowd ? [{ t: `${iso(at)}T00:00`, kind: 'spike', factor: 4, visitors: 90 }, { t: `${iso(at - 86400_000)}T00:00`, kind: 'ai', bot: 'ChatGPT' }] : [] } }))
  if (crowd) {
    const posted = Math.floor(at / 1000)
    await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: { mentions: [{ id: 1, source: 'hn', url: 'https://news.ycombinator.com/item?id=1', title: 'Show HN', host: 'news.ycombinator.com', posted_at: posted, found_at: posted, visitors: 40 }], sources: ['hn', 'ph', 'news'], words: { default: [], added: [], max: 10 }, driving: null } }))
    await page.route('**/api/v1/sites', async (r) => {
      const res = await r.fetch()
      const body = (await res.json()) as { sites: { mentions?: boolean }[] }
      body.sites.forEach((x) => (x.mentions = true))
      await r.fulfill({ response: res, json: body })
    })
  }
  await page.route(/\/api\/v1\/sites\/[^/]+\/insights\?/, (r) => r.fulfill({ json: { insights: [] } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\/links/, (r) => r.fulfill({ json: { links: [], goals: false } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/sparks\?/, (r) => {
    const q = new URL(r.request().url()).searchParams
    const days: string[] = []
    for (let t = Date.parse(q.get('from')!); t <= Date.parse(q.get('to')!); t += 86400_000) days.push(iso(t))
    const rows: Record<string, number[]> = {}
    for (const v of q.getAll('v')) rows[v] = days.map((d) => (v === 'news.ycombinator.com' && d === iso(at) ? 40 : v === 'google.com' ? 12 : 0))
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

test('Show markers in the speed menu turns them off, and it is remembered', async ({ page }) => {
  await given(page)
  await open(page, 1440)
  await expect(page.locator('.chart-wrap .sm-mark')).toHaveCount(1, { timeout: 30_000 })
  await page.getByRole('button', { name: /^Replay this period/ }).focus() // the tools show when the chart is pointed at or focused
  await page.getByRole('button', { name: /^Replay speed/ }).click()
  const show = page.getByRole('menuitemcheckbox', { name: 'Show markers' })
  await expect(show).toHaveAttribute('aria-checked', 'true')
  await shoot(page, 'menu-1440')
  await show.click()
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

for (const width of [1440, 390]) {
  test(`no marker touches another, and the line says where the jump came from (${width})`, async ({ page }) => {
    await given(page, 0, true)
    await open(page, width)
    await expect(page.locator('.chart-wrap .sm-mark')).toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('.chart-wrap .mp-pin')).toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('.chart-wrap .moment-mark').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.chart-wrap .sm-line')).toHaveText(/Most of the .* jump came from Hacker News \(\+40\)/)
    const boxes = await page.locator('.chart-wrap').locator('.sm-mark, .mp-pin, .moment-mark, .sm-line').evaluateAll((els) =>
      els.map((e) => ({ name: e.className.toString().split(' ')[0], r: e.getBoundingClientRect() })).map((b) => ({ name: b.name, l: b.r.left, t: b.r.top, rt: b.r.right, bt: b.r.bottom })),
    )
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const apart = a.rt <= b.l || b.rt <= a.l || a.bt <= b.t || b.bt <= a.t
        expect(apart, `${a.name} and ${b.name} overlap`).toBe(true)
      }
    await shoot(page, `crowd-${width}`)
  })
}

test('the line takes no room: the chart stays where it was when it appears', async ({ page }) => {
  await given(page, 0)
  await open(page, 1440)
  const wrap = page.locator('.chart-wrap').first()
  await expect(wrap).toBeVisible({ timeout: 30_000 })
  const before = (await wrap.boundingBox())!.y
  await expect(page.locator('.chart-wrap .sm-line')).toBeVisible({ timeout: 30_000 })
  expect((await wrap.boundingBox())!.y).toBe(before)
})
