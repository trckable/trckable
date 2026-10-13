// All sites: the View menu changes the layout and what is shown, the choice is
// in the address, and it is still there on the next visit.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }

test('the View menu changes the layout and the lens, and the choice survives a reload', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('all-sites-view'), url: API }])
  const tag = Date.now()
  for (let i = 0; i < 2; i++) {
    const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `view${i}-${tag}.view.example.org` } })
    expect(made.ok()).toBe(true)
  }
  // Two payments-connected sites, so the Revenue lens is offered.
  await page.route('**/api/v1/overview*', async (route) => {
    const res = await route.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    body.sites.forEach((s, n) => Object.assign(s, { revenue: 5000 + n * 1000, currency: 'USD', exponent: 2 }))
    await route.fulfill({ response: res, json: body })
  })

  await page.goto(`${API}/all`)
  await expect(page.locator('.nx-today')).toBeVisible({ timeout: 20_000 })
  const summary = page.locator('.all-head p')
  await expect(summary).toContainText('Last 30 days · Visitors')

  const view = page.getByRole('button', { name: 'View', exact: true })
  await view.click()
  await page.getByRole('menuitemradio', { name: 'Table' }).click()
  await page.getByRole('menuitemradio', { name: 'Revenue' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.nx-table')).toBeVisible()
  await expect(summary).toContainText('Last 30 days · Revenue')
  await expect(page).toHaveURL(/layout=table/)
  await expect(page).toHaveURL(/lens=revenue/)

  // A visit without the address remembers the last choice.
  await page.goto(`${API}/all`)
  await expect(page.locator('.nx-table')).toBeVisible({ timeout: 20_000 })
  await expect(summary).toContainText('Revenue')

  // Reset puts the page back as it starts.
  await view.click()
  await page.getByRole('menuitem', { name: 'Reset' }).click()
  await expect(page.locator('.nx-today')).toBeVisible()
  await expect(summary).toContainText('Last 30 days · Visitors')
  await page.reload()
  await expect(page.locator('.nx-today')).toBeVisible({ timeout: 20_000 })
})
