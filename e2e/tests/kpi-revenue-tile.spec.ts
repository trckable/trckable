// The key numbers' small marks: each tile carries one before its name, and an
// owner without a connected provider sees a dimmed Revenue tile in the second
// place, as wide as the others, where the money numbers will stand. It opens
// the card of providers, and is gone once the report carries money.
import { expect, test } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session, withoutPayments } from './session'

// Set KPI_SHOTS to a folder to also take the pictures for review.
const SHOTS = process.env.KPI_SHOTS

const MONEY = { currency: 'USD', exponent: 2, revenue: 12_300, refunds: 0, payments: 3, customers: 3, paying_visitors: 3, conversion: 0.5, revenue_per_visitor: 4100, new_revenue: 12_300, renewal_revenue: 0, unattributed: 0, unconverted: 0 }

// A report fetch still on its way when the test ends is let go, not reported as an error of the run.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('a dimmed Revenue tile stands in the second place for an owner without payments', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('kpi-revenue-tile'), url: API }])
  await withoutPayments(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${API}/example.com?view=data`)
  const tiles = page.getByRole('group', { name: 'Key numbers' })
  await expect(tiles.locator('.kpi .value.num').first()).toBeVisible()
  // Visitors, Revenue, Pageviews, Bounce rate and Session time.
  await expect(tiles.locator('.kpi')).toHaveCount(5)
  // A mark before every name.
  await expect(tiles.locator('.kpi-ico svg')).toHaveCount(5)
  const tile = tiles.getByRole('button', { name: /^Revenue/ })
  await expect(tile).toBeVisible()
  await expect(tiles.locator('.kpi').nth(1)).toHaveText(/^Revenue/)

  // As wide as its neighbour, and in the same row.
  const [r, v] = await Promise.all([tile.boundingBox(), tiles.getByRole('button', { name: /^Visitors/ }).boundingBox()])
  expect(Math.abs(r!.width - v!.width)).toBeLessThan(1)
  expect(Math.abs(r!.y - v!.y)).toBeLessThan(1)

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.waitForTimeout(400) // the theme changes a moment after the media does
      await page.locator('section.overview').screenshot({ path: `${SHOTS}/kpi-revenue-1280-${scheme}.png` })
    }
    await page.setViewportSize({ width: 390, height: 900 })
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.waitForTimeout(400) // the theme changes a moment after the media does
      await page.locator('section.overview').screenshot({ path: `${SHOTS}/kpi-revenue-390-${scheme}.png` })
    }
    await page.setViewportSize({ width: 1280, height: 900 })
  }

  // It opens the card of providers; Connect leads to Settings → Payments.
  await tile.click()
  const card = page.getByRole('complementary', { name: 'Revenue' })
  await expect(card.getByRole('button')).toHaveCount(7) // five providers, Close and its X
  await card.getByRole('button', { name: 'Connect Paddle' }).click()
  const settings = page.getByRole('dialog', { name: /^Settings for/ })
  await expect(settings).toBeVisible()
  await expect(settings.getByRole('tab', { name: /Payments/ })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')

  // With a provider connected (the report carries money) it is gone.
  await page.route(/\/api\/v1\/sites\/[^/]+\/modules$/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    for (const m of body.modules) if (m.id === 'revenue') m.enabled = true
    await route.fulfill({ response: res, json: body })
  })
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\?/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    for (const x of [body.current, body.previous]) if (x) x.money = MONEY
    await route.fulfill({ response: res, json: body })
  })
  await page.goto(`${API}/example.com?view=data`)
  await expect(tiles.locator('.kpi')).toHaveCount(7)
  await expect(tiles.locator('.kpi-ico svg')).toHaveCount(6)
  await expect(tiles.getByRole('button', { name: /^Revenue/ })).toHaveClass(/^(?!.*dim)/)
  if (SHOTS) await page.locator('section.overview').screenshot({ path: `${SHOTS}/kpi-revenue-1280-money.png` })
})
