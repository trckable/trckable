// WCAG 2.1 AA across every screen. The European Accessibility Act has applied
// to products sold in the EU since June 2025, and trckable publishes a
// statement saying it conforms — this is what keeps that true.
//
// It runs against a trckabled with the demo data, so it is skipped unless
// TRCKABLE_A11Y_URL points at one:
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test a11y
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'

// One test per screen (or a few that belong together), not one for all of them:
// a screen that is slow in one browser fails alone, is tried again alone, and
// the screens run side by side. Signing in is limited to ten tries in ten
// minutes from one address and the other suites here need theirs: the session
// is made once, by whichever worker gets there first, and shared through a file.
async function session(): Promise<string> {
  const file = join(tmpdir(), `trckable-a11y-${new URL(BASE!).port}-${process.ppid}`)
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const res = await fetch(BASE + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')

async function scan(page: Page, where: string) {
  // Contrast is about what stays on screen, not a fade on its way in: the
  // page runs with reduced motion (the dashboard then skips its entrance
  // animations), and a short pause lets late-loading parts arrive.
  await page.waitForTimeout(700)
  // The footer's logo is faint on purpose until pointed at: a logotype is
  // exempt from text contrast (WCAG 1.4.3), and its links are still scanned.
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.app-footer .tkb-logo').analyze()
  const found = violations.flatMap((v) => v.nodes.map((n) => `${where}: ${v.id} — ${n.any?.[0]?.message ?? v.help}\n    ${n.html.slice(0, 160)}`))
  expect(found, where).toEqual([])
}

// Signed in, reduced motion, and the demo's first site.
async function start(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: await session(), url: BASE! }])
  const site = (await (await page.request.get(BASE + '/api/v1/sites')).json()).sites?.[0] as { id: string; domain: string } | undefined
  expect(site, 'a site to look at').toBeTruthy()
  return site!
}

// Both themes. Every contrast bug found here was light-theme only: the dark
// one is where the work happens, so it is the one that gets looked at.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme })

    test('sign in meets WCAG 2.1 AA', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(BASE + '/login')
      await scan(page, 'sign in')
    })

    test('the compact dashboard and Replay\'s controls meet WCAG 2.1 AA', async ({ page }) => {
      await start(page)
      await page.goto(BASE + '/')
      await expect(page.locator('.kpi .value.num').first()).toBeVisible()
      await scan(page, 'dashboard, compact')
      // Replay's speed and scrubber show on hover or focus: scanned shown.
      await page.getByRole('button', { name: /^Replay this period/ }).focus()
      await page.waitForTimeout(300)
      await scan(page, 'dashboard, replay controls')
    })

    test('the Full dashboard, the site switcher and the Notes list meet WCAG 2.1 AA', async ({ page }) => {
      const site = await start(page)
      await page.goto(`${BASE}/${site.domain}?mode=full`)
      await page.waitForSelector('[data-chart=flow] svg', { timeout: 20_000 })
      await scan(page, 'dashboard, full')
      // The site switcher's list and the Notes list load on demand: open each.
      await page.locator('.site-pick .site-btn').click()
      await page.waitForSelector('.pop.sites .sites-list', { timeout: 15_000 })
      await scan(page, 'site switcher')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: /^Notes/ }).click()
      await page.waitForSelector('.notes-modal .notes-panel', { timeout: 15_000 })
      await scan(page, 'notes list')
    })

    test('the Full grid, the More and Create menus and the funnel dialog meet WCAG 2.1 AA', async ({ page }) => {
      const site = await start(page)
      await page.goto(`${BASE}/${site.domain}?mode=full`)
      await page.waitForSelector('[data-chart=flow] svg', { timeout: 20_000 })
      await scan(page, 'dashboard, full grid')
      await page.getByRole('button', { name: 'More', exact: true }).click()
      await scan(page, 'more menu')
      await page.getByRole('menu', { name: 'More' }).getByRole('menuitem', { name: /Create/ }).click()
      await scan(page, 'create menu')
      const funnel = page.getByRole('menuitem', { name: /Funnel/ })
      if (await funnel.isEnabled()) {
        await funnel.click()
        await page.waitForSelector('[role=dialog]')
        await scan(page, 'new funnel')
      }
    })

    test('Live meets WCAG 2.1 AA', async ({ page }) => {
      // Live needs a real site in the path: the demo's, not a made-up one.
      const site = await start(page)
      await page.goto(`${BASE}/${site.domain}?view=live`)
      await page.waitForSelector('.live-online', { timeout: 15_000 })
      await scan(page, 'live')
    })

    for (const tab of ['site', 'install', 'modules', 'notes', 'payments', 'privacy', 'alerts', 'health']) {
      test(`settings, ${tab} meets WCAG 2.1 AA`, async ({ page }) => {
        const site = await start(page)
        await page.goto(`${BASE}/settings?site=${site.id}&tab=${tab}`)
        // Settings open as a dialog whose code loads on demand: wait for it to be
        // there, or the scan can start before it and catch it fading in.
        await page.waitForSelector('.window-body', { timeout: 15_000 })
        await scan(page, 'settings, ' + tab)
      })
    }

    test('your account meets WCAG 2.1 AA', async ({ page }) => {
      const site = await start(page)
      await page.goto(`${BASE}/${site.domain}?account=profile`)
      await page.waitForSelector('.modal.window', { timeout: 15_000 })
      await scan(page, 'your account')
    })
  })
}
