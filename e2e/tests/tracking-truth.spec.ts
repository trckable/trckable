// A site our probe finds down still says that tracking itself works while visits arrive, in the status panel and in the Live
// down box; and a site the bell calls down shows the Live down box (one answer to "is it down", the sites list).
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'
import { mockFeed, siteIdOf } from './bell-feed-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough')

const SHOTS = process.env.TRACKING_SHOTS
const NOW = Math.floor(Date.now() / 1000)

async function down(page: import('@playwright/test').Page, extra: Record<string, unknown>) {
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    for (const s of body.sites) if (s.domain === HISTORY_DOMAIN) Object.assign(s, { down_since: NOW - 12 * 60, down_cause: 'No answer within 10 seconds', ...extra })
    await r.fulfill({ response: res, json: body })
  })
}

for (const [name, width, height] of [['1440', 1440, 900], ['390', 390, 844]] as const) {
  for (const colorScheme of ['dark', 'light'] as const) {
    test(`a down site says tracking works, in the Live box and the panel (${name} ${colorScheme})`, async ({ page }) => {
      test.slow()
      await page.context().addCookies([{ name: 'trckable_session', value: await session('tracking-truth'), url: API }])
      await down(page, { last_event_at: NOW - 3 * 60, down_visitors: true })
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height })
      await page.goto(`${API}/${HISTORY_DOMAIN}?view=live`)
      const box = page.locator('.lnow .downbox')
      await expect(box).toBeVisible({ timeout: 20_000 })
      await expect(box.locator('.tracking-line')).toContainText('Tracking works · last visit 3 min ago')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/live-${name}-${colorScheme}.png` })
      await page.locator('#siteBtn').click()
      await page.locator('[data-site-why]').click()
      await page.locator('.status-row').first().click()
      const pop = page.locator('.modal.status-modal')
      await expect(pop.locator('.tracking-line')).toContainText('Tracking works · last visit 3 min ago')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/panel-${name}-${colorScheme}.png` })
    })
  }
}

test('a stale last visit is told as when visits stopped, not as tracking working', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('tracking-truth-stale'), url: API }])
  await down(page, { last_event_at: NOW - 5 * 3600 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=live`)
  const line = page.locator('.lnow .downbox .tracking-line')
  await expect(line).toContainText('No visits since', { timeout: 20_000 })
  await expect(line).not.toContainText('Tracking works')
})

test('a site the bell calls down shows the Live down box', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('tracking-truth-bell'), url: API }])
  const site = await siteIdOf(page, HISTORY_DOMAIN)
  const since = NOW - 12 * 60
  await mockFeed(page, () => [{ id: 'down:x', kind: 'down', site, at: since }])
  await down(page, { last_event_at: NOW - 8 * 3600 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=live`)
  await expect(page.locator('.lnow .downbox')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /notifications/i }).first().click()
  await expect(page.getByText(`${HISTORY_DOMAIN} down since`, { exact: false }).first()).toBeVisible()
})
