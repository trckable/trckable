// The filters in force: a chip for each, the cross takes it off, Clear for two or more, Back undoes the last, Escape does not keep a hidden one,
// and Live has neither a period nor filters. Chromium only (the site with a few days behind it).
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the panel')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'chips e2e password 1'

// One session for every test of the file, made by whichever worker gets there first (signing in is rate limited).
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'chips-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `chips-${Date.now()}@example.com`
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
  // An empty v is the address with no view: the suite would otherwise send it to Explore, which opens the panel.
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
  await expect(page.locator('.brief')).toBeVisible()
}


const panel = (page: Page) => page.locator('#xp.on')
const chips = (page: Page) => page.locator('#xp .xchip2')
const visitors = (page: Page) => page.locator('#xp .kcs .kc').first().innerText()

for (const width of [1440, 390]) {
  test.describe(`at ${width}`, () => {
    test('a filter shows as a chip, the cross takes it off and the numbers come back', async ({ page }) => {
      await open(page, width)
      await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&x=overview`)
      await expect(panel(page)).toBeVisible()
      await expect(page.locator('#xp .kcs .kc').first()).toBeVisible()
      const all = await visitors(page)
      await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&x=overview&f=page%3A%2Fpricing`)
      await expect(chips(page)).toHaveCount(1)
      await expect(chips(page)).toContainText('Page: /pricing')
      await expect.poll(() => visitors(page)).not.toBe(all)
      await chips(page).locator('button').click()
      await expect(chips(page)).toHaveCount(0)
      await expect.poll(() => visitors(page)).toBe(all)
      await expect(page).not.toHaveURL(/[?&]f=/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    })

    test('two filters show Clear, and Clear takes both off', async ({ page }) => {
      await open(page, width)
      await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&x=overview&f=page%3A%2Fpricing&f=device%3Adesktop`)
      await expect(chips(page)).toHaveCount(2)
      await expect(page.locator('#xClr')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.locator('#xClr').click()
      await expect(chips(page)).toHaveCount(0)
      await expect(page.locator('#xClr')).toHaveCount(0)
    })

    test('Back undoes the last filter, and Escape leaves no hidden one', async ({ page }) => {
      await open(page, width)
      await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&x=overview`)
      await expect(panel(page)).toBeVisible()
      await page.locator('[data-xm="filt"]').click()
      await page.locator('#xm-filt [data-xfd="page"]').click()
      await page.locator('#xm-filt [data-xfv]').first().click()
      await expect(chips(page)).toHaveCount(1)
      await page.goBack()
      await expect(chips(page)).toHaveCount(0)
      await expect(panel(page)).toBeVisible()
      await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&x=overview&f=page%3A%2Fpricing`)
      await expect(chips(page)).toHaveCount(1)
      await page.keyboard.press('Escape')
      await expect(panel(page)).toHaveCount(0)
      await expect(page).not.toHaveURL(/[?&](f|xf)=/)
      await (width < 700 ? page.locator('.tabbar').getByRole('button', { name: 'Explore' }).click() : page.keyboard.press('e'))
      await expect(panel(page)).toBeVisible()
      await expect(chips(page)).toHaveCount(0)
    })
  })
}

test('Live has no period and no filters, and the Briefing gets its own back', async ({ page }) => {
  await open(page, 1440)
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&x=overview&f=page%3A%2Fpricing`)
  await expect(chips(page)).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await page.keyboard.press('l')
  await expect(page).toHaveURL(/view=live/)
  await expect(page).not.toHaveURL(/[?&](period|f|xf|x|compare)=/)
  await expect(page.locator('.xchip2')).toHaveCount(0)
  await expect(page.locator('#per, .mk-chip.per')).toHaveCount(0)
  // Live's keys are on once Live is drawn: a B before that goes nowhere.
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible()
  await page.keyboard.press('b')
  await expect(page).toHaveURL(/period=7d/)
  await expect(page.locator('.brief')).toBeVisible()
})

test('the palette takes the open panel to Live with nothing of it left behind, and the Briefing is as it was', async ({ page }) => {
  await open(page, 1440)
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&x=overview&f=page%3A%2Fpricing`)
  await expect(chips(page)).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+k')
  await page.locator('.pal input').fill('go to live')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/view=live/)
  await expect(page).not.toHaveURL(/[?&](period|f|xf|x|compare)=/)
  await expect(panel(page)).toHaveCount(0)
  await expect(page.locator('.xchip2')).toHaveCount(0)
  // Live's keys are on once Live is drawn: a B before that goes nowhere.
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible()
  await page.keyboard.press('b')
  await expect(page).toHaveURL(/period=7d/)
  await expect(page).toHaveURL(/xf=page/)
  await expect(chips(page)).toHaveCount(1)
})
