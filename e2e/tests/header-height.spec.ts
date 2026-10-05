// The header's one row at 1280: every control in it is the same height (the
// dashboard's --hdr-h) and they sit on one centre line: the site card, Live/Data,
// Ask, the avatar; on a site's page, on All sites and in a shared link (its
// capsules). The Live card's title leads with the pulsing dot.
// Pictures for the review: HH_SHOTS=<folder> HH_SCHEME=light|dark.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.HH_SHOTS
const SCHEME = process.env.HH_SCHEME === 'light' ? 'light' : 'dark'
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }

const CONTROLS: Record<string, string> = {
  site: '.header .site-zone',
  liveData: '.header .view-switch',
  ask: '.header .btn.ask',
  avatar: '.header .account-btn',
  capsule: '.header .ctl-cap',
}

test.use({ colorScheme: SCHEME, viewport: { width: 1280, height: 844 } })

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('header-height')
})

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-1280-${SCHEME}.png`, clip: { x: 0, y: 0, width: 1280, height: 150 } })
}

async function same(page: Page, expected: string[], name: string, offRow: string[] = []) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await shot(page, name) // before the checks, so a failing run still has its picture
  const found: Record<string, number[]> = {}
  const mids: number[] = []
  for (const [key, selector] of Object.entries(CONTROLS)) {
    for (const el of await page.locator(selector).all()) {
      const box = await el.boundingBox()
      if (!box) continue
      ;(found[key] ??= []).push(Math.round(box.height * 100) / 100)
      if (!offRow.includes(key)) mids.push(box.y + box.height / 2)
    }
  }
  expect(Object.keys(found), 'the controls on this page').toEqual(expect.arrayContaining(expected))
  const token = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h')))
  for (const [key, heights] of Object.entries(found)) for (const h of heights) expect(h, `${key} is ${h}px, ${JSON.stringify(found)}`).toBe(token)
  expect(Math.max(...mids) - Math.min(...mids), `centres ${JSON.stringify(mids)}`).toBeLessThanOrEqual(0.5)
}

test('a site page: the site card, Live/Data, Ask and the avatar are one height', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/example.com`)
  await expect(page.locator('.header .site-zone')).toBeVisible()
  await expect(page.locator('.header .account-btn')).toBeVisible()
  await same(page, ['site', 'liveData', 'avatar'], 'site', ['capsule'])
})

test('All sites: the same row, the same height', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/all`)
  await expect(page.locator('.all-sites')).toBeVisible()
  await same(page, ['site'], 'all', ['capsule'])
})

test('a shared link: its capsules are the same height', async ({ page, browser }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const list = (await (await page.request.get(`${API}/api/v1/sites`)).json()) as { sites: { id: string; domain: string }[] }
  const site = list.sites.find((s) => s.domain === 'example.com')!
  const res = await page.request.post(`${API}/api/v1/sites/${site.id}/shares`, { headers: H, data: { name: 'Look' } })
  expect(res.ok()).toBe(true)
  const { url } = (await res.json()) as { url: string }
  const reader = await browser.newContext({ viewport: { width: 1280, height: 844 }, colorScheme: SCHEME })
  const tab = await reader.newPage()
  await tab.goto(url)
  await expect(tab.locator('.header .share-who')).toBeVisible()
  await same(tab, ['capsule'], 'share')
  await reader.close()
})

test('the Live card leads with the dot: pulsing, or still for reduced motion', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/example.com?view=live`)
  await expect(page.locator('.live-now .live-calm')).toBeVisible({ timeout: 20_000 })
  await page.emulateMedia({ colorScheme: SCHEME, reducedMotion: 'no-preference' })
  await page.waitForTimeout(300)
  await shot(page, 'live') // before the checks, so a failing run still has its picture
  const dot = () => page.locator('.live-now .live-head-row h2').evaluate((el) => {
    const s = getComputedStyle(el, '::before')
    return { w: s.width, h: s.height, radius: s.borderTopLeftRadius, bg: s.backgroundColor, animation: s.animationName }
  })
  const ping = await page.locator('.view-switch .pulse').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await dot()).toEqual({ w: '8px', h: '8px', radius: '50%', bg: ping, animation: 'pulse' })
  await page.emulateMedia({ colorScheme: SCHEME, reducedMotion: 'reduce' })
  expect(await dot()).toEqual({ w: '8px', h: '8px', radius: '50%', bg: ping, animation: 'none' })
})
