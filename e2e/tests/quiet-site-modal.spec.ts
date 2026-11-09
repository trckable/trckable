// A quiet site's report opens in a modal (a bottom sheet on a phone), not inline in the bar's panel: Esc closes it and
// focus goes back; its chip says "Tracking stopped" only when a check fails, else "No visits for <time>".
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const NOW = Math.floor(Date.now() / 1000)
const LAST = NOW - 15 * 3600

const passing = { url: 'https://x.example', status: 200, ms: 90, found: 'site', scripts: 1, script: 'https://x.example/t.js', script_status: 200 }
const failing = { url: 'https://x.example', status: 200, ms: 90, found: 'none', scripts: 1 }

async function quiet(page: import('@playwright/test').Page, check: object) {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('quiet-modal'), url: API }])
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    for (const s of body.sites) if (s.domain === HISTORY_DOMAIN) Object.assign(s, { last_event_at: LAST, down_since: undefined, check: { at: NOW } })
    await r.fulfill({ response: res, json: body })
  })
  await page.route('**/api/v1/sites/*/install/check', (r) => r.fulfill({ json: check }))
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d`)
  await expect(page.locator('#siteBtn')).toBeVisible({ timeout: 20_000 })
  await page.locator('#siteBtn').click()
  await page.locator('[data-site-why]').click()
}

test('the bar lists the quiet site, a click opens its report in a modal, Esc closes it and focus returns', async ({ page }) => {
  test.slow()
  await page.emulateMedia({ colorScheme: 'dark' })
  await quiet(page, passing)
  const row = page.locator('.status-row').first()
  await expect(row).toBeVisible()
  await expect(page.locator('#siteMenu .status-card')).toHaveCount(0) // no inline report
  await row.click()
  const modal = page.getByRole('dialog', { name: /./ }).filter({ has: page.locator('.status-card') })
  await expect(modal).toBeVisible()
  await expect(modal.locator('.sg-chip')).toHaveText('No visits for 15h') // every check passes
  await expect(modal.getByRole('button', { name: 'Check again' })).toBeVisible()
  await expect(modal.getByRole('link', { name: 'Open site' })).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/quiet-modal-${page.viewportSize()?.width}-dark.png` })
  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
  await expect(page.locator('.status-row').first()).toBeFocused()
})

test('the chip says Tracking stopped when a check fails', async ({ page }) => {
  test.slow()
  await quiet(page, failing)
  await page.locator('.status-row').first().click()
  const modal = page.locator('.modal.status-modal')
  await expect(modal.locator('.sg-chip')).toHaveText('Tracking stopped')
  await modal.getByRole('button', { name: 'Close' }).click()
  await expect(modal).toBeHidden()
})

test('on a phone it is a sheet and the foot is fully in view', async ({ page }) => {
  test.slow()
  await page.setViewportSize({ width: 390, height: 700 })
  await page.emulateMedia({ colorScheme: 'light' })
  await quiet(page, passing)
  await page.locator('.status-row').first().click()
  const modal = page.locator('.modal.status-modal')
  await expect(modal.locator('.sg-chip')).toBeVisible()
  const foot = await modal.locator('.modal-foot').boundingBox()
  expect(foot && foot.y + foot.height <= 700 && foot.x >= 0 && foot.x + foot.width <= 390).toBe(true)
  for (const name of ['Open site', 'Check again']) {
    const b = await modal.getByText(name).first().boundingBox()
    expect(b && b.y + b.height <= 700).toBe(true)
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/quiet-modal-390-light.png` })
})
