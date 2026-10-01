// The key numbers' small marks: each tile carries one before its name, and an
// owner without a connected provider sees a quiet payments icon in the strip's
// free room, bottom right. It opens Settings → Payments, it is gone once the
// report carries money, and it is hidden where the tiles wrap and there is
// no free room.
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session } from './session'

// Set KPI_SHOTS to a folder to also take the pictures for review.
const SHOTS = process.env.KPI_SHOTS

const MONEY = { currency: 'USD', exponent: 2, revenue: 12_300, refunds: 0, payments: 3, customers: 3, paying_visitors: 3, conversion: 0.5, revenue_per_visitor: 4100, new_revenue: 12_300, renewal_revenue: 0, unattributed: 0, unconverted: 0 }

test('a quiet payments icon sits in the free room of the strip, for an owner without payments', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('kpi-pay-hint'), url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${API}/example.com?view=data`)
  const tiles = page.getByRole('group', { name: 'Key numbers' })
  await expect(tiles.locator('.kpi .value.num').first()).toBeVisible()
  // A mark before every name but Online now, which has its live dot.
  await expect(tiles.locator('.kpi-ico svg')).toHaveCount(4)
  const hint = tiles.getByRole('button', { name: 'Connect payments to see revenue' })
  await expect(hint).toBeVisible()

  // Bottom right of the strip, clear of the last tile.
  const [h, strip, last] = await Promise.all([hint.boundingBox(), tiles.boundingBox(), tiles.locator('.kpi').last().boundingBox()])
  expect(h!.x).toBeGreaterThanOrEqual(last!.x + last!.width)
  expect(h!.x + h!.width).toBeLessThanOrEqual(strip!.x + strip!.width)
  expect(strip!.x + strip!.width - (h!.x + h!.width)).toBeLessThanOrEqual(24)
  expect(strip!.y + strip!.height - (h!.y + h!.height)).toBeLessThanOrEqual(24)

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.locator('section.overview').screenshot({ path: `${SHOTS}/kpi-hint-1280-${scheme}.png` })
    }
    await page.setViewportSize({ width: 390, height: 900 })
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.locator('section.overview').screenshot({ path: `${SHOTS}/kpi-hint-390-${scheme}.png` })
    }
    await page.setViewportSize({ width: 1280, height: 900 })
  }

  // Where the tiles wrap there is no free room: hidden.
  await page.setViewportSize({ width: 390, height: 900 })
  await expect(hint).toBeHidden()
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(hint).toBeVisible()

  // It opens Settings → Payments.
  await hint.click()
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
    for (const r of [body.current, body.previous]) if (r) r.money = MONEY
    await route.fulfill({ response: res, json: body })
  })
  await page.goto(`${API}/example.com?view=data`)
  await expect(tiles.locator('.kpi')).toHaveCount(7)
  await expect(tiles.locator('.kpi-ico svg')).toHaveCount(6)
  await expect(hint).toHaveCount(0)
  if (SHOTS) await page.locator('section.overview').screenshot({ path: `${SHOTS}/kpi-hint-1280-revenue.png` })
})
