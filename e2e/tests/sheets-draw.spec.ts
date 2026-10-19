// Every Explore sheet (?x=<tab>) opens without the error boundary, today and on the other short ranges, with money
// and without, on a desktop and a phone. The tabs come from the dashboard's own list, so a new one is swept too.
import { expect, test, type Page } from './fixtures'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session, withoutPayments } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the sheets')

const MONEY = { currency: 'USD', exponent: 2, revenue: 12_300, refunds: 0, payments: 3, customers: 3, paying_visitors: 3, conversion: 0.5, revenue_per_visitor: 4100, new_revenue: 12_300, renewal_revenue: 0, unattributed: 0, unconverted: 0 }
const SALES = { pages: [{ value: '/pricing', visitors: 0, customers: 2, revenue: 9_000 }, { value: '/', visitors: 0, revenue: 3_300 }], currency: 'USD', exponent: 2 }

// Every tab the dashboard lists (the EVERY table of v2/explore/sections.ts).
const SECTIONS = readFileSync(resolve(fileURLToPath(new URL('.', import.meta.url)), '../../dashboard/src/v2/explore/sections.ts'), 'utf8')
const TABS = [...(/const EVERY[^=]*=\s*\{([\s\S]*?)\n\}/.exec(SECTIONS)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1])
const PERIODS = ['today', 'yesterday', '7d']

async function withPayments(page: Page) {
  await page.route(/\/api\/v1\/sites\/[^/]+\/modules$/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    for (const m of body.modules) if (m.id === 'revenue') m.enabled = true
    await route.fulfill({ response: res, json: body })
  })
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\?/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    for (const r of [body.current, body.previous]) if (r) r.money = MONEY
    await route.fulfill({ response: res, json: body })
  })
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\/pages-sell/, (route) => route.fulfill({ json: SALES }))
}

test('the list of tabs was read', () => {
  expect(TABS).toEqual(expect.arrayContaining(['overview', 'sells', 'earners', 'buyers', 'sales', 'pages']))
})

for (const money of [true, false]) {
  for (const width of [1440, 390]) {
    test(`every sheet opens, ${money ? 'with' : 'without'} payments, at ${width}px`, async ({ page }) => {
      test.setTimeout(480_000)
      await page.setViewportSize({ width, height: 900 })
      await page.context().addCookies([{ name: 'trckable_session', value: await session('sheets-draw'), url: API }])
      if (money) await withPayments(page)
      else await withoutPayments(page)
      const thrown: string[] = []
      page.on('pageerror', (e) => thrown.push(e.message))
      for (const period of PERIODS) {
        for (const tab of TABS) {
          // sells first on the first period: the address that was reported broken.
          await page.goto(`${API}/${HISTORY_DOMAIN}?period=${period}&x=${tab}`)
          await expect(page.locator('#xp.on'), `${tab} ${period}`).toBeVisible({ timeout: 20_000 })
          await expect(page.getByText(/Couldn.t draw this/), `${tab} ${period}: ${thrown.join(' | ')}`).toHaveCount(0)
        }
      }
      expect(thrown).toEqual([])
    })
  }
}
