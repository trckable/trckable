// WCAG 2.1 AA across every screen. The European Accessibility Act has applied
// to products sold in the EU since June 2025, and trckable publishes a
// statement saying it conforms — this is what keeps that true.
//
// It runs against a trckabled with the demo data, so it is skipped unless
// TRCKABLE_A11Y_URL points at one:
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test a11y
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')

// Both themes. Every contrast bug found here was light-theme only: the dark
// one is where the work happens, so it is the one that gets looked at.
for (const colorScheme of ['light', 'dark'] as const) {
test.describe(colorScheme, () => {
test.use({ colorScheme })
test('every screen meets WCAG 2.1 AA', async ({ page }) => {
  test.slow()
  const scan = async (where: string) => {
    // Contrast is about what stays on screen, not a fade on its way in: the
    // page runs with reduced motion (the dashboard then skips its entrance
    // animations), and a short pause lets late-loading parts arrive.
    await page.waitForTimeout(700)
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const found = violations.flatMap((v) => v.nodes.map((n) => `${where}: ${v.id} — ${n.any?.[0]?.message ?? v.help}\n    ${n.html.slice(0, 160)}`))
    expect(found, where).toEqual([])
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(BASE + '/login')
  await scan('sign in')
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
  await page.waitForTimeout(2500)
  await scan('dashboard, compact')

  const site = await page.evaluate(async () => (await (await fetch('/api/v1/sites')).json()).sites?.[0]?.id ?? '')
  expect(site, 'a site to look at').not.toBe('')
  await page.goto(BASE + '/site.com?mode=full')
  await page.waitForTimeout(4000)
  await scan('dashboard, full')

  for (const tab of ['site', 'install', 'modules', 'payments', 'privacy', 'alerts', 'health']) {
    await page.goto(`${BASE}/settings?site=${site}&tab=${tab}`)
    // Settings open as a dialog whose code loads on demand: wait for it to be
    // there, or the scan can start before it and catch it fading in.
    await page.waitForSelector('.settings-modal .settings-body', { timeout: 15_000 })
    await scan('settings, ' + tab)
  }
  await page.goto(BASE + '/site.com?account=profile')
  await page.waitForSelector('.modal.account', { timeout: 15_000 })
  await scan('your account')
})
})
}
