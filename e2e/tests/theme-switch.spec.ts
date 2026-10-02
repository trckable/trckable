// The theme changes smoothly: no reload, no flash on the first frame, and the
// chart is not redrawn or re-animated when the colours change.
import { expect, test } from '@playwright/test'
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
  await page.route(/\/assets\/index-[^/]+\.js$/, (route) => new Promise<void>((resolve) => setTimeout(() => resolve(route.continue()), 1500)))
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data`, { waitUntil: 'commit' })
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')
  expect(await page.evaluate(() => document.querySelector('.kpis') === null)).toBe(true)
})

test('switching the theme does not reload, and does not redraw or re-animate the chart', async ({ page }) => {
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data`)
  const chart = page.locator('.overview-chart .chart-wrap svg[role="img"]')
  await expect(chart).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1500) // its own entrance is over
  await page.evaluate(() => {
    const w = window as unknown as { __same: number; __chart: Element | null }
    w.__same = 1
    w.__chart = document.querySelector('.overview-chart .chart-wrap svg[role="img"]')
  })

  await page.getByRole('button', { name: 'Account' }).click()
  const themed = async (name: RegExp, theme: string) => {
    await page.getByRole('menuitemradio', { name }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? 'system')).toBe(theme)
  }
  await themed(/^Light$/, 'light')
  const afterLight = await page.evaluate(() => {
    const w = window as unknown as { __same?: number; __chart: Element | null }
    return { same: w.__same, node: w.__chart === document.querySelector('.overview-chart .chart-wrap svg[role="img"]') }
  })
  expect(afterLight).toEqual({ same: 1, node: true })

  // Once the switch is over nothing in the chart is animating, and the mark of the switch is gone.
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-theme-switch'))).toBe(false)
  expect(await page.evaluate(() => document.querySelector('.overview-chart .chart-wrap')!.getAnimations({ subtree: true }).length)).toBe(0)
})

test('with reduced motion the theme changes at once, with no transition at all', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data`)
  await expect(page.locator('.overview-chart .chart-wrap svg[role="img"]')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Account' }).click()
  const marks: string[] = await page.evaluate(() => {
    const seen: string[] = []
    new MutationObserver(() => seen.push(document.documentElement.dataset.themeSwitch ?? '')).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-switch'] })
    ;(window as unknown as { __seen: string[] }).__seen = seen
    return seen
  })
  expect(marks).toEqual([])
  await page.getByRole('menuitemradio', { name: /^Dark$/ }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  expect(await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen)).toEqual([])
})
