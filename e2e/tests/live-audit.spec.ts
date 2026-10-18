// What the live audit found at phone, tablet and desktop widths: the first row clear of the sticky header, the site's name in
// it, the last line above the bottom bar, whole card labels, Escape on the account menu, and the Mentions page and its entry.
import { expect, test, type Page } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the layout')
const SHOTS = process.env.LIVE_SHOTS

async function open(page: Page, width: number, query = '?view=briefing&period=7d', who = 'live-audit') {
  await page.setViewportSize({ width, height: 844 })
  await page.context().addCookies([{ name: 'trckable_session', value: await session(who), url: API }])
  await page.addInitScript(() => localStorage.setItem('trckable.onboarding.skipped', '1'))
  await page.goto(`${API}/${HISTORY_DOMAIN}${query}`)
  await expect(page.locator('.hd')).toBeVisible()
  await page.waitForTimeout(800)
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, scale: 'css' })
}

test('390: the first row is not under the header, and the site keeps its name', async ({ page }) => {
  await open(page, 390)
  const m = await page.evaluate(() => {
    const hd = document.querySelector('.hd')!.getBoundingClientRect()
    const first = document.querySelector('.brief')!.getBoundingClientRect()
    const name = document.querySelector('#siteBtn .nmx')!
    return { hdBottom: hd.bottom, firstTop: first.top, nameW: name.getBoundingClientRect().width, cut: name.scrollWidth > name.clientWidth + 1 }
  })
  expect(m.firstTop, 'the page starts below the header').toBeGreaterThanOrEqual(m.hdBottom - 1)
  expect(m.nameW, 'the name has room').toBeGreaterThan(40)
  await shot(page, 'phone-390')
})

test('390: the last line of the page clears the bottom bar', async ({ page }) => {
  await open(page, 390)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(300)
  const gap = await page.evaluate(() => {
    const tab = document.querySelector('.tabbar')!.getBoundingClientRect().top
    const app = document.querySelector('.app')!
    const content = app.getBoundingClientRect().bottom - parseFloat(getComputedStyle(app).paddingBottom)
    return tab - content
  })
  expect(gap, 'room between the last line and the bar').toBeGreaterThanOrEqual(0)
})

test('948: a card keeps its label whole', async ({ page }) => {
  await open(page, 948)
  const cut = await page.evaluate(() => [...document.querySelectorAll('.kc .kl')].filter((l) => l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent))
  expect(cut).toEqual([])
  await shot(page, 'tablet-948')
})

test('1440: the account menu closes on a real Escape', async ({ page }) => {
  await open(page, 1440)
  await page.locator('.account-btn').click()
  await expect(page.locator('.account-menu [role="menu"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.account-menu [role="menu"]')).toHaveCount(0)
  await shot(page, 'desktop-1440')
})

test('Mentions: its page stays on the page, and the palette has its entry', async ({ page }) => {
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: { mentions: [], sources: [], words: { default: [HISTORY_DOMAIN, 'History'], added: [], max: 10, suggested: [], rules: { topic: [], required: [], excluded: [], blocked: [] } }, driving: null } }))
  await open(page, 1440, '/mentions')
  await expect(page).toHaveURL(/\/mentions/)
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d`)
  await expect(page.locator('.hd')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('mentions')
  await expect(page.locator('.palbox .pi').filter({ hasText: 'Mentions' }).first()).toBeVisible()
})
