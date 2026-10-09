// Settings → Payments: connecting starts with a search box and the most used
// providers; typing finds the rest, and the custom connection is the last line.
// Set PAY_PICKER_SHOTS to a folder to also take the pictures for review.
import { mkdirSync } from 'node:fs'
import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const SHOTS = process.env.PAY_PICKER_SHOTS

/** The pictures for review: wide and light, phone and dark. */
async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  const was = page.viewportSize()!
  for (const [w, h, scheme] of [[1440, 900, 'light'], [390, 844, 'dark']] as const) {
    await page.setViewportSize({ width: w, height: h })
    await page.emulateMedia({ colorScheme: scheme })
    await page.screenshot({ path: `${SHOTS}/${name}-${w}-${scheme}.png` })
  }
  await page.setViewportSize(was)
  await page.emulateMedia({ colorScheme: null })
}

async function open(page: Page, context: BrowserContext) {
  await context.addCookies([{ name: 'trckable_session', value: await session('pay-picker'), url: API }])
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `pick-${Date.now()}.example.org` } })
  const site = ((await made.json()) as { id: string }).id
  await page.request.put(`${API}/api/v1/sites/${site}/modules/revenue`, { headers: H, data: { enabled: true } })
  await page.goto(`${API}/settings?site=${site}&tab=payments`)
  return page.getByRole('searchbox', { name: /Search providers/ })
}

test('the picker shows the most used providers, finds the rest, and opens the provider\'s own connect step', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'chromium', 'one browser is enough: plain markup')
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  const search = await open(page, context)
  const pay = page.locator('#payments')
  for (const n of ['Stripe', 'Paddle', 'Lemon Squeezy', 'Polar']) await expect(pay.getByRole('button', { name: new RegExp(`^${n}`) })).toBeVisible()
  await expect(pay.getByRole('button', { name: /^Dodo/ })).toHaveCount(0)
  await expect(pay.getByRole('button', { name: 'Not listed? Use the custom connection.' })).toBeVisible()
  await shoot(page, 'tiles')

  await search.fill('pay')
  const results = pay.locator('.pay-pick-list')
  await expect(results.getByRole('button', { name: 'Paddle' })).toBeVisible()
  await expect(results.getByRole('button', { name: /PayPal/ })).toHaveCount(0)
  await shoot(page, 'results')

  await search.fill('apple pay')
  await expect(pay.getByText('Apple Pay and Google Pay come through your provider.')).toBeVisible()

  await search.fill('zzzz')
  await expect(pay.getByText('No provider matches.')).toBeVisible()
  await expect(pay.getByRole('button', { name: 'Not listed? Use the custom connection.' })).toBeVisible()
  await shoot(page, 'empty')

  await search.fill('padd')
  await search.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Connect Paddle' })).toBeVisible()
})

test('the custom line opens the custom connection', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'chromium', 'one browser is enough: plain markup')
  await open(page, context)
  await page.locator('#payments').getByRole('button', { name: 'Not listed? Use the custom connection.' }).click()
  await expect(page.getByRole('dialog', { name: 'Connect anything' })).toBeVisible()
})
