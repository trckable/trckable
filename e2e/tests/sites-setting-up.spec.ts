// A site added but never visited is not "fine": Sites puts it under "Setting up",
// says it is waiting, does not claim uptime nobody watched, and the install card
// has a way back to Sites.
import { expect, test } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const SHOTS = process.env.SETUP_SHOTS

test('a site with no first visit waits under Setting up, with no false all-clear', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('sites-setting-up'), url: API }])
  await page.addInitScript(() => localStorage.setItem('trckable.onboarding.skipped', '1')) // past the first run, as after Skip
  const tag = Date.now()
  const made = await Promise.all([0, 1].map((n) => page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `waiting${n}-${tag}.setup.example.org` } })))
  const sites = await Promise.all(made.map(async (r) => ((await r.json()) as { id: string; domain: string })))
  const site = sites[0]

  // The account is read as holding only these two sites, as on a fresh install.
  const only = async (route: import('@playwright/test').Route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const res = await route.fetch()
    const body = (await res.json()) as { sites: { id: string }[] }
    await route.fulfill({ response: res, json: { ...body, sites: body.sites.filter((s) => sites.some((x) => x.id === s.id)) } })
  }
  await page.route('**/api/v1/overview*', only)
  await page.route('**/api/v1/sites', only)
  await page.route('**/api/v1/incidents*', (route) => route.fulfill({ json: { incidents: [] } }))

  await page.goto(`${API}/sites`)
  const today = page.locator('.nx-today')
  await expect(today).toBeVisible({ timeout: 20_000 })
  await expect(today.locator('.nx-headline h2')).toHaveText('2 sites waiting for their first visit. Install the script to start.')
  await expect(today).not.toContainText('looks fine')
  await expect(today.getByRole('region', { name: 'Setting up' })).toContainText(site.domain)
  await expect(today.getByRole('region', { name: 'Steady' })).toHaveCount(0)
  await expect(today.locator('.nx-line .nx-action')).toHaveText(['Install', 'Install'])
  await expect(today.locator('.nx-strip')).not.toContainText('for the hours so far')
  const uptime = today.locator('.nx-card', { hasText: 'Uptime' })
  await expect(uptime).toContainText('Not watched yet')
  await expect(uptime).toContainText('Starts with the first check')
  await expect(uptime).not.toContainText('100.0% up')
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.screenshot({ path: `${SHOTS}/sites-setting-up-${scheme}.png` })
    }
  }

  // The row opens the setup screen, and the ghost leads back.
  await today.locator('.nx-line').first().click()
  const back = page.locator('#logo')
  await expect(page.locator('.setup-status')).toBeVisible()
  if (SHOTS) {
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${SHOTS}/install-back-light.png` })
  }
  await back.click()
  await expect(page).toHaveURL(/\/sites$/)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})
