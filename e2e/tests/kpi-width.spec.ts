// The key numbers keep one width: a tile is as wide without payments (six
// tiles, one of them the dimmed Revenue tile) as with them (seven), and the
// free room sits at the right instead of the six stretching across the whole
// row. Wrapping on a tablet and a phone is unchanged, so the check runs at each
// width.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session, withoutPayments } from './session'

// Set KPI_SHOTS to a folder to also take the pictures for review.
const SHOTS = process.env.KPI_SHOTS

const MONEY = { currency: 'USD', exponent: 2, revenue: 12_300, refunds: 0, payments: 3, customers: 3, paying_visitors: 3, conversion: 0.5, revenue_per_visitor: 4100, new_revenue: 12_300, renewal_revenue: 0, unattributed: 0, unconverted: 0 }

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('kpi-width'), url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

// A report fetch still on its way when the test ends is let go, not reported as an error of the run.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

/** The Data view, with payments connected (the report carries money) or without. */
async function open(page: Page, width: number, revenue: boolean) {
  await page.setViewportSize({ width, height: 900 })
  if (!revenue) await withoutPayments(page)
  if (revenue) {
    // The revenue module is off until a provider is connected: switch it on, and give the report its money.
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
  }
  await page.goto(`${API}/example.com?view=data`)
  const tiles = page.getByRole('group', { name: 'Key numbers' })
  await expect(tiles.locator('.kpi .value.num').first()).toBeVisible()
  // Without payments an owner has the dimmed Revenue tile in the money numbers' place: six.
  await expect(tiles.locator('.kpi')).toHaveCount(revenue ? 7 : 6)
  return tiles
}

const box = async (page: Page, width: number, revenue: boolean) => {
  const tiles = await open(page, width, revenue)
  const first = await tiles.locator('.kpi').first().boundingBox()
  const strip = await tiles.boundingBox()
  const last = await tiles.locator('.kpi').last().boundingBox()
  return { tile: first!.width, strip: strip!, last: last! }
}

for (const width of [1280, 1024, 768, 390]) {
  test(`a tile is as wide without revenue as with it, at ${width}`, async ({ page }) => {
    const without = await box(page, width, false)
    const withRev = await box(page, width, true)
    expect(Math.abs(without.tile - withRev.tile)).toBeLessThan(1)
    // The six do not stretch across the strip when seven would fit: the room is on the right.
    if (width >= 1024) expect(without.last.x + without.last.width).toBeLessThan(without.strip.x + without.strip.width - without.tile / 2)
  })
}

test('the charted tile keeps its underline without revenue', async ({ page }) => {
  const tiles = await open(page, 1280, false)
  const lit = tiles.getByRole('button', { name: /^Visitors/ })
  await expect(lit).toHaveAttribute('aria-pressed', 'true')
  expect(await lit.evaluate((el) => getComputedStyle(el, '::after').content)).not.toBe('none')
})

test('pictures for review', async ({ page }) => {
  test.skip(!SHOTS, 'set KPI_SHOTS to a folder')
  mkdirSync(SHOTS!, { recursive: true })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  const name = process.env.KPI_NAME ?? 'shot'
  const tiles = await open(page, 1280, false)
  await page.locator('section.overview').screenshot({ path: `${SHOTS}/${name}-1280-dark.png` })
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(tiles).toBeVisible()
    await page.locator('section.overview').screenshot({ path: `${SHOTS}/${name}-${width}-dark.png` })
  }
})
