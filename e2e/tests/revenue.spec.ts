// Revenue on the main chart, against a trckabled with the demo data (skipped
// unless TRCKABLE_A11Y_URL points at one, like control-row):
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test revenue
// By default a plot of its own under the visitors: its own $ axis in the left
// margin, money columns, one crosshair and one card over both, reached by
// pointer and keyboard. The Revenue tile puts revenue on the main plot (the
// choice is in the address). A period with one sale or none says so quietly,
// and a share link without revenue never draws any of it.
import { expect, test, type Page } from '@playwright/test'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'
const SHOTS = process.env.TRCKABLE_SHOTS // a folder: screenshots of the chart, for review

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')

// One shared session, made by whichever worker gets there first (sign in is rate limited).
async function session(): Promise<string> {
  const file = join(tmpdir(), `trckable-revenue-${new URL(BASE!).port}-${process.ppid}`)
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

type Report = { current: Result; previous?: Result }
type Result = { series: { t: string; revenue?: number }[]; days?: { date: string; money?: unknown }[]; money?: Record<string, number> }

/** The demo's report with its sales rewritten: none, or one of the given amount on one day. */
async function withSales(page: Page, sale?: { at: number; amount: number }) {
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\?/, async (route) => {
    const res = await route.fetch()
    const body = (await res.json()) as Report
    const date = sale ? body.current.series[sale.at].t.slice(0, 10) : undefined
    for (const r of [body.current, body.previous]) {
      if (!r) continue
      const now = r === body.current
      r.series.forEach((p, i) => (p.revenue = sale && now && i === sale.at ? sale.amount : 0))
      r.days?.forEach((d) => {
        d.money = sale && now && d.date === date ? { revenue: sale.amount, payments: 1, new: sale.amount, renewal: 0 } : undefined
      })
      if (r.money) Object.assign(r.money, { revenue: now && sale ? sale.amount : 0, payments: now && sale ? 1 : 0, new_revenue: now && sale ? sale.amount : 0, renewal_revenue: 0, refunds: 0, customers: now && sale ? 1 : 0, paying_visitors: now && sale ? 1 : 0, conversion: 0, revenue_per_visitor: 0 })
    }
    await route.fulfill({ response: res, json: body })
  })
}

async function open(page: Page, width: number, query = '?view=data') {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: await session(), url: BASE! }])
  await page.goto(BASE + '/')
  const domain = await page.evaluate(async () => (await (await fetch('/api/v1/sites')).json()).sites[0].domain as string)
  await page.goto(`${BASE}/${domain}${query}`)
  const chart = page.locator('.overview-chart .chart-wrap')
  await expect(chart.locator('svg[role="img"]')).toBeVisible({ timeout: 20_000 })
  return chart
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.locator('section.overview').screenshot({ path: join(SHOTS, `revenue-${name}.png`) })
}
// The labels of a money axis: written in the left margin (x = 0), unlike a label on the line.
const axis = (chart: ReturnType<Page['locator']>) => chart.locator('svg text[x="0"]').filter({ hasText: /^\$/ })
const tile = (page: Page, name: string) => page.getByRole('group', { name: 'Key numbers' }).getByRole('button', { name: new RegExp(`^${name}`) })

test('revenue has a plot of its own under the visitors, with its own axis', async ({ page }) => {
  const chart = await open(page, 1280)
  await expect(page.locator('.overview-chart h2')).toHaveText('Visitors')
  await expect(chart.locator('.money-col').nth(3)).toBeAttached() // more than a few columns, once their chunk is here
  // $0, half, top: labelled in the left margin, no second axis on the right.
  await expect(axis(chart)).toHaveCount(3)
  expect(await axis(chart).first().getAttribute('x')).toBe('0')
  const box = (await chart.boundingBox())!
  const lowest = (await chart.locator('.money-col').last().boundingBox())!
  expect(lowest.y + lowest.height).toBeGreaterThan(box.y + box.height - 40) // under the line, above the dates
  await shot(page, 'split-1280')
})

test('one crosshair and one card span both plots, by pointer and by keyboard', async ({ page }) => {
  const chart = await open(page, 1280)
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.85) // over the revenue plot
  const tip = chart.locator('.chart-tip')
  await expect(tip).toBeVisible()
  await expect(tip.getByText('Visitors', { exact: true })).toBeVisible()
  await expect(tip.getByText('Revenue', { exact: true })).toBeVisible()
  const cursor = (await chart.locator('.cursor line').boundingBox())!
  expect(cursor.height).toBeGreaterThan(box.height * 0.8) // from the top of the line to the foot of the columns
  await shot(page, 'split-hover-1280')
  // The keyboard walks the same days, across both plots.
  await page.mouse.move(box.x - 40, box.y - 40)
  await expect(tip).toHaveCount(0)
  await chart.locator('svg[role="img"]').focus()
  await page.keyboard.press('End')
  await expect(tip.getByText('Revenue', { exact: true })).toBeVisible()
  expect((await chart.locator('.cursor line').boundingBox())!.height).toBeGreaterThan(box.height * 0.8)
})

