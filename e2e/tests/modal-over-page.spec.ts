// Every modal opens over the page it was opened from: the page stays in the DOM, visible and filled beneath the backdrop,
// and the backdrop is the shared one (a 25% dim with a 4px blur). Each modal is opened from its own entry point.
import { expect, test, type Page } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'
import { milestone, mockFeed, siteIdOf } from './bell-feed-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the backdrop')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

/** What the page shows under the backdrop: the surfaces that carry it, each drawn (not hidden, not collapsed) and not empty. */
async function pageBeneath(page: Page, surface: string) {
  const look = () =>
    page.evaluate((sel) => {
      const el = document.querySelector<HTMLElement>(sel)
      if (!el) return { found: false, shown: false, text: 0 }
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return { found: true, shown: s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.5 && r.width > 200 && r.height > 200, text: el.innerText.trim().length }
    }, surface)
  // The page fills in as its data arrives: wait for it to be drawn and filled, then read it.
  await expect.poll(async () => (await look()).found, { message: `${surface} is in the page` }).toBe(true)
  await expect.poll(async () => (await look()).shown, { message: `${surface} is drawn` }).toBe(true)
  await expect.poll(async () => (await look()).text, { message: `${surface} has content` }).toBeGreaterThan(40)
}

/** The shared backdrop: one dim, one blur. */
async function backdrop(page: Page) {
  const back = page.locator('.modal-back:not(.leaving)').last()
  await expect(back).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.25)')
  await expect(back).toHaveCSS('backdrop-filter', /blur\(4px\)/)
}

const PAGES = [
  { name: 'Live', url: `/${STEADY_DOMAIN}?view=live`, surface: '.liveview' },
  { name: 'Explore', url: `/${STEADY_DOMAIN}?view=briefing&x=overview`, surface: '#xp.on' },
]

type Entry = { name: string; feed?: (site: string) => object[]; palette?: string }

const SURGE = { json: { surge: { id: 'x', started: 0, ended: 0, online: 52, usual: 22, times: 2.4, why: { source: 'Facebook', source_dim: 'referrer', source_value: 'l.facebook.com', source_n: 31, source_usual: 2, page: '/pricing', before: 6, minutes: 8 }, story: { at: 0, series: [3, 4, 9, 18, 31, 44, 52, 47, 38, 29, 21, 15], step: 3, start: 0, peak: 52, peak_at: 0, now: 7, mobile: 33, devices: 52, sources: [{ name: 'Facebook', n: 31 }], pages: [{ name: '/pricing', n: 28 }], countries: [{ country: 'US', n: 30 }] } } } }

// Each modal, from the entry point a person uses: the bell's rows, and the search box's commands.
const ENTRIES: Entry[] = [
  { name: 'bell event card', feed: (site) => [{ id: 'goal:signup:1', kind: 'signup', site, at: Math.floor(Date.now() / 1000) - 600, what: 'signup' }] },
  { name: 'bell busy story', feed: (site) => [{ id: 'busy:surge:x', kind: 'busy', what: 'surge', site, at: Math.floor(Date.now() / 1000) - 3600, factor: 2.4, source: 'l.facebook.com', visitors: 52 }] },
  { name: 'bell milestone', feed: (site) => [milestone(site, '1k', 1000, 1)] },
  { name: 'site settings', palette: 'Site settings' },
  { name: 'milestones window', palette: 'Milestones' },
  { name: 'bounce guide', palette: 'Why visitors leave' },
  { name: 'tracking options', palette: 'Tracking options' },
]

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme })
    for (const where of PAGES) {
      for (const entry of ENTRIES) {
        test(`${entry.name} opens over ${where.name} (${colorScheme})`, async ({ page }) => {
          await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
          await page.setViewportSize({ width: 1280, height: 900 })
          const site = await siteIdOf(page, STEADY_DOMAIN)
          if (entry.feed) await mockFeed(page, () => entry.feed!(site))
          await page.route(/\/surges\/near/, (r) => r.fulfill(SURGE))
          await page.goto(`${API}${where.url}`)
          await pageBeneath(page, where.surface)
          if (entry.feed) {
            await page.locator('#bellBtn').click()
            await page.locator('#bellMenu .nf').first().click()
          } else {
            await page.keyboard.press('ControlOrMeta+K')
            // The palette's commands arrive with the page's data: Enter only once the one asked for is the one picked.
            await page.locator('.palbox input').fill(entry.palette!)
            await expect(page.locator('.palbox .pi.on')).toContainText(entry.palette!)
            await page.keyboard.press('Enter')
          }
          await expect(page.getByRole('dialog')).toBeVisible()
          // Past the dialog's own 160 ms fade: a page put away fades out over it.
          await page.waitForTimeout(500)
          await pageBeneath(page, where.surface)
          await backdrop(page)
          // The page it was opened from is still the page: the address names the same view.
          expect(new URL(page.url()).pathname).toBe(`/${STEADY_DOMAIN}`)
        })
      }
    }
  })
}

test('settings open over a site\'s sub page, which stays where it is', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${API}/${STEADY_DOMAIN}/incidents`)
  await page.waitForTimeout(2500)
  const main = page.locator('main, .app').first()
  const before = (await main.innerText()).length
  await page.keyboard.press('ControlOrMeta+K')
  await page.keyboard.type('Site settings')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await backdrop(page)
  expect(new URL(page.url()).pathname).toBe(`/${STEADY_DOMAIN}/incidents`)
  expect((await main.innerText()).length).toBeGreaterThan(before / 2)
})
