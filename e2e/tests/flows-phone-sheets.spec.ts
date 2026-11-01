// On a phone the bottom bar is under every sheet and menu: the last thing to press in each of them is fully on screen
// and is what a press at its centre reaches (nothing, the bar least of all, sits over it).
import { expect, test, type Page } from './fixtures'
import { flowSession, openFlow } from './flows-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the flows')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const SIZES = [
  { width: 390, height: 844 },
  { width: 360, height: 780 },
]

/** The last button, link or field inside `root` that is on screen is reachable: scrolled to, then hit-tested at its centre. */
async function lastIsReachable(page: Page, root: string) {
  const out = await page.evaluate(async (sel) => {
    const boxes = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
    const box = boxes[boxes.length - 1]
    if (!box) return 'no overlay'
    const items = [...box.querySelectorAll<HTMLElement>('button, a[href], input, select, [role=menuitem]')].filter((e) => e.getClientRects().length && !(e as HTMLButtonElement).disabled)
    const last = items[items.length - 1]
    if (!last) return 'nothing to press'
    last.scrollIntoView({ block: 'end' })
    await new Promise((r) => setTimeout(r, 700))
    const r = last.getBoundingClientRect()
    if (r.top < 0 || r.bottom > innerHeight + 2) return `not on screen: ${Math.round(r.top)}-${Math.round(r.bottom)} of ${innerHeight}`
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return hit && (hit === last || last.contains(hit)) ? 'ok' : `covered by ${hit?.className || hit?.tagName}`
  }, root)
  expect(`${root}: ${out}`).toBe(`${root}: ok`)
}

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    const go = async (page: Page, path = '?view=briefing') => {
      await openFlow(page, cookie, { width: size.width, scheme: 'dark' }, path)
      await page.setViewportSize(size)
      await expect(page.locator('.tabbar')).toBeVisible({ timeout: 20_000 })
    }

    test('the sheets: notes, email preview, Explore, settings', async ({ page }) => {
      await go(page)
      await page.getByRole('button', { name: /^Notes/ }).first().click()
      await expect(page.locator('.cd.on')).toBeVisible()
      await lastIsReachable(page, '.cd.on')
      await page.keyboard.press('Escape')
      await expect(page.locator('.cd.on')).toHaveCount(0) // put away before the next one opens, whatever the runner's speed
      await page.getByRole('button', { name: /Emailed daily at|The daily email is off/ }).click()
      await expect(page.locator('.cd.on')).toBeVisible()
      await lastIsReachable(page, '.cd.on')
      await page.keyboard.press('Escape')
      await expect(page.locator('.cd.on')).toHaveCount(0) // put away before the next one opens, whatever the runner's speed
      await page.getByRole('button', { name: /^Explore/ }).filter({ visible: true }).last().click()
      await expect(page.locator('#xp.on button:visible').first()).toBeVisible({ timeout: 20_000 })
      await lastIsReachable(page, '#xp.on')
      await page.keyboard.press('Escape')
      await expect(page.locator('#xp.on')).toHaveCount(0)
      await go(page, '?view=briefing&settings=alerts')
      await expect(page.getByRole('dialog', { name: /^Settings for/ })).toBeVisible({ timeout: 20_000 })
      await lastIsReachable(page, '.modal-back [role=dialog]')
    })

    test('the menus: sites, notifications, account', async ({ page }) => {
      await go(page)
      await page.getByRole('button', { name: /^history\.example/ }).first().click()
      await expect(page.locator('#siteMenu.on, .mk-menu.on, .pop.sites').first()).toBeVisible()
      await lastIsReachable(page, '#siteMenu, .mk-menu.on, .pop.sites')
      await page.keyboard.press('Escape')
      await expect(page.locator('#siteMenu.on, .mk-menu.on, .pop.sites')).toHaveCount(0)
      await page.getByRole('button', { name: 'Notifications' }).click()
      await expect(page.locator('.cd.on, .mk-menu.on').first()).toBeVisible()
      await lastIsReachable(page, '.cd.on, .mk-menu.on')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: /^Account/ }).first().click()
      await expect(page.locator('.more-menu').first()).toBeVisible()
      await lastIsReachable(page, '.more-menu')
    })
  })
}
