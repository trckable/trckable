// Fixes from the v2 UX audit: a section of the settings is an address, ⌘K finds the places the menus hold, the sheets
// of the Briefing never stack, and the Briefing and Live do not move while they load.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough')

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('ux-audit')
})

async function open(page: Page, width: number, query: string, measure = false) {
  await page.setViewportSize({ width, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  if (measure) {
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number }
      w.__cls = 0
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value
      }).observe({ type: 'layout-shift', buffered: true })
    })
  }
  await page.goto(`${API}/${HISTORY_DOMAIN}${query}${query ? '&' : '?'}v=`)
}

const cls = (page: Page) => page.evaluate(() => (window as unknown as { __cls: number }).__cls)

for (const width of [1440, 390]) {
  for (const view of ['briefing', 'live']) {
    test(`the ${view} does not move while it loads at ${width}`, async ({ page }) => {
      await open(page, width, `?view=${view}`, true)
      await expect(page.locator(view === 'live' ? '.liveview' : '.brief')).toBeVisible()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1500)
      expect(await cls(page)).toBe(0)
    })
  }
}

test('Explore at full width has the period, and its menu changes it', async ({ page }) => {
  await open(page, 1440, '?view=briefing')
  await page.locator('.mk-chip.exb').click()
  await page.locator('.xfull').click()
  const chip = page.locator('#xp #xperBtn')
  await expect(chip).toBeVisible()
  await chip.click()
  await page.locator('#xperMenu').getByRole('button', { name: /Last 7 days/ }).click()
  await expect(page).toHaveURL(/period=7d/)
  await expect(chip).toContainText('Last 7 days')
})

test('the foot waits for a slow Briefing: nothing moves when its numbers arrive late', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 400_000, uploadThroughput: -1 })
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number }
    w.__cls = 0
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&v=`)
  await expect(page.locator('.brief')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(4000)
  expect(await cls(page)).toBe(0)
})

test('a section of the settings is in the address, opens from it, and leaves with the dialog', async ({ page }) => {
  await open(page, 1280, '?view=briefing')
  await expect(page.locator('.brief')).toBeVisible()
  await page.keyboard.press(',')
  await expect(page.getByRole('dialog', { name: /^Settings for/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Alerts' }).click()
  await expect(page).toHaveURL(/settings=alerts/)
  await page.reload()
  await expect(page.getByRole('dialog', { name: /^Settings for/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Alerts' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /^Settings for/ })).toHaveCount(0)
  await expect(page).not.toHaveURL(/settings=/)
})

test('⌘K finds settings, alerts, share, the theme and sign out', async ({ page }) => {
  await open(page, 1280, '?view=briefing')
  await expect(page.locator('.brief')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const input = page.locator('.palbox input')
  await expect(input).toBeVisible()
  for (const [word, row] of [['alerts', 'Settings · Alerts'], ['share', 'Settings · Sharing'], ['dark', 'Theme · Dark'], ['sign out', 'Sign out']]) {
    await input.fill(word)
    await expect(page.locator('.palbox .pi', { hasText: row })).toBeVisible()
  }
  await input.fill('alerts')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'Alerts' })).toHaveAttribute('aria-selected', 'true')
})

test('only one sheet of the Briefing is open at a time, and Escape closes it', async ({ page }) => {
  await open(page, 1280, '?view=briefing&period=7d')
  await expect(page.locator('.brief')).toBeVisible()
  await page.locator('.nbtn').click()
  await expect(page.locator('aside.cd')).toHaveCount(1)
  await expect(page.locator('aside.cd')).toContainText(/note/i)
  // The email preview sits behind the scrim: a click that reaches it opens the next sheet, and the first goes.
  await page.locator('[data-mpv]').evaluate((el) => (el as HTMLElement).click())
  await expect(page.locator('aside.cd')).toHaveCount(1)
  await expect(page.locator('aside.cd')).not.toContainText(/notes/i)
  await page.keyboard.press('Escape')
  await expect(page.locator('aside.cd')).toHaveCount(0)
})
