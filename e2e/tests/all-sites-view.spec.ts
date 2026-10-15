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

  await page.goto(`${API}/sites`)
  await expect(page.locator('.nx-today')).toBeVisible({ timeout: 20_000 })
  const summary = page.locator('.all-head p')
  await expect(summary).toContainText('Today · Visitors') // the overview's numbers are today's; the period draws the sparklines

  const view = page.getByRole('button', { name: 'View', exact: true })
  await view.click()
  await page.getByRole('radio', { name: 'Table' }).click()
  await page.getByRole('radio', { name: 'Revenue' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.nx-table')).toBeVisible()
  await expect(summary).toContainText('Last 30 days · Revenue')
  await expect(page).toHaveURL(/layout=table/)
  await expect(page).toHaveURL(/lens=revenue/)

  // A visit without the address remembers the last choice.
  await page.goto(`${API}/sites`)
  await expect(page.locator('.nx-table')).toBeVisible({ timeout: 20_000 })
  await expect(summary).toContainText('Revenue')

  // The period is its own pill beside the menu, not in it.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Last 30 days' }).click()
  await page.getByRole('menuitemradio', { name: 'Last 7 days' }).click()
  await expect(summary).toContainText('Last 7 days')
  await expect(page).toHaveURL(/period=7/)

  // Reset puts the page back as it starts.
  await view.click()
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.locator('.nx-today')).toBeVisible()
  await expect(summary).toContainText('Today · Visitors') // the overview's numbers are today's; the period draws the sparklines
  await page.reload()
  await expect(page.locator('.nx-today')).toBeVisible({ timeout: 20_000 })
})

test('the Uptime card on the Overview opens the Uptime view', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('all-sites-uptime-card'), url: API }])
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `card-${Date.now()}.view.example.org` } })
  expect(made.ok()).toBe(true)
  await page.goto(`${API}/all?layout=overview&lens=visitors`)
  const card = page.locator('.nx-strip .nx-card', { hasText: 'Uptime' })
  await expect(card).toContainText('No incidents', { timeout: 20_000 })
  await card.click()
  await expect(page).toHaveURL(/lens=uptime/)
  await expect(page.locator('.up-wrap')).toBeVisible()
  await expect(page.locator('.all-head p')).toContainText('Uptime')
})

test('on Uptime the View menu has no Layout, and every period changes the day strip', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('all-sites-uptime-menu'), url: API }])
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `menu-${Date.now()}.view.example.org` } })
  expect(made.ok()).toBe(true)
  await page.goto(`${API}/sites?lens=uptime&period=30`)
  const days = page.locator('.up-row').first().locator('.strip i')
  await expect(days).toHaveCount(30, { timeout: 20_000 })
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Show' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Layout' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  for (const [name, n] of [['Last 7 days', 7], ['Last 90 days', 90], ['Last 12 months', 365]] as const) {
    await page.getByRole('button', { name: /^Last / }).first().click()
    await page.getByRole('menuitemradio', { name }).click()
    await expect(days).toHaveCount(n)
  }
  // Back on the numbers, Layout is there again.
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('radio', { name: 'Visitors' }).click()
  await expect(page.getByRole('group', { name: 'Layout' })).toBeVisible()
})