test('the Revenue tile puts revenue on the main plot, and the address remembers it', async ({ page }) => {
  const chart = await open(page, 1280)
  await expect(tile(page, 'Revenue')).toHaveAttribute('aria-pressed', 'false')
  await tile(page, 'Revenue').click()
  await expect(tile(page, 'Revenue')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.overview-chart h2')).toHaveText('Revenue')
  expect(new URL(page.url()).searchParams.get('metric')).toBe('revenue')
  // Money on a $ axis, no visitors line and no second axis.
  await expect(axis(chart)).toHaveCount(3)
  await expect(chart.locator('.chart-line.money, .money-col').first()).toBeAttached()
  await expect(chart.locator('.chart-line:not(.money)')).toHaveCount(0)
  await shot(page, 'tile-1280')
  // A reload, or a shared address, keeps it; Visitors takes it back.
  await page.reload()
  await expect(tile(page, 'Revenue')).toHaveAttribute('aria-pressed', 'true')
  await tile(page, 'Visitors').click()
  await expect(page.locator('.overview-chart h2')).toHaveText('Visitors')
  expect(new URL(page.url()).searchParams.has('metric')).toBe(false)
})

test('every number in the strip can be the chart, each in its own units, and the address remembers it', async ({ page }) => {
  const chart = await open(page, 1280)
  const labels = chart.locator('svg text.num')
  for (const [name, id, unit] of [
    ['Conversion', 'conversion', /%$/],
    ['Per visitor', 'per-visitor', /^\$/],
    ['Bounce rate', 'bounce', /%$/],
    ['Session time', 'session', /^\d+m|s$/],
  ] as const) {
    await tile(page, name).click()
    await expect(tile(page, name)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.overview-chart h2')).toHaveText(name)
    expect(new URL(page.url()).searchParams.get('metric')).toBe(id)
    // Its axis is written in its unit, and never a negative one.
    await expect(labels.filter({ hasText: unit }).first()).toBeAttached()
    expect(await chart.locator('svg text').filter({ hasText: /^-/ }).count()).toBe(0)
  }
  await shot(page, 'session-1280')
  // Online now is last, and is not a chart.
  await expect(page.getByRole('group', { name: 'Key numbers' }).locator('.kpi').last()).toContainText('Online now')
})

test('a period only partly there before it has no change to show, never a giant percentage', async ({ page }) => {
  // The demo is 31 days old: the 30 days before this month hold only its first day.
  await open(page, 1280)
  await expect(page.getByRole('group', { name: 'Key numbers' }).locator('.kpi-delta')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Key numbers' })).not.toContainText(/\d{3,}%/)
})

test('revenue on the main plot is columns when sales are sparse', async ({ page }) => {
  await withSales(page, { at: 5, amount: 14_900 })
  const chart = await open(page, 1280, '?metric=revenue&compare=previous')
  await expect(chart.locator('.money-col')).toHaveCount(1)
  await expect(chart.locator('.chart-line')).toHaveCount(0)
  await expect(chart.getByText('$149', { exact: true })).toBeVisible() // the biggest sale, labelled
  await shot(page, 'tile-sparse-1280')
})

test('a period with one sale draws one column and labels it', async ({ page }) => {
  await withSales(page, { at: 5, amount: 14_900 })
  const chart = await open(page, 1280)
  await expect(chart.locator('.money-col')).toHaveCount(1)
  await expect(chart.getByText('$149', { exact: true })).toBeVisible()
  await expect(chart.getByText('No sales in this period')).toHaveCount(0)
  await shot(page, 'one-sale-1280')
})

test('a period with no sales says so once, quietly, and a day says "No sales"', async ({ page }) => {
  await withSales(page)
  const chart = await open(page, 1280)
  await expect(chart.getByText('No sales in this period')).toBeVisible()
  await expect(chart.locator('.money-col')).toHaveCount(0)
  await expect(axis(chart)).toHaveCount(1) // only the baseline is labelled
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await expect(chart.locator('.chart-tip').getByText('No sales')).toBeVisible()
  await shot(page, 'none-1280')
})

for (const colorScheme of ['dark', 'light'] as const) {
  test(`a phone gets a slim card over both plots, nothing spills sideways (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    const chart = await open(page, 390)
    const box = (await chart.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.85)
    await expect(chart.locator('.chart-tip.compact')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await shot(page, `split-390-${colorScheme}`)
  })
}

test('a share link without revenue never shows the tile or the plot; one with it does', async ({ browser, page }) => {
  await open(page, 1280)
  const site = await page.evaluate(async () => (await (await fetch('/api/v1/sites')).json()).sites[0].id as string)
  const make = async (revenue: boolean) => {
    const res = await page.request.post(`${BASE}/api/v1/sites/${site}/shares`, { headers: { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }, data: { name: `revenue ${revenue}`, revenue, days: 0 } })
    expect(res.ok()).toBe(true)
    return ((await res.json()) as { url: string }).url
  }
  for (const revenue of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const shared = await ctx.newPage()
    await shared.goto((await make(revenue)) + '')
    const chart = shared.locator('.overview-chart .chart-wrap')
    await expect(chart.locator('svg[role="img"]')).toBeVisible({ timeout: 20_000 })
    if (revenue) {
      await tile(shared, 'Revenue').click()
      await expect(shared.locator('.overview-chart h2')).toHaveText('Revenue')
    } else {
      // Even asked for by the address: the page shows visitors.
      await shared.evaluate(() => {
        history.pushState(null, '', '/s?metric=revenue')
        window.dispatchEvent(new Event('trckable:navigate'))
      })
      await expect(shared.locator('.overview-chart h2')).toHaveText('Visitors')
    }
    await expect(tile(shared, 'Revenue')).toHaveCount(revenue ? 1 : 0)
    await expect(tile(shared, 'Per visitor')).toHaveCount(revenue ? 1 : 0)
    if (!revenue) {
      await expect(chart.locator('.money-col')).toHaveCount(0)
      await expect(axis(chart)).toHaveCount(0)
    }
    await ctx.close()
  }
})
