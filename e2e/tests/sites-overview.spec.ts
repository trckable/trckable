// Sites overview: a quiet site's pill and line agree, the header says "Today",
// and the Uptime tile does not read as all fine while a site has no visits.
import { expect, test } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const SHOTS = process.env.SITES_SHOTS

for (const size of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`a quiet site says one thing on every line, ${size.name}`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.context().addCookies([{ name: 'trckable_session', value: await session('sites-overview'), url: API }])
    await page.addInitScript(() => localStorage.setItem('trckable.onboarding.skipped', '1'))
    const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `quiet-${Date.now()}.overview.example.org` } })
    const id = ((await made.json()) as { id: string }).id
    const last = Math.floor(Date.now() / 1000) - 10 * 3600

    const quiet = async (route: import('@playwright/test').Route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const res = await route.fetch()
      const body = (await res.json()) as { sites: { id: string }[] }
      await route.fulfill({ response: res, json: { ...body, sites: body.sites.filter((s) => s.id === id).map((s) => ({ ...s, last_event_at: last, check: { at: Math.floor(Date.now() / 1000) }, watched_since: last - 3 * 86400 })) } })
    }
    const only = async (route: import('@playwright/test').Route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const res = await route.fetch()
      const body = (await res.json()) as { sites: { id: string }[] }
      await route.fulfill({ response: res, json: { ...body, sites: body.sites.filter((s) => s.id === id) } })
    }
    await page.route('**/api/v1/overview*', only)
    await page.route('**/api/v1/sites', quiet)
    await page.route('**/api/v1/incidents*', (route) => route.fulfill({ json: { incidents: [] } }))

    await page.goto(`${API}/sites`)
    const row = page.locator('.nx-line.hurt')
    await expect(row).toBeVisible({ timeout: 20_000 })
    await expect(row.locator('.nx-chip.bad')).toHaveText('no visits 10h')
    await expect(row).toContainText('No visits for 10h. Last visit')
    await expect(page.locator('.all-head p')).toHaveText(/^Today · /)
    await expect(page.locator('.nx-card', { hasText: 'Uptime' })).toContainText('1 quiet')
    await expect(page.locator('.nx-card', { hasText: 'Uptime' })).not.toContainText('looks fine')
    const status = page.locator('.footer-status')
    await expect(status).toHaveAttribute('data-status', 'quiet')
    await expect(status).toContainText('1 quiet')

    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true })
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await page.screenshot({ path: `${SHOTS}/sites-${size.name}-${scheme}.png`, fullPage: true, scale: 'css' })
      }
    }
  })
}
