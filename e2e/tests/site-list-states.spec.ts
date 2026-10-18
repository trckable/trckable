// The site list shows every state of a site where its number would be (and the dot on its mark), All sites says how many are not fine,
// every number ends at one right edge, the row switches the site, and the row's ⋯ holds Site settings.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const now = Math.floor(Date.now() / 1000)
const site = (id: string, domain: string, extra: Record<string, unknown> = {}) => ({ id, domain, name: domain, timezone: 'UTC', currency: 'USD', proxy_key: '', last_event_at: now - 60, ...extra })
const SITES = [
  site('s1', 'one.test'),
  site('s2', 'quiet.test', { last_event_at: now - 23 * 3600 }),
  site('s3', 'down.test', { down_since: now - 2 * 3600 }),
  site('s4', 'fresh.test', { last_event_at: undefined }),
]

async function serve(page: Page) {
  await page.route(/\/api\/v1\/sites(\?.*)?$/, (route) => route.fulfill({ json: { sites: SITES } }))
  await page.route(/\/api\/v1\/overview/, (route) =>
    route.fulfill({
      json: { days: 7, sites: SITES.map((s, i) => ({ id: s.id, domain: s.domain, name: s.name, visitors: 100, pageviews: 100, bounce_rate: 0, previous_visitors: 0, series: [0, [12, 12, 3, 0][i]], online: 0, currency: 'USD', exponent: 2 })) },
    }),
  )
}

async function open(page: Page) {
  await page.goto(`${API}/one.test`)
  await page.locator('#siteBtn').click()
  const menu = page.locator('#siteMenu.on')
  await expect(menu).toBeVisible()
  await expect(menu.locator('.mi.all .now:not(.mk-dot)')).toBeVisible()
  return menu
}

for (const [name, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]] as const) {
  test.describe(name, () => {
    test.use({ viewport: { width, height } })
    test.beforeEach(async ({ page }) => {
      await page.context().addCookies([{ name: 'trckable_session', value: await session('site-list-states'), url: API }])
      await serve(page)
    })

    test('each state has its dot and its word, and All sites counts the ones that are not fine', async ({ page }) => {
      const menu = await open(page)
      const dot = (id: string) => menu.locator(`[data-site="${id}"] .mkwrap .mk-dot`)
      await expect(dot('s1')).not.toHaveClass(/down|idle|off/)
      await expect(menu.locator('[data-site="s1"] .now:not(.mk-dot)')).toHaveText('12')
      await expect(dot('s2')).toHaveClass(/idle/)
      await expect(menu.locator('[data-site="s2"] .now:not(.mk-dot)')).toHaveText(/^quiet 2\dh$/)
      await expect(dot('s3')).toHaveClass(/down/)
      await expect(menu.locator('[data-site="s3"] .now:not(.mk-dot)')).toHaveText(/^down /)
      await expect(dot('s4')).toHaveClass(/off/)
      await expect(menu.locator('[data-site="s4"] .now:not(.mk-dot)')).toHaveText('Not verified')
      const all = menu.locator('.mi.all .all-problems')
      await expect(all).toContainText('1 down')
      await expect(all).toContainText('1 quiet')
      await expect(all).toContainText('1 not verified')
    })

    test('every number and word ends at one right edge', async ({ page }) => {
      const menu = await open(page)
      const edges = await menu.locator('.mi .now:not(.mk-dot)').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right * 2) / 2))
      expect(edges.length).toBe(5)
      expect(new Set(edges).size).toBe(1)
    })

    test('clicking the name switches the site; the actions never cover it', async ({ page }) => {
      const menu = await open(page)
      const row = menu.locator('[data-site="s2"]')
      await row.hover()
      const acts = await row.locator('.site-acts').boundingBox()
      const btn = await row.locator('.mi.site').boundingBox()
      expect(acts && btn && acts.x >= btn.x + btn.width - 1).toBe(true)
      await row.locator('.nm').click()
      await expect(page).toHaveURL(/\/quiet\.test/)
    })

    test('the row’s ⋯ opens a menu that starts with Site settings', async ({ page }) => {
      const menu = await open(page)
      const row = menu.locator('[data-site="s3"]')
      await row.hover()
      const more = row.getByRole('button', { name: 'down.test: options' })
      const box = await more.boundingBox()
      expect(box && box.width >= 32 && box.height >= 32).toBe(true)
      await more.click()
      await expect(page.getByRole('menuitem').first()).toHaveText('Site settings')
      await expect(page.getByRole('menuitem').nth(1)).toHaveText('Share')
      await expect(page.getByRole('menuitem').nth(2)).toHaveText('Status page')
      await expect(page.getByRole('menuitem').nth(3)).toHaveText('Widgets')
      await page.getByRole('menuitem').first().click()
      await expect(page).toHaveURL(/settings=site/)
    })
  })
}
