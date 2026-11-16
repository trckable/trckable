// The badge by a section's title on a shared page: the logo of the provider that vouches for the numbers, "Verified"
// and a check, on Sales only where the link shows money. Stripe is real here (verified-kit: connected, one signed
// sale). Run at 1440 and at 390 (VERIFIED_WIDTH); VERIFIED_SHOTS=<dir> also takes the pictures.
import { mkdirSync } from 'node:fs'
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { H, newSite, type TestSite } from './audit-kit'
import { stripeSale } from './verified-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')
test.describe.configure({ mode: 'serial' })

const SHOTS = process.env.VERIFIED_SHOTS
const WIDTH = Number(process.env.VERIFIED_WIDTH ?? 1440)

let site: TestSite
let openLink = ''
let moneyLink = ''

test.beforeAll(async ({ browser }) => {
  const page = await (await browser.newContext()).newPage()
  site = await newSite(page, 'verified-title')
  await stripeSale(page.request, site.id)
  const link = async (revenue: boolean) => {
    const made = await page.request.post(`${API}/api/v1/sites/${site.id}/shares`, { headers: H, data: { name: revenue ? 'with money' : 'open', revenue } })
    expect(made.ok()).toBe(true)
    return ((await made.json()) as { url: string }).url
  }
  openLink = await link(false)
  moneyLink = await link(true)
  await page.context().close()
})

test('a link with money badges Sales with the provider, and the badge stays on one line', async ({ page }) => {
  await page.setViewportSize({ width: WIDTH, height: 700 })
  await page.goto(`${moneyLink}?x=sales`)
  const row = page.locator('.xtb')
  const badge = row.locator('[data-verified-source]')
  await expect(badge).toHaveAttribute('data-verified-source', 'stripe')
  await expect(badge).toHaveText('Verified')
  await expect(badge.locator('svg.vf-logo')).toBeVisible()
  // The title row stays one line high.
  const box = await row.boundingBox()
  expect(box!.height).toBeLessThan(60)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/shared-sales-${WIDTH}-${scheme}.png`, clip: { x: 0, y: 0, width: WIDTH, height: 360 } })
  }
})

test('a link without money has no Sales, so no badge', async ({ page }) => {
  await page.goto(`${openLink}?x=sales`)
  await expect(page.locator('[data-xtitle]').first()).toBeVisible()
  await expect(page.locator('[data-verified-source]')).toHaveCount(0)
})
