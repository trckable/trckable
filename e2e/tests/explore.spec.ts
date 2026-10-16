// Explore, the bell and the search box (⌘K) of the walkthrough's screens: the ten sections in a panel over the page, what
// it can be narrowed by, full width with a rail, the bell's list, and Peek as the search's first row. Chromium only.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the tab')

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

// The suite's page sends a dashboard address to the older Data (?v=explore) unless the address has a v of its own.
async function open(page: Page, width: number, query: string) {
  await page.setViewportSize({ width, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}${query}${query.includes('?') ? '&v=' : '?v='}`)
}

const panel = (page: Page) => page.locator('aside.xp.on')

test('the Explore chip opens the panel over the page; the picker holds ten sections; Escape closes it', async ({ page }) => {
  await open(page, 1280, '?view=briefing&period=7d')
  await expect(page.locator('.hero')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Explore all data' }).click()
  await expect(panel(page)).toBeVisible()
  await expect(page).toHaveURL(/[?&]x=overview/)
  // The briefing stays behind it.
  await expect(page.locator('.hero')).toBeVisible()
  await page.getByRole('button', { name: /Overview/ }).first().click()
  const names = ['Overview', 'Pages', 'Sources', 'Places', 'Tech', 'Goals & funnels', 'Sales', 'Speed', 'Mentions', 'Links & bots']
  await expect(page.locator('#xm-pick .xmi')).toHaveCount(names.length)
  for (const n of names) await expect(page.locator('#xm-pick').getByRole('menuitem', { name: new RegExp('^' + n.replace('&', '\\&')) })).toBeVisible()
  await page.locator('#xm-pick').getByRole('menuitem', { name: /^Sources/ }).click()
  await expect(page).toHaveURL(/[?&]x=sources/)
  await expect(panel(page).getByRole('tab', { name: 'Referrers' })).toBeVisible()
  await panel(page).getByRole('tab', { name: 'Referrers' }).click()
  await expect(page).toHaveURL(/[?&]x=referrers/)
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/[?&]x=/)
})

test('a row narrows everything; the chip takes it off; Views and More are there', async ({ page }) => {
  await open(page, 1280, '?view=briefing&period=7d&x=pages')
  await expect(panel(page)).toBeVisible({ timeout: 15_000 })
  const rows = panel(page).locator('.xrw')
  await expect(rows.first()).toBeVisible({ timeout: 15_000 })
  await rows.first().click()
  const chip = panel(page).locator('.xchip2')
  await expect(chip).toHaveCount(1)
  await expect(page).toHaveURL(/[?&]xf=page/)
  await chip.getByRole('button', { name: /Remove/ }).click()
  await expect(chip).toHaveCount(0)
  // The filter menu: a dimension, then a value.
  await panel(page).getByRole('button', { name: /Filter/ }).click()
  await panel(page).locator('#xm-filt').getByRole('menuitem', { name: /^Page/ }).click()
  await panel(page).locator('#xm-filt').getByRole('menuitemradio').first().click()
  await expect(chip).toHaveCount(1)
  await panel(page).getByRole('button', { name: 'Views' }).click()
  await expect(panel(page).locator('#xm-views')).toContainText('Save current view')
  await page.keyboard.press('Escape')
  await panel(page).getByRole('button', { name: 'More' }).click()
  await expect(panel(page).locator('#xm-more')).toContainText('Export CSV')
})

test('f gives the panel the whole width, with the sections as a rail', async ({ page }) => {
  await open(page, 1280, '?view=briefing&period=7d&x=overview')
  await expect(panel(page)).toBeVisible({ timeout: 15_000 })
  const side = (await panel(page).boundingBox())!.width
  await page.keyboard.press('f')
  await expect(panel(page)).toHaveClass(/full/)
  await expect(panel(page).locator('.xrail .xri')).toHaveCount(10)
  expect((await panel(page).boundingBox())!.width).toBeGreaterThan(side + 100)
  await panel(page).locator('.xrail .xri', { hasText: 'Pages' }).click()
  await expect(page).toHaveURL(/[?&]x=pages/)
  await page.keyboard.press('f')
  await expect(panel(page)).not.toHaveClass(/full/)
})

test('on a phone Explore is a sheet from the bottom, opened by the bar', async ({ page }) => {
  await open(page, 390, '?view=briefing&period=7d')
  await expect(page.locator('.hero')).toBeVisible({ timeout: 15_000 })
  await page.locator('.tabbar').getByRole('button', { name: 'Explore' }).click()
  await expect(panel(page)).toBeVisible()
  const box = (await panel(page).boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(389)
  expect(box.y).toBeGreaterThan(20)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
})

test('⌘K opens the search whose first row asks Peek, and a table is one key away', async ({ page }) => {
  await open(page, 1280, '?view=briefing&period=7d')
  await expect(page.locator('.hero')).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('Control+k')
  const box = page.locator('.pal .palbox')
  await expect(box).toBeVisible()
  await expect(box.locator('.pi').first()).toContainText('Ask Peek')
  await page.keyboard.press('Escape')
  await expect(box).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await box.locator('input').fill('speed')
  await page.keyboard.press('Enter')
  await expect(panel(page)).toBeVisible()
  await expect(page).toHaveURL(/[?&]x=speed/)
})

test('the bell lists what happened and keeps what was read', async ({ page }) => {
  await open(page, 1280, '?view=briefing&period=7d')
  await expect(page.locator('.hero')).toBeVisible({ timeout: 15_000 })
  const bell = page.getByRole('button', { name: 'Notifications' })
  await bell.click()
  await expect(page.locator('#bellMenu')).toContainText('Notifications')
  await expect(page.locator('#bellMenu .nfh .lk3')).toBeVisible()
  await page.locator('#bellMenu .nfh .lk3').click()
  await expect(page.locator('#bellDot')).toBeHidden()
})
