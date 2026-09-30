// A module that is off takes its way in with it: with Goals off the Create
// menu offers no goal, and the key still opens it for what is left. A site
// of its own, so the suites that count goals on example.com never see it off.
import { expect, test, type Page } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
let cookie = ''
test.beforeAll(async () => {
  cookie = await session('modules')
})

async function createMenu(page: Page) {
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('a')
  const menu = page.getByRole('menu', { name: 'Create something' })
  await expect(menu).toBeVisible()
  return menu
}

test('Goals off: Create has no Goal', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const domain = `modules-${Date.now()}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.ok()).toBe(true)
  const site = ((await made.json()) as { id: string }).id
  // One visit, so the header is past waiting for the first one.
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
  const pv = await page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site, k: 'pv', u: `https://${domain}/` } })
  expect(pv.ok()).toBe(true)
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites/${site}/events?limit=1`, { headers: H })).json()) as { events: unknown[] }).events.length, { timeout: 15_000 }).toBe(1)

  await page.goto(`${API}/${domain}?view=data`)
  let menu = await createMenu(page)
  await expect(menu.locator('[data-create=goal]')).toBeVisible()
  await expect(menu.locator('[data-create=site]')).toHaveCount(0)
  await page.keyboard.press('Escape')

  const off = await page.request.put(`${API}/api/v1/sites/${site}/modules/goals`, { headers: H, data: { enabled: false } })
  expect(off.ok()).toBe(true)
  await page.reload()
  menu = await createMenu(page)
  await expect(menu.locator('[data-create=note]')).toBeVisible()
  await expect(menu.locator('[data-create=goal]')).toHaveCount(0)
})
