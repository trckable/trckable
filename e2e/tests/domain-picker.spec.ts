// A site seen on ten domains: the site menu lists sites only; a small picker after the site's name lists the domains,
// and its choice is the page's own filter. On a phone it stays on the header's one line.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the picker')

const SHOTS = '/private/tmp/claude-501/-Users-albi-Projects-trckable/ca6f67f6-3760-464f-975f-418264032c74/scratchpad'
const NAMES = ['www', 'blog', 'docs', 'app', 'status', 'cdn', 'shop', 'help', 'api', 'beta']
let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

for (const [width, colorScheme] of [[1280, 'dark'], [1280, 'light'], [390, 'dark']] as const) {
  test(`ten domains are one picker, not menu rows, ${width}px ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width, height: 900 })
    // The report says the site was seen on ten domains.
    await page.route(/\/api\/v1\/sites\/[^/]+\/report(\?|$)/, async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      for (const k of ['current', 'previous']) {
        if (!body[k]) continue
        body[k].hosts = NAMES.length
        body[k].dims = { ...body[k].dims, hostname: NAMES.map((n, i) => ({ value: `${n}.${STEADY_DOMAIN}`, visitors: 44008 - i * 4100 })) }
      }
      await route.fulfill({ response: res, json: body })
    })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
    const picker = page.locator('.dompick-btn')
    await expect(picker).toBeVisible({ timeout: 20_000 })
    await expect(picker).toHaveText('All domains')
    // The header stays one line: the picker sits beside the site's name, inside the header's row.
    const head = await page.locator('.hd').boundingBox()
    const pb = await picker.boundingBox()
    expect(pb!.y + pb!.height).toBeLessThanOrEqual(head!.y + head!.height)
    // The site menu has sites and no domain rows.
    await page.locator('#siteBtn').click()
    await expect(page.locator('#siteMenu .mi').first()).toBeVisible()
    await expect(page.locator('#siteMenu .dom-row')).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/domains-menu-${width}-${colorScheme}.png` })
    await page.keyboard.press('Escape')
    await picker.click()
    const list = page.locator('.dompick-menu.on')
    await expect(list.locator('[role=menuitemradio]')).toHaveCount(11)
    await expect(list.getByRole('searchbox')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/domains-picker-${width}-${colorScheme}.png` })
    await list.getByRole('menuitemradio', { name: /^docs/ }).click()
    await expect(page).toHaveURL(new RegExp(`f=hostname(%3A|:)docs\\.${STEADY_DOMAIN.replace('.', '\\.')}`))
    await expect(picker).toHaveText('docs')
  })
}
