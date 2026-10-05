// The keys that press a control for you: S the site switcher, U your menu, ","
// Settings, / Filter, Shift S Share and R Replay. They are in the shortcuts list
// (?) with the others, can be changed there with the same conflict check, do
// nothing while a field has the keys or a dialog is open, and Shift S is not S.
import { expect, test, type Locator, type Page } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

// Set KEYS_SHOTS to a folder to also take the pictures for review.
const SHOTS = process.env.KEYS_SHOTS

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('shortcuts'), url: API }])
})

async function ready(page: Page) {
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data`)
  await expect(page.locator('.overview-chart .chart-wrap svg[role="img"]')).toBeVisible({ timeout: 15_000 })
}

/** Presses a key and waits for what it opens. A key pressed while the page is still settling (its pieces
 *  arrive one after another, and WebKit on a busy machine is the slowest to) can come to nothing: it is pressed
 *  again, but only after a long wait and never while its target is there, so a slow answer is not pressed twice. */
async function opens(page: Page, key: string, target: Locator) {
  for (let i = 0; i < 4; i++) {
    if (await target.isVisible()) return
    await page.keyboard.press(key)
    try {
      await expect(target).toBeVisible({ timeout: 6_000 })
      return
    } catch {
      // lost: press again
    }
  }
  await expect(target).toBeVisible()
}

test('S, U, comma, slash and Shift S open what their buttons open', async ({ page }) => {
  await ready(page)
  const sites = page.getByRole('dialog', { name: 'Sites' })
  const account = page.getByRole('menu', { name: 'Account' })

  await opens(page, 's', sites)
  await page.keyboard.press('Escape')
  await expect(sites).toBeHidden()

  await opens(page, 'u', account)
  await page.keyboard.press('Escape')
  await expect(account).toBeHidden()

  const filter = page.locator('[data-key="filter"]')
  await opens(page, '/', page.locator('[data-key="filter"][aria-expanded="true"]'))
  // The menu is its own chunk: it answers Escape once it has drawn.
  await expect(page.getByRole('searchbox').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(filter).toHaveAttribute('aria-expanded', 'false')

  // Shift S is Share, not the switcher.
  await opens(page, 'Shift+S', page.locator('.sd-modal'))
  await expect(sites).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.locator('.sd-modal')).toBeHidden()

  await opens(page, ',', page.getByRole('dialog', { name: /^Settings for/ }))
})

test('R plays and pauses Replay', async ({ page }) => {
  await ready(page)
  await page.addInitScript(() => localStorage.setItem('tkb_replay_speed', 'slow'))
  await page.reload()
  await expect(page.locator('.overview-chart .chart-wrap svg[role="img"]')).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('r')
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  await page.keyboard.press('r')
  await expect(page.getByRole('button', { name: /^Replay this period/ })).toBeVisible()
})

test('the keys do nothing while a field has them, or a dialog is open', async ({ page }) => {
  await ready(page)
  // Typing "s" in the Filter menu's search is typing.
  await page.keyboard.press('/')
  const search = page.getByRole('searchbox').first()
  await expect(search).toBeVisible()
  await search.focus()
  await page.keyboard.type('sus')
  await expect(page.getByRole('dialog', { name: 'Sites' })).toBeHidden()
  await page.keyboard.press('Escape')
  // Under a dialog the page is not the one being used.
  await page.keyboard.press('Shift+S')
  await expect(page.locator('.sd-modal')).toBeVisible()
  await page.keyboard.press('s')
  await expect(page.getByRole('dialog', { name: 'Sites' })).toBeHidden()
})

test('the list shows them in a group of their own, and a key an action has is refused', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('?')
  const list = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(list).toBeVisible()
  await expect(list.getByRole('heading', { name: 'On a dashboard' }).or(list.locator('.g-page b'))).toBeVisible()
  // Shift is spelt out, or drawn as ⇧ on a Mac.
  for (const [name, caps] of [['Switch site', 'S'], ['Your menu', 'U'], ['Settings', ','], ['Filter', '/'], ['Share', '(Shift|⇧) S'], ['Replay: play or pause', 'R']] as const) {
    await expect(list.getByRole('button', { name: new RegExp(`^${name}: ${caps}\\.`) })).toBeVisible()
  }
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.screenshot({ path: `${SHOTS}/shortcuts-1280-${scheme}.png` })
    }
  }
  // Record Switch site as "c": Compare has it.
  await list.getByRole('button', { name: /^Switch site: S\./ }).click()
  await page.keyboard.press('c')
  await expect(list.getByRole('alert')).toContainText('already means “Compare”')
  await page.keyboard.press('Escape')
})
