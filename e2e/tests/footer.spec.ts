// Explore and Live have no foot: what it held is under the avatar, in the site selector and in the header.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
let cookie = ''
test.beforeAll(async () => {
  cookie = await session('footer')
})

// The sites made here are taken away again: an unreachable one would turn up (as "Not reachable") in the site list other specs read.
const made: { id: string; domain: string }[] = []
test.afterEach(async ({ request }) => {
  for (const s of made.splice(0)) await request.delete(`${API}/api/v1/sites/${s.id}`, { headers: { ...H, Cookie: `trckable_session=${cookie}` }, data: { domain: s.domain } })
})

const open = async (page: import('@playwright/test').Page) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const res = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `footer-${Date.now()}.example.org` } })
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as { site?: { id: string; domain: string } } & { id?: string; domain?: string }
  made.push(body.site ?? { id: body.id!, domain: body.domain! })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d`)
  await expect(page.locator('#xp.on')).toBeVisible({ timeout: 20_000 })
}

test('Explore has no foot: Docs, What’s new and Feedback are under the avatar, and Feedback sends a note', async ({ page }) => {
  await open(page)
  await expect(page.locator('.app-footer > span:visible')).toHaveCount(0)
  await expect(page.locator('.xrail-ver')).toHaveCount(0)
  await page.locator('.account-btn').click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Docs' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: /^What’s new/ })).toContainText(/v\d+\.\d+\.\d+/)
  const note = `Footer note ${Date.now()}`
  await menu.getByRole('menuitem', { name: 'Feedback' }).click()
  const dialog = page.getByRole('dialog', { name: 'Feedback' })
  await dialog.getByRole('textbox', { name: 'Your feedback' }).fill(note)
  await dialog.getByRole('button', { name: 'Send' }).click()
  await expect(dialog).toBeHidden()
  const read = await page.request.get(`${API}/api/v1/admin/feedback`)
  const list = ((await read.json()) as { feedback: { message: string }[] }).feedback
  expect(list.map((f) => f.message)).toContain(note)
})

test('a quiet site is told in the site selector', async ({ page }) => {
  await page.route('**/api/v1/sites', async (route) => {
    const res = await route.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    const last = Math.floor(Date.now() / 1000) - 10 * 3600
    body.sites = body.sites.map((s, i) => (i === 0 ? { ...s, last_event_at: last, check: { at: Math.floor(Date.now() / 1000) }, watched_since: last - 86400 } : s))
    await route.fulfill({ response: res, json: body })
  })
  await open(page)
  await page.locator('#siteBtn').click()
  await expect(page.locator('[data-site-why]')).toHaveText('1 site quiet')
})

test('a release this browser has not seen shows in the header', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tkb_latest', JSON.stringify({ v: '99.0.0', at: Date.now() })))
  await open(page)
  await expect(page.locator('.update-pill')).toContainText('v99.0.0')
  await page.locator('.update-pill').click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('on a phone nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})
