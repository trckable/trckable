// A busy row in the bell opens the moment's story, and its one button lands in Explore on that site, time and source.
// The brand marks are the theme's text colour, not the brand's. An empty bell says so.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the bell')

const SHOTS = '/private/tmp/claude-501/-Users-albi-Projects-trckable/ca6f67f6-3760-464f-975f-418264032c74/scratchpad'
let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme })

    test(`a busy row opens its story, then Explore filtered (${colorScheme})`, async ({ page }) => {
      const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString().slice(0, 16)
      await page.route(/\/moments\?/, (r) => r.fulfill({ json: { moments: [{ t: iso(1), kind: 'surge', factor: 2.4, referrer: 'l.facebook.com', visitors: 52 }] } }))
      // The story the server keeps of that spell: its last hour, the sources and pages of it.
      await page.route(/\/surges\/near/, (r) => {
        const started = Number(new URL(r.request().url()).searchParams.get('t'))
        const series = [3, 4, 3, 5, 4, 6, 9, 18, 31, 44, 52, 47, 38, 29, 21, 15, 11, 9, 8, 7]
        return r.fulfill({
          json: { surge: { id: 'x', started, ended: started + 18 * 60, online: 52, usual: 22, times: 2.4, why: { source: 'Facebook', source_dim: 'referrer', source_value: 'l.facebook.com', source_n: 31, source_usual: 2, page: '/pricing', before: 6, minutes: 8 }, story: { at: started + 3600, series, step: 3, start: started, peak: 52, peak_at: started + 600, now: 7, mobile: 33, devices: 52, sources: [{ name: 'Facebook', n: 31 }, { name: 'Google', n: 12 }, { name: 'Direct', n: 9 }], pages: [{ name: '/pricing', n: 28 }, { name: '/', n: 17 }], countries: [{ country: 'US', n: 30 }, { country: 'DE', n: 14 }] } } },
        })
      })
      await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
      await page.waitForTimeout(4000)
      await page.locator('#bellBtn').click()
      // The panel hides whatever is behind it.
      const panel = await page.locator('#bellMenu.on').evaluate((e) => { const s = getComputedStyle(e); return { bg: s.backgroundColor, blur: s.backdropFilter } })
      expect(panel.bg).toMatch(/^rgb\(/)
      expect(panel.blur).toBe('none')
      const fb = page.locator('.nf', { has: page.getByRole('img', { name: 'Facebook' }) })
      await expect(fb).toBeVisible({ timeout: 15_000 })
      // The mark is the text colour of the theme, on a neutral tile.
      const mark = await fb.locator('.v-mark').evaluate((e) => getComputedStyle(e).color)
      expect(mark).not.toBe('rgb(8, 102, 255)')
      await page.screenshot({ path: `${SHOTS}/bellopen-bell-${colorScheme}.png` })
      await fb.click()
      const story = page.locator('.surge-modal')
      await expect(story).toBeVisible()
      await expect(story.locator('.sgm-head')).toHaveText(/^steady\.example was busy · (today|yesterday) \d\d:\d\d$/)
      await expect(story).toContainText('52')
      await expect(story.locator('.sgm-unit')).toHaveText('online')
      await expect(story.locator('.sgm-facts')).toContainText('Peak 52')
      await expect(story.locator('.sgm-tile')).not.toHaveCount(0)
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${SHOTS}/bellopen-story-${colorScheme}.png` })
      await story.getByRole('button', { name: 'See it in Explore' }).click()
      await expect(page).toHaveURL(/[?&]x=overview/)
      expect(decodeURIComponent(page.url())).toContain('xf=referrer:l.facebook.com')
    })

    test(`an empty bell says so (${colorScheme})`, async ({ page }) => {
      await page.route(/\/moments\?/, (r) => r.fulfill({ json: { moments: [] } }))
      await page.route(/\/api\/v1\/incidents(\?|$)/, (r) => r.fulfill({ json: { incidents: [] } }))
      await page.route(/\/api\/v1\/sites\/[^/]+\/milestones(\?|$)/, (r) => r.fulfill({ json: { enabled: true, milestones: [], moment: null } }))
      await page.route(/\/api\/v1\/sites\/[^/]+\/mentions(\?|$)/, (r) => r.fulfill({ json: { mentions: [] } }))
      await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
      await page.waitForTimeout(4000)
      await page.locator('#bellBtn').click()
      const menu = page.locator('#bellMenu.on')
      await expect(menu.getByText('You’re all caught up')).toBeVisible({ timeout: 15_000 })
      await expect(menu.getByRole('button', { name: 'Mark all read' })).toHaveCount(0)
      await expect(menu.getByRole('button', { name: 'Alert settings' })).toBeVisible()
      await page.screenshot({ path: `${SHOTS}/bellopen-empty-${colorScheme}.png` })
    })
  })
}
