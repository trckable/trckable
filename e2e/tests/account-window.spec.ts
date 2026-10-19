// The account window keeps one size on every tab, and on a phone its tabs are
// one row that does not scroll sideways.
import { expect, test } from './fixtures'
import { API, TOKEN } from '../playwright.config'
import { session } from './session'

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
]
const THEMES = ['dark', 'light'] as const
const SHOTS = process.env.ACCOUNT_SHOTS

for (const size of SIZES) {
  test(`the account window keeps one size on every tab (${size.name})`, async ({ page }) => {
    await page.context().addCookies([{ name: 'trckable_session', value: await session('account-window'), url: API }])
    await page.setViewportSize({ width: size.width, height: size.height })
    for (const theme of THEMES) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.goto(API + '/example.com?account=sites')
      const window = page.locator('.modal.window')
      await expect(window).toBeVisible({ timeout: 15_000 })
      const tabs = window.getByRole('tab')
      const count = await tabs.count()
      expect(count).toBeGreaterThan(1)
      // The owner badge in the head stays.
      await expect(window.locator('.window-head .tag').first()).toBeVisible()
      const boxes: unknown[] = []
      for (let i = 0; i < count; i++) {
        await tabs.nth(i).click()
        await expect(tabs.nth(i)).toHaveAttribute('aria-current', 'true')
        await window.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
        boxes.push(await window.boundingBox())
        if (size.name === 'phone') {
          const nav = window.locator('.window-nav')
          expect(await nav.evaluate((el) => el.scrollWidth <= el.clientWidth), `tab row scrolls at tab ${i}`).toBe(true)
        }
        if (SHOTS) await page.waitForTimeout(300)
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${size.width}-${theme}-${i}-${await tabs.nth(i).getAttribute('aria-label')}.png` })
      }
      for (const b of boxes) expect(b).toEqual(boxes[0])
      if (size.name === 'desktop') expect((boxes[0] as { height: number }).height).toBe(Math.min(720, size.height - 64))
      if (size.name === 'phone') expect(boxes[0]).toMatchObject({ x: 8, y: 44, width: size.width - 16, height: size.height - 52 })
    }
  })
}

test('site settings never scrolls sideways on a phone or a big phone, shows no Off flag on a tab, and lists a choice that is off as off', async ({ page, request }) => {
  const sites = (await (await request.get(`${API}/api/v1/sites`, { headers: { Authorization: 'Bearer ' + TOKEN } })).json()).sites as { id: string; domain: string }[]
  const site = sites.find((s) => s.domain === 'example.com')!.id
  await page.context().addCookies([{ name: 'trckable_session', value: await session('account-window'), url: API }])
  for (const width of [390, 660, 700]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(API + `/settings?site=${site}&tab=site`)
    const window = page.locator('.modal.window')
    await expect(window).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(300)
    const over = await window.evaluate((el) => [el, ...Array.from(el.querySelectorAll('.window-body'))].map((n) => n.scrollWidth - n.clientWidth))
    expect(over.every((o) => o <= 0), `sideways overflow at ${width}: ${over}`).toBe(true)
  }
  // No tab carries an Off flag any more: a choice that is off shows its state in What the script records.
  await expect(page.locator('.window-nav button:has(.tag)')).toHaveCount(0)
  await page.request.put(`${API}/api/v1/sites/${site}/modules/heatmaps`, { headers: { Authorization: 'Bearer ' + TOKEN, 'X-Trckable-Request': '1' }, data: { enabled: false } })
  await page.goto(API + `/settings?site=${site}&tab=site`)
  const list = page.locator('#script-records')
  await expect(list.getByRole('switch', { name: 'Heatmaps', exact: true })).toHaveAttribute('aria-checked', 'false')
  await expect(list.getByRole('switch', { name: 'Goals', exact: true })).toBeVisible()
})

test('the avatar menu holds six rows; the rest is in the account window and ⌘K', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough')
  await context.addCookies([{ name: 'trckable_session', value: await session('account-window'), url: API }])
  await page.goto(API + '/example.com?view=briefing')
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Account' })
  const rows = menu.locator('[role="menuitem"], [role="menuitemradio"]')
  await expect(rows).toHaveCount(6) // Profile, the three themes, Shortcuts, Sign out
  for (const gone of ['Language', 'Tracking options', 'Install app', 'Exclude this browser']) await expect(menu.getByRole('menuitem', { name: gone })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // The window has them as lines.
  await page.goto(API + '/example.com?view=briefing&account=profile')
  const win = page.getByRole('dialog', { name: 'Profile, your account' })
  await expect(win.getByRole('combobox', { name: 'Language' })).toBeVisible()
  await expect(win.getByRole('button', { name: /^Tracking options/ })).toBeVisible()
  await expect(win.getByRole('button', { name: 'Exclude' })).toBeVisible()
  await page.keyboard.press('Escape')

  // ⌘K finds each.
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const input = page.locator('.pal.on .palbox input')
  await expect(input).toBeVisible() // the list is its own chunk
  for (const word of ['Language · Deutsch', 'Tracking options', 'Shortcuts', 'Profile', 'Exclude this browser']) {
    await input.fill(word)
    await expect(page.locator('.pal.on .pi', { hasText: word }).first()).toBeVisible()
  }
  await input.fill('Profile')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Profile, your account' })).toBeVisible()
})
