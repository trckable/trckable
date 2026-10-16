// The dashboard audit's fixes: a site that stopped is told in the foot, in Live's header and by its name (nothing floats),
// and an empty Live is quiet (no wave, no words, no heading over nothing, a card as tall as it says). A phone gets the
// count and last visit on one line, and the sign-in page keeps its help in a tooltip. AUDIT_SHOTS=<dir> takes pictures.
import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { signIn } from './audit-kit'
import { session } from './session'

const SHOTS = process.env.AUDIT_SHOTS
const NOW = Math.floor(Date.now() / 1000)

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  const w = page.viewportSize()!.width
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/audit-fix-${name}-${w}-${scheme}.png` })
  }
}

for (const size of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  test(`an empty Live is quiet, and a stopped site is told once (${size.w})`, async ({ page }) => {
    test.slow()
    await page.setViewportSize({ width: size.w, height: size.h })
    await signIn(page)
    const site = { domain: HISTORY_DOMAIN }
    await page.route('**/api/v1/sites', async (r) => {
      if (r.request().method() !== 'GET') return r.continue()
      const res = await r.fetch()
      const body = (await res.json()) as { sites: Record<string, unknown>[] }
      for (const s of body.sites) if (s.domain === site.domain) Object.assign(s, { last_event_at: NOW - 30, down_since: NOW - 20 * 60, down_cause: 'No answer within 10 seconds' })
      await r.fulfill({ response: res, json: body })
    })
    await page.goto(`${API}/${site.domain}?view=live`)
    await expect(page.locator('.live-state.down')).toHaveText('Down', { timeout: 20_000 })
    await expect(page.locator('.status-float')).toHaveCount(0) // nothing floats over the page
    await expect(page.locator('.footer-status')).toHaveAttribute('data-status', 'down')
    await expect(page.locator('.site-zone .state-dot.stopped')).toBeVisible()
    // Empty: a faint baseline, no wave, no pill, no heading over nothing.
    await expect(page.locator('.kit-nodata')).toHaveCount(0)
    await expect(page.getByText('Top sources right now')).toHaveCount(0)
    await expect(page.getByText('Waiting for the first visit since')).toHaveCount(0)
    await expect(page.locator('.live-quiet')).toContainText('Quiet since')
    if (size.w > 640) {
      await expect(page.locator('.live-onsite.none')).toBeVisible()
      const [now, onsite] = await Promise.all([page.locator('.live-now').boundingBox(), page.locator('.live-onsite').boundingBox()])
      expect(onsite!.height).toBeLessThan(now!.height)
      await page.locator('.live-help').hover()
      await expect(page.getByRole('tooltip')).toContainText('idle for 5 minutes')
    } else {
      await expect(page.locator('.live-feed')).toBeHidden() // a count and a line, not a screen of rows
      expect((await page.locator('.live-onsite').boundingBox())!.height).toBeLessThan(120)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    await shoot(page, 'live')
    await page.locator('.footer-status').click()
    await expect(page.locator('.status-pop')).toContainText('No answer within 10 seconds')
    await shoot(page, 'foot-panel')
  })
}

test('the sign-in page keeps its help in a tooltip', async ({ browser }) => {
  await session('audit-login') // the server is set up; a browser with no session meets the sign-in page
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await page.goto(`${API}/`)
  const help = page.getByRole('button', { name: 'Forgot it?' })
  await expect(help).toBeVisible({ timeout: 20_000 })
  await help.hover()
  await expect(page.getByRole('tooltip')).toContainText('trckabled admin reset-password')
  await expect(page.getByText('Ask an owner for new sign-in details', { exact: false }).locator('visible=true')).toHaveCount(1)
  await shoot(page, 'login')
})
