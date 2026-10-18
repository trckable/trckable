// The site menu lists only the sites it is given (one team's): a finder from six sites (a letter brings it up on a shorter list),
// a domain line only where two names clash, All sites with the total of these sites, one Add a site in the foot; keyboard
// and phone. The sites are made up through the API's answers, so the count is exact whatever the other suites make.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const site = (id: string, domain: string, name = domain) => ({ id, domain, name, timezone: 'UTC', currency: 'USD', proxy_key: '', last_event_at: Math.floor(Date.now() / 1000) - 60 })
const SHORT = [site('s1', 'one.test', 'One'), site('s2', 'two.test', 'Two'), site('s3', 'blog.a.test', 'Blog'), site('s4', 'blog.b.test', 'Blog')]
const LONG = [...SHORT, site('s5', 'five.test', 'Five'), site('s6', 'six.test', 'Six'), site('s7', 'seven.test', 'Seven')]

/** The page answers /sites with `sites`, and /overview with their numbers plus a site of another team, which the menu must not add. */
async function serve(page: Page, sites: ReturnType<typeof site>[]) {
  await page.route(/\/api\/v1\/sites(\?.*)?$/, (route) => route.fulfill({ json: { sites } }))
  await page.route(/\/api\/v1\/overview/, (route) =>
    route.fulfill({
      json: {
        days: 7,
        sites: [...sites, site('other', 'other.test')].map((s, i) => ({ id: s.id, domain: s.domain, name: s.name, visitors: 100, pageviews: 100, bounce_rate: 0, previous_visitors: 0, series: [0, i === sites.length ? 500 : 10], online: 0, currency: 'USD', exponent: 2 })),
      },
    }),
  )
}

async function open(page: Page) {
  await page.goto(`${API}/one.test`)
  await page.locator('#siteBtn').click()
  const menu = page.locator('#siteMenu.on')
  await expect(menu).toBeVisible()
  return menu
}

for (const [name, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]] as const) {
  test.describe(name, () => {
    test.use({ viewport: { width, height } })
    test.beforeEach(async ({ page }) => {
      await page.context().addCookies([{ name: 'trckable_session', value: await session('site-menu'), url: API }])
    })

    test('lists only the sites it is given, with the total of those', async ({ page }) => {
      await serve(page, SHORT)
      const menu = await open(page)
      await expect(menu.locator('[data-site]')).toHaveCount(4)
      await expect(menu.getByText('other.test')).toHaveCount(0)
      await expect(menu.locator('.mi.all .now')).toHaveText('40')
      await expect(menu.getByRole('button', { name: /Add a site/ })).toHaveCount(1)
    })

    test('a short list has no finder, a letter brings it up, a long one has it', async ({ page }) => {
      await serve(page, SHORT)
      let menu = await open(page)
      await expect(menu.locator('#siteFind')).toHaveCount(0)
      await page.keyboard.type('w')
      await expect(menu.locator('#siteFind')).toHaveValue('w')
      await expect(menu.locator('#siteFind')).toBeFocused()
      await expect(menu.locator('[data-site]')).toHaveCount(1) // Two
      await page.unroute(/\/api\/v1\/sites(\?.*)?$/)
      await page.unroute(/\/api\/v1\/overview/)
      await serve(page, LONG)
      menu = await open(page)
      await expect(menu.locator('#siteFind')).toBeVisible()
      await expect(menu.locator('[data-site]')).toHaveCount(7)
    })

    test('says the domain only where two names clash', async ({ page }) => {
      await serve(page, SHORT)
      const menu = await open(page)
      await expect(menu.locator('[data-site="s3"] .d')).toHaveText('blog.a.test')
      await expect(menu.locator('[data-site="s4"] .d')).toHaveText('blog.b.test')
      await expect(menu.locator('[data-site="s1"] .d')).toHaveCount(0)
    })

    test('works from the keyboard: arrows move, a digit opens, Escape closes', async ({ page }) => {
      await serve(page, SHORT)
      const menu = await open(page)
      await page.keyboard.press('ArrowDown')
      await expect(menu.locator('[data-stop]').nth(2)).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(page.locator('#siteMenu.on')).toHaveCount(0)
      await page.locator('#siteBtn').click()
      await page.keyboard.press('2')
      await expect(page).toHaveURL(/two\.test/)
    })
  })
}
