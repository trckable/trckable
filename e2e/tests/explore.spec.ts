// Explore as a panel over the Briefing: opened from the chip, a card's "Go deeper" and the keyboard; its sections and
// the picker, a filter from a tapped row, full width with the section list, Escape and focus, and the phone's sheet.
// Chromium only (it runs against the site with a few days behind it).
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the panel')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'explore e2e password 1'

// One session for every test of the file, made by whichever worker gets there first (signing in is rate limited).
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'explore-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `explore-${Date.now()}@example.com`
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 4) throw e
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

let cookie = ''
test.beforeAll(async () => {
  cookie = await session()
})

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d`)
  await expect(page.locator('.brief')).toBeVisible()
}

const panel = (page: Page) => page.locator('#xp.on')
const pick = async (page: Page, name: RegExp) => {
  await page.locator('[data-xm="pick"]').click()
  await page.locator('#xm-pick').getByRole('menuitem', { name }).click()
}

test('the chip opens it over the Briefing, and Escape, the cross and the dim shut it', async ({ page }) => {
  await open(page, 1440)
  await page.locator('.chip.exb').click()
  await expect(panel(page)).toBeVisible()
  await expect(page).toHaveURL(/view=briefing/)
  await expect(page.locator('#xp .kcs .kc')).toHaveCount(4)
  await expect(page.locator('#xpSub')).toContainText(HISTORY_DOMAIN)
  const box = (await page.locator('#xp').boundingBox())!
  expect(Math.round(box.width), 'a side panel 560 px wide').toBe(560)
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await page.locator('.chip.exb').click()
  await page.locator('#xpClose').click()
  await expect(panel(page)).toHaveCount(0)
  await page.locator('.chip.exb').click()
  await page.mouse.click(100, 400)
  await expect(panel(page)).toHaveCount(0)
})

test('the picker has ten sections in four groups, and the tabs of a section stay in it', async ({ page }) => {
  await open(page, 1440)
  await page.locator('.chip.exb').click()
  await page.locator('[data-xm="pick"]').click()
  await expect(page.locator('#xm-pick .xgl')).toHaveText(['Traffic', 'Audience', 'Results', 'Site'])
  await expect(page.locator('#xm-pick .xmi')).toHaveCount(10)
  await page.locator('#xm-pick').getByRole('menuitem', { name: /^Sources/ }).click()
  await expect(page.locator('.xsub').getByRole('tab')).toHaveText(['Channels', 'Referrers', 'UTMs', 'Search'])
  await page.getByRole('tab', { name: 'Referrers' }).click()
  await expect(page.getByRole('tab', { name: 'Referrers' })).toHaveAttribute('aria-selected', 'true')
  // Payments are not connected here: Sales says so and tags itself in the picker.
  await page.locator('[data-xm="pick"]').click()
  await expect(page.locator('#xm-pick .xmi', { hasText: 'Sales' }).locator('.xtag')).toHaveText('Connect')
  await page.locator('#xm-pick').getByRole('menuitem', { name: /^Sales/ }).click()
  await expect(page.locator('#xp .srow.big')).toContainText('No revenue yet')
})

test('a tapped row filters, the chip takes it off, and Show all lists the rest', async ({ page }) => {
  await open(page, 1440)
  await page.locator('.chip.exb').click()
  await pick(page, /^Pages/)
  const rows = page.locator('#xp .xt .xrw')
  await expect(rows.first()).toBeVisible()
  const first = (await rows.first().locator('.bar span').textContent())!
  await rows.first().click()
  await expect(page.locator('#xp .xchip2')).toContainText(first)
  await page.locator('#xp .xchip2 button').click()
  await expect(page.locator('#xp .xchip2')).toHaveCount(0)
  // The filter menu: a dimension, then its values; Views is empty until one is saved.
  await page.locator('[data-xm="filt"]').click()
  await page.locator('#xm-filt .xmi').first().click()
  await expect(page.locator('#xm-filt .xmi.back')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#xm-filt.on')).toHaveCount(0)
  await expect(panel(page)).toBeVisible()
})

test('full width has the section list beside it, and F, Tab and Escape keep to the panel', async ({ page }) => {
  await open(page, 1440)
  await page.keyboard.press('Meta+k')
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('f')
  await expect(page.locator('#xp.full .xrail .xri')).toHaveCount(10)
  await page.locator('#xp .xrail').getByRole('button', { name: /^Speed/ }).click()
  await expect(page.locator('#xp .kcs.k3 .kc')).toHaveCount(3)
  await page.getByRole('button', { name: 'Collapse the section list' }).click()
  await expect(page.locator('#xp .xrail.c')).toBeVisible()
  await page.keyboard.press('f')
  await expect(page.locator('#xp.full')).toHaveCount(0)
  for (let i = 0; i < 30; i++) await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.getElementById('xp')!.contains(document.activeElement)), 'Tab stays in the panel').toBe(true)
  // A menu opens from its button with the arrow, Escape shuts it first and the panel after.
  await page.locator('[data-xm="pick"]').focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('#xm-pick.on')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#xm-pick.on')).toHaveCount(0)
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
})

test('Go deeper on a card opens it over the Briefing with the thing filtered', async ({ page }) => {
  await open(page, 1440)
  await page.locator('.icard').first().getByRole('button', { name: /Go deeper/ }).click()
  await expect(panel(page)).toBeVisible()
  await expect(page).toHaveURL(/view=briefing/)
  await expect(page.locator('#xp .xtb')).toBeVisible()
})

test('on a phone it is a sheet from the bottom, opened by the bar, and its menus are sheets too', async ({ page }) => {
  await open(page, 390)
  await page.locator('.tabbar').getByRole('button', { name: 'Explore' }).click()
  await expect(panel(page)).toBeVisible()
  const bottom = (sel: string) => async () => {
    const b = (await page.locator(sel).boundingBox())!
    return Math.round(b.y + b.height)
  }
  expect(Math.round((await page.locator('#xp').boundingBox())!.width)).toBe(390)
  await expect.poll(bottom('#xp'), { message: 'it sits on the bottom edge' }).toBe(900)
  await page.locator('[data-xm="pick"]').click()
  await expect.poll(bottom('#xm-pick'), { message: 'the menu too' }).toBe(900)
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.locator('#xpClose').click()
  await expect(panel(page)).toHaveCount(0)
})
