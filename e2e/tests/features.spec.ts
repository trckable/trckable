// The Features pop-up: it opens from the avatar menu, the E key and a link,
// searches, switches a module on for an owner, traps focus, closes on Escape,
// and fills a phone's screen. A site of its own, so no other suite sees its
// modules change. FEATURES_SHOTS=<dir> also saves the screenshots.
import { expect, test, type Page } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
let cookie = ''
test.beforeAll(async () => {
  cookie = await session('features')
})

async function site(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const domain = `features-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.ok()).toBe(true)
  const id = ((await made.json()) as { id: string }).id
  const pv = await page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: id, k: 'pv', u: `https://${domain}/` } })
  expect(pv.ok()).toBe(true)
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites/${id}/events?limit=1`, { headers: H })).json()) as { events: unknown[] }).events.length, { timeout: 15_000 }).toBe(1)
  return { domain, id }
}

const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(400) // the pop-up fades in
  if (process.env.FEATURES_SHOTS) await page.screenshot({ path: `${process.env.FEATURES_SHOTS}/${name}.png` })
}

test('opens from the avatar menu, searches, switches a module on, and closes on Escape', async ({ page }) => {
  const { domain, id } = await site(page)
  await page.goto(`${API}/${domain}?view=data`)
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: /^Features/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Features', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.feat')).toHaveCount(45)
  await page.emulateMedia({ colorScheme: 'dark' })
  await shot(page, 'features-1280-dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await shot(page, 'features-1280-light')
  await page.emulateMedia({ colorScheme: 'dark' })

  await dialog.getByRole('searchbox', { name: 'Search features' }).fill('heatmaps')
  await expect(dialog.locator('.feat')).toHaveCount(1)
  const card = dialog.locator('#feat-heatmaps')
  await expect(card.locator('.tag')).toHaveText('Try it')
  await card.getByRole('switch', { name: 'Heatmaps' }).click()
  await expect(card.locator('.tag')).toHaveText('On')
  const mods = (await (await page.request.get(`${API}/api/v1/sites/${id}/modules`, { headers: H })).json()) as { modules: { id: string; enabled: boolean }[] }
  expect(mods.modules.find((m) => m.id === 'heatmaps')?.enabled).toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Account' })).toBeFocused()
})

test('opens from its key and a link, keeps focus inside, and finds nothing for nonsense', async ({ page }) => {
  const { domain } = await site(page)
  await page.goto(`${API}/${domain}?view=data`)
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('e')
  const dialog = page.getByRole('dialog', { name: 'Features', exact: true })
  await expect(dialog).toBeVisible()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
  }
  await dialog.getByRole('searchbox').fill('zzzzzz')
  await expect(dialog.locator('.feat')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await page.goto(`${API}/${domain}?view=data&features`)
  await expect(page.getByRole('dialog', { name: 'Features', exact: true })).toBeVisible()
})

test('is the whole screen on a phone, and Open goes where the feature lives', async ({ page }) => {
  const { domain } = await site(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${API}/${domain}?view=data&features=`)
  const dialog = page.getByRole('dialog', { name: 'Features', exact: true })
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  expect(box?.width).toBe(390)
  expect(Math.round(box?.height ?? 0)).toBe(844)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await shot(page, 'features-390')
  await dialog.getByRole('searchbox').fill('widgets')
  await dialog.getByRole('button', { name: 'Open: Widgets' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: /Settings for/ })).toBeVisible()
})
