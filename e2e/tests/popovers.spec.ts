// Every tooltip, menu and popover is drawn on the page's top layer: whole inside the window and topmost at its four
// corners (nothing clips it, nothing covers it), at a phone, a tablet and two desktop widths.
import { expect, test, type Locator, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'reads boxes and hit tests: one engine is enough')

const WIDTHS = [375, 768, 1280, 1600]

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('popovers'), url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

/** Whole inside the window, and what is at each corner (and the middle) is the popover or something in it. */
async function onTop(page: Page, pop: Locator, what: string) {
  await expect(pop, `${what} is shown`).toBeVisible()
  await page.waitForTimeout(250)
  const r = await pop.evaluate((el) => {
    // A tip that lets the pointer through is still hit-tested: it is the layering that is asked about.
    for (const e of [el, ...el.querySelectorAll<HTMLElement>('*')]) e.style.setProperty('pointer-events', 'auto', 'important')
    const b = el.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = innerHeight
    const pts = [
      [b.left + 10, b.top + 10],
      [b.right - 10, b.top + 10],
      [b.left + 10, b.bottom - 10],
      [b.right - 10, b.bottom - 10],
      [b.left + b.width / 2, b.top + b.height / 2],
    ]
    const hits = pts.map(([x, y]) => {
      if (x < 0 || y < 0 || x >= vw || y >= vh) return 'outside'
      const top = document.elementFromPoint(x, y)
      return top && (el === top || el.contains(top)) ? 'ok' : (top?.className?.toString() || top?.tagName || 'none')
    })
    return { box: { l: b.left, t: b.top, r: b.right, b: b.bottom }, vw, vh, hits }
  })
  expect(r.box.l, `${what}: left edge`).toBeGreaterThanOrEqual(-0.5)
  expect(r.box.t, `${what}: top edge`).toBeGreaterThanOrEqual(-0.5)
  expect(r.box.r, `${what}: right edge`).toBeLessThanOrEqual(r.vw + 0.5)
  expect(r.box.b, `${what}: bottom edge`).toBeLessThanOrEqual(r.vh + 0.5)
  expect(r.hits, `${what}: topmost at the corners`).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
}

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('the header: site list, period, bell and your menu', async ({ page }) => {
      await page.goto(`${API}/${HISTORY_DOMAIN}?v=&period=7d`)
      await expect(page.locator('.hero')).toBeVisible({ timeout: 30_000 })
      await page.locator('#siteBtn').click()
      await onTop(page, page.locator('#siteMenu.on'), 'the site list')
      await page.keyboard.press('Escape')
      const pill = page.locator('.pill').first()
      if (await pill.isVisible()) {
        await pill.click()
        await onTop(page, page.locator('#perMenu'), 'the period menu')
        await page.keyboard.press('Escape')
      }
      await page.getByRole('button', { name: /^Notifications/ }).click()
      await onTop(page, page.locator('#bellMenu.on, aside.cd.on').first(), 'the bell')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Account', exact: true }).click()
      await onTop(page, page.getByRole('menu', { name: 'Account' }), 'your menu')
    })

    test('a number’s Why? and the hero’s', async ({ page }) => {
      await page.goto(`${API}/${HISTORY_DOMAIN}?v=&period=7d`)
      await expect(page.locator('.hero')).toBeVisible({ timeout: 30_000 })
      const why = page.locator('.hero .whyb, .kc .kn[title]').first()
      if (await why.count()) {
        await why.click()
        await onTop(page, page.locator('.hw.show').first(), 'the Why? panel')
      }
    })

    test('Settings: a tooltip inside a dialog', async ({ page }) => {
      const sites = ((await (await page.request.get(`${API}/api/v1/sites`)).json()) as { sites: { id: string; domain: string }[] }).sites
      const site = sites.find((x) => x.domain === HISTORY_DOMAIN)!
      await page.goto(`${API}/settings?site=${site.id}&tab=install`)
      const dialog = page.getByRole('dialog', { name: /^Settings for/ })
      await expect(dialog).toBeVisible({ timeout: 20_000 })
      const install = dialog.getByRole('tab', { name: 'Install' }).or(dialog.getByRole('button', { name: 'Install', exact: true })).first()
      if (await install.isVisible()) await install.click()
      // The (i) beside a setting, where the tab has one on screen.
      const info = dialog.locator('.info-dot:visible, .info-badge:visible').first()
      if (await info.count()) {
        await info.hover()
        await onTop(page, page.locator('[role=tooltip]').first(), 'a tooltip in Settings')
      }
    })

    test('All sites: a tooltip', async ({ page }) => {
      await page.goto(`${API}/sites`)
      await expect(page.locator('.all-sites')).toBeVisible({ timeout: 30_000 })
      const trigger = page.locator('.all-sites .tip-text:visible, .all-sites .info-dot:visible').first()
      if (await trigger.count()) {
        await trigger.scrollIntoViewIfNeeded()
        await trigger.hover()
        await onTop(page, page.locator('[role=tooltip]').first(), 'a tooltip on All sites')
      }
    })
  })
}
