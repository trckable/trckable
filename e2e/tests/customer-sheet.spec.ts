// A customer opened from Sales > Customers floats over the list: the list stays in the page beneath a dimmed, blurred backdrop.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the sheet')

const MONEY = { currency: 'USD', exponent: 2, revenue: 12_300, refunds: 0, payments: 3, customers: 3, paying_visitors: 3, conversion: 0.5, revenue_per_visitor: 4100, new_revenue: 12_300, renewal_revenue: 0, unattributed: 0, unconverted: 0 }
const CUSTOMER = { id: 'c1', spent: 9_000, orders: 2, country: 'US', first_seen: '2026-10-01T10:00:00Z', last_order: '2026-10-20T10:00:00Z', name: 'Ada Buyer', known: true }
const DETAIL = { name: 'Ada Buyer', email: 'ada@example.com', payments: [{ id: 'p1', at: '2026-10-20T10:00:00Z', amount: 9_000, kind: 'new' }], licenses: [] }

async function fake(page: Page) {
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
  await page.route(/\/sales\/customers\/c1/, (route) => route.fulfill({ json: DETAIL }))
  await page.route(/\/sales\/customers\?/, (route) => route.fulfill({ json: { customers: [CUSTOMER], total: 1 } }))
}

for (const width of [1440, 390]) {
  test(`a customer opens over the list, which stays in the page, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.context().addCookies([{ name: 'trckable_session', value: await session('customer-sheet'), url: API }])
    await fake(page)
    await page.goto(`${API}/${HISTORY_DOMAIN}?period=7d&x=customers`)
    const row = page.locator('button[title="Open this customer"]')
    await row.evaluate((el) => el.scrollIntoView())
    await row.click()
    const dialog = page.getByRole('dialog', { name: 'Customer' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Ada Buyer')
    // The list is still rendered and shown beneath the backdrop, not put away.
    await expect(row).toBeVisible()
    await expect(page.locator('#xp.on')).toBeVisible()
    await expect(page.locator('.modal-back:has(.cust-dialog)')).toHaveCSS('backdrop-filter', /blur\(4px\)/)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(row).toBeVisible()
  })
}
