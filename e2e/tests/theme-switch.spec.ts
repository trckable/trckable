// The theme changes smoothly: no reload, no flash on the first frame, and the
// chart is not redrawn or re-animated when the colours change.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('theme-switch'), url: API }])
})

test('the saved theme is applied before the dashboard renders', async ({ page }) => {
  // A script of its own, before the app's: the app comes after the first frame.
  const html = await (await page.request.get(`${API}/`)).text()
  expect(html.indexOf('src="/theme.js"')).toBeGreaterThan(-1)
  expect(html.indexOf('src="/theme.js"')).toBeLessThan(html.indexOf('type="module"'))
  const js = await page.request.get(`${API}/theme.js`)
  expect(js.ok()).toBe(true)
  expect(js.headers()['content-type']).toContain('javascript')

  await page.addInitScript(() => localStorage.setItem('trckable:theme', 'light'))
  // Hold the app's own script back: what is on screen then is only what the first script set.
  await page.route(/\/assets\/(?:index|core)-[^/]+\.js$/, (route) => new Promise<void>((resolve) => setTimeout(() => resolve(route.continue()), 1500)))
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data`, { waitUntil: 'commit' })
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')
  expect(await page.evaluate(() => document.querySelector('.kpis') === null)).toBe(true)
})


