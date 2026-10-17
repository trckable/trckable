// WCAG 2.1 AA across every screen. The European Accessibility Act has applied
// to products sold in the EU since June 2025, and trckable publishes a
// statement saying it conforms — this is what keeps that true.
//
// It runs against a trckabled with the demo data, so it is skipped unless
// TRCKABLE_A11Y_URL points at one:
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test a11y
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './fixtures'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pageSettled } from './pageSettled'

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
  // A menu that has just swapped in is still fading: axe reads text that is not yet shown as none.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime as number)).map((a) => a.finished.catch(() => undefined))))
  // The entrance can start a frame after it opens, and a list is placed after it is measured: wait for its items to be shown, opaque and on the screen.
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('[role=menuitem]:not([disabled])')].some((el) => {
          if (getComputedStyle(el).visibility !== 'visible') return true
          const r = el.getBoundingClientRect() // a list not yet placed sits off the screen, and axe then reads its text as hidden
          if (r.width === 0 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return true
          for (let n: Element | null = el; n; n = n.parentElement) if (+getComputedStyle(n).opacity < 1) return true
          return false
        }),
      ),
    )
    .toBe(false)
  // The footer's logo is faint on purpose until pointed at: a logotype is
  // exempt from text contrast (WCAG 1.4.3), and its links are still scanned.
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.app-footer .tkb-logo').analyze()
  const found = violations.flatMap((v) => v.nodes.map((n) => `${where}: ${v.id} — ${n.any?.[0]?.message ?? v.help}\n    ${n.html.slice(0, 160)}`))
  if (found.length) {
    const first = violations[0]?.nodes[0]
    const why = await page.evaluate((sel) => {
      const el = document.querySelector(sel as string)
      if (!el) return 'gone'
      const up: string[] = []
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = getComputedStyle(n)
        up.push(`${n.tagName}.${String(n.className).slice(0, 20)} vis=${c.visibility} op=${c.opacity} disp=${c.display} ah=${n.getAttribute('aria-hidden')} inert=${n.hasAttribute('inert')} clip=${c.clipPath} tf=${c.transform}`)
      }
      const r = el.getBoundingClientRect()
      return `${JSON.stringify([r.x, r.y, r.width, r.height])} text=${JSON.stringify(el.textContent)} ${up.join(' | ')}`
    }, String(first?.target?.[0] ?? 'body'))
    found.push(`state: ${why}`)
  }
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



    // Every tab of the two cards, one after another: their roles, names and contrast.


    test('Live meets WCAG 2.1 AA', async ({ page }) => {
      // Live needs a real site in the path: the demo's, not a made-up one.
      const site = await start(page)
      await page.goto(`${BASE}/${site.domain}?view=live`)
      await page.waitForSelector('.liveview', { timeout: 15_000 })
      await scan(page, 'live')
    })

    // The new pages' own colours (chart lime, selected rows, the tab bar) are checked in both themes too.
    for (const [name, query] of [['Briefing', 'view=briefing'], ['Explore', 'view=data&v=explore'], ['Explore, pages', 'view=briefing&xp=pages']]) {
      test(`${name} meets WCAG 2.1 AA`, async ({ page }) => {
        const site = await start(page)
        await page.goto(`${BASE}/${site.domain}?${query}`)
        await page.waitForSelector('.mk', { timeout: 15_000 })
        await scan(page, name)
      })
    }

    for (const tab of ['site', 'install', 'notes', 'payments', 'privacy', 'alerts', 'health']) {
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
