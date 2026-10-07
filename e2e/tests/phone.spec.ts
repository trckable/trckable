// The phone scale: on a 390 px screen every control a finger can press is at
// least 44 x 44, no text is under 12 px, and nothing runs off the side, on the
// screens a person uses (Data, Live, the site list, the period sheet, the ⋯
// menu, Settings, Share). Chromium only: it reads boxes and computed sizes.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'reads boxes and computed sizes: one engine is enough')
// Reduced motion: a dialog opens at once, not scaled up from 96% (which would measure its buttons 2 px short).
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('phone'), url: API }])
})

/** What is wrong on the screen now: targets under 44 px, text under 12 px, and the page wider than the screen. */
function audit() {
  const INTERACTIVE = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=menuitem], [role=menuitemradio], [role=switch], [role=checkbox], [role=option], [role=radio], [tabindex]:not([tabindex="-1"])'
  const shown = (e: Element) => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const who = (e: Element) => (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 30) + ` <${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}>`
  // Something on top (a sheet over the page) means the one under it cannot be pressed.
  const covered = (e: Element, r: DOMRect) => {
    if (r.y < 0 || r.y >= innerHeight) return false
    const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.x + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.y + r.height / 2)))
    return !!top && !e.contains(top) && !top.contains(e)
  }
  const small: string[] = []
  for (const e of document.querySelectorAll(INTERACTIVE)) {
    if (!shown(e)) continue
    const inline = getComputedStyle(e).display === 'inline' && e.tagName === 'A' // a link inside a sentence
    const boxed = e instanceof HTMLInputElement && ['checkbox', 'radio'].includes(e.type) && !!e.closest('label')
    const r = e.getBoundingClientRect()
    if (inline || boxed || covered(e, r)) continue
    if (r.width < 43.5 || r.height < 43.5) small.push(`${Math.round(r.width)}x${Math.round(r.height)} ${who(e)}`)
  }
  const text: string[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set<Element>()
  while (walker.nextNode()) {
    const e = walker.currentNode.parentElement
    if (!e || seen.has(e) || !walker.currentNode.textContent?.trim() || !shown(e)) continue
    seen.add(e)
    if (parseFloat(getComputedStyle(e).fontSize) < 12) text.push(`${getComputedStyle(e).fontSize} ${who(e)}`)
  }
  return { small, text, wide: document.documentElement.scrollWidth - innerWidth }
}

async function clean(page: Page) {
  const r = await page.evaluate(audit)
  expect(r.small, 'targets under 44 px').toEqual([])
  expect(r.text, 'text under 12 px').toEqual([])
  expect(r.wide, 'the page is wider than the screen').toBeLessThanOrEqual(0)
}

async function data(page: Page) {
  await page.goto(API + '/example.com?view=data')
  await expect(page.locator('.overview-chart .chart-wrap svg')).toBeVisible({ timeout: 20_000 })
}

test('the Data view: header, row, numbers, chart and cards', async ({ page }) => {
  await data(page)
  await clean(page)
})

test('All sites: nothing wider than the screen, the open arrow inside its card, no ring on a tap', async ({ page }) => {
  await page.goto(API + '/all')
  const card = page.locator('.all-item').first()
  await expect(card).toBeVisible({ timeout: 20_000 })
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((e) => {
        const r = e.getBoundingClientRect()
        // A scroller keeps its own overflow: only boxes outside every scroller count.
        return r.width > 0 && r.right > innerWidth + 0.5 && !e.closest('.seg')
      })
      .map((e) => String(e.className) || e.tagName),
  )
  expect(wide, 'elements wider than the screen').toEqual([])
  const outer = (await card.boundingBox())!
  const arrow = (await card.locator('.site-open').boundingBox())!
  expect(outer.width).toBeGreaterThanOrEqual(390 - 40)
  expect(arrow.x).toBeGreaterThanOrEqual(outer.x)
  expect(arrow.x + arrow.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5)
  expect(arrow.y).toBeGreaterThanOrEqual(outer.y)
  await page.locator('.all-sort select').focus()
  await clean(page)
})

test('the Live view', async ({ page }) => {
  await data(page)
  await page.getByRole('button', { name: /^Live/ }).click()
  await expect(page.locator('.live-view')).toBeVisible()
  await clean(page)
})

test('the site list is a bottom sheet with rows 48 px tall', async ({ page }) => {
  await data(page)
  await page.locator('button.site-btn').click()
  const sheet = page.locator('.pop.sites')
  await expect(sheet).toBeVisible()
  const box = (await sheet.boundingBox())!
  expect(box.y + box.height).toBeGreaterThanOrEqual(844 - 1) // on the bottom edge
  expect(box.width).toBeGreaterThanOrEqual(389) // and edge to edge
  for (const row of await sheet.locator('button.site').all()) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  await clean(page)
})

test('the period sheet and the ⋯ menu', async ({ page }) => {
  await data(page)
  await page.locator('.phone-pill').click()
  await expect(page.locator('.sheet-body')).toBeVisible()
  await clean(page)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'More', exact: true }).click()
  const menu = page.locator('.pop.menu.more-menu')
  await expect(menu).toBeVisible()
  for (const item of await menu.getByRole('menuitem').all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  await clean(page)
})

test('Settings, and the share card', async ({ page }) => {
  await data(page)
  // The cog is in the site list's foot on a phone: the header has no room for it beside the name.
  await page.locator('button.site-btn').click()
  await page.locator('.foot-settings').click()
  await expect(page.locator('.modal.window')).toBeVisible()
  await clean(page)
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: /Share/ }).click()
  await expect(page.locator('.sd-modal')).toBeVisible()
  await clean(page)
})

test('a tap on the chart pins its card, and a tap outside lets it go', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' })
  await ctx.addCookies([{ name: 'trckable_session', value: await session('phone'), url: API }])
  const page = await ctx.newPage()
  await data(page)
  const chart = page.locator('.overview-chart .chart-wrap')
  const at = (await chart.boundingBox())!
  await page.touchscreen.tap(at.x + at.width * 0.6, at.y + at.height * 0.5)
  await expect(page.locator('.overview-chart .time-tip')).toBeVisible()
  // The finger has lifted: the card stays.
  await page.waitForTimeout(400)
  await expect(page.locator('.overview-chart .time-tip')).toBeVisible()
  await page.touchscreen.tap(6, 300)
  await expect(page.locator('.overview-chart .time-tip')).toHaveCount(0)
  await ctx.close()
})
