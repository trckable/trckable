// A setup prompt is optional: the revenue card on Live shows while payments are a wanted step, goes (its space with it) when the
// step is skipped in the setup progress, and comes back the moment the step is brought back, with no reload.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const DOMAIN = `nudge-${Date.now()}.example.org`
const SHOTS = '/private/tmp/shots'

test('skip payments: the revenue prompt goes, bring it back: it shows again', async ({ page, request }) => {
  const cookie = await session('setup-nudge')
  const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json', Cookie: `trckable_session=${cookie}` }
  const made = await request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: DOMAIN } })
  expect(made.ok()).toBe(true)
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route(/\/api\/v1\/sites\/[^/]+\/events/, (route) => route.fulfill({ json: { events: [{}] } }))
  await page.goto(`${API}/${DOMAIN}?view=live`)
  const lock = page.locator('[data-lock="rev"]')
  // A site this browser has not read yet shows its ring at the next look: read it, look again.
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('trckable:ring:state:')), undefined, { timeout: 20_000 })
  await page.reload()
  await expect(lock).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/nudge-wanted.png` })
  await page.locator('.ringb').click({ timeout: 15_000 })
  const panel = page.locator('.setupmenu.on')
  await panel.locator('[data-step="payments"]').getByRole('button', { name: 'More' }).click()
  await panel.getByRole('menuitem', { name: 'I don’t sell online' }).click()
  await expect(lock).toHaveCount(0)
  await expect(page.locator('.lbottom.money')).toHaveCount(0)
  await expect(page.locator('.lrev')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/nudge-skipped.png` })
  await panel.getByRole('button', { name: /More you can add/ }).click()
  await panel.locator('[data-step="payments"] button', { hasText: 'Bring back' }).click()
  await expect(lock).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/nudge-back.png` })
})
