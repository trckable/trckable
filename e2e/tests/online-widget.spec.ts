// The "online" widget on a customer's page: the corner script frames it, it
// shows "A few" while fewer than three people are on the site and the count
// once there are, and the visitor can close it. A site of its own, so no other
// suite's counts move.
import { expect, test } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('online-widget')
})

test('the corner pill renders on a customer page, follows the count, and can be closed', async ({ page, context }) => {
  test.setTimeout(100_000)
  test.skip(test.info().project.name !== 'chromium', 'one browser is enough: the server does the work')
  await context.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const domain = `online-${Date.now()}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.ok()).toBe(true)
  const site = ((await made.json()) as { id: string }).id
  // The part of `v` before the dot names the visitor.
  const visit = (id: string) => page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site, k: 'pv', u: `https://${domain}/`, id, v: `${id}.1` } })
  expect((await visit('ow1')).ok()).toBe(true)

  const look = { kind: 'online', theme: 'dark', shows: ['spark'] }
  const w = await page.request.post(`${API}/api/v1/sites/${site}/widgets`, { headers: H, data: look })
  expect(w.ok()).toBe(true)
  const id = ((await w.json()) as { id: string }).id
  // Saving a widget drops its cached numbers (a page reads itself again every
  // 30 s anyway), so this waits for the writer to have taken the visits in.
  const says = async (text: string) => {
    await page.request.put(`${API}/api/v1/sites/${site}/widgets/${id}`, { headers: H, data: { ...look, on: true } })
    return (await (await page.request.get(`${API}/w/${id}`)).text()).includes(text)
  }
  await expect.poll(() => says('A few online'), { timeout: 20_000 }).toBe(true)

  // The customer's own page, with the one line the settings gave (the suite's
  // test site writes it, as it does the install snippet).
  await page.goto(`http://127.0.0.1:18301/online/${id}`)
  const frame = page.frameLocator('iframe[title="People online"]')
  // One person: never a number, so a lone visitor cannot be picked out.
  await expect(frame.getByText('A few online')).toBeVisible({ timeout: 20_000 })
  await expect(frame.locator('.spark')).toHaveCount(0)

  // It stays out of the way: fixed in the corner, over nothing but the corner.
  const box = await page.locator('iframe[title="People online"]').boundingBox()
  const view = page.viewportSize()!
  expect(box!.x + box!.width).toBeGreaterThan(view.width - 40)
  expect(box!.y + box!.height).toBeGreaterThan(view.height - 40)

  // Three people make a number.
  expect((await visit('ow2')).ok()).toBe(true)
  expect((await visit('ow3')).ok()).toBe(true)
  await expect.poll(() => says('3 online'), { timeout: 20_000 }).toBe(true)
  // The page already open follows by itself: it reads itself again every 30 s.
  await expect(frame.getByText('3 online')).toBeVisible({ timeout: 50_000 })
  expect(await (await page.request.get(`${API}/w/${id}`)).text()).toContain('content="30"')

  // The visitor can close it.
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('iframe[title="People online"]')).toHaveCount(0)

  // Off, it is nowhere: the script is not found, so nothing is drawn.
  await page.request.put(`${API}/api/v1/sites/${site}/widgets/${id}`, { headers: H, data: { ...look, on: false } })
  expect((await page.request.get(`${API}/js/${id}.online.js`)).status()).toBe(404)
})
