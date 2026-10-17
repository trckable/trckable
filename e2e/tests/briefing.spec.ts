// The Briefing tab: switching to it from Live, a story opening in place, the
// period and its range picker, and a phone, where the tabs are the bar at the
// bottom. Chromium only (it runs against the site with a few days behind it).
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the tab')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'briefing e2e password 1'

// One session for every test of the file, made by whichever worker gets there first (signing in is rate limited).
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'briefing-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `briefing-${Date.now()}@example.com`
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

async function open(page: Page, width: number, query: string) {
  await page.setViewportSize({ width, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  // An empty v is the address with no view: the suite would otherwise send it to Explore, which opens the panel.
  await page.goto(`${API}/${HISTORY_DOMAIN}${query}${query ? '&' : '?'}v=`)
}

// The suite's page adds ?v=explore to a dashboard address; a bare address is what is asked about here, so the browser goes there itself.
async function bare(page: Page) {
  await page.evaluate((url) => location.assign(url), `${API}/${HISTORY_DOMAIN}`)
  await page.waitForLoadState('load')
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name })

test('Live to Briefing: the sentence, the ring, a card in place, and the period', async ({ page }) => {
  await open(page, 1280, '?view=live')
  await expect(page.locator('.liveview')).toBeVisible()
  await tab(page, 'Briefing').click()
  await expect(page).toHaveURL(/view=briefing/)
  await expect(tab(page, 'Briefing')).toHaveAttribute('aria-selected', 'true')
  // The tab opens on today; the site has no visits today, and says so plainly.
  await expect(page.locator('.hero .mk-hl').first()).toContainText('Nobody')
  // A week has people: the sentence, the ring, the four numbers.
  await page.locator('.pill').click()
  await page.locator('#perMenu').getByRole('button', { name: /^Last 7 days/ }).click()
  await expect(page).toHaveURL(/period=7d/)
  await expect(page.locator('.hero .mk-hl').first()).toContainText('47 people')
  // A site in its first week has no normal yet: it says so where the ring would be.
  await expect(page.locator('.sidecol .sn')).toContainText('learn your normal over 7 days')
  // Uptime has nothing measured here, so its card is left out instead of showing a dash.
  await expect(page.locator('.kcs .kc')).toHaveCount(3)
  // The range picker: Custom dates opens the calendar.
  await page.locator('.pill').click()
  await page.locator('#perMenu').getByRole('button', { name: /^Custom dates/ }).click()
  await expect(page.locator('#perMenu .cal .mk-cm')).toBeVisible()
  await page.keyboard.press('Escape')
  // The way deeper (a week in its first days has no card yet): Explore opens over the Briefing, which stays where it was.
  await page.getByRole('button', { name: /^Explore all data/ }).last().click()
  await expect(page.locator('#xp.on')).toBeVisible()
  await expect(page).toHaveURL(/view=briefing/)
})

test('the Briefing is remembered until Live is chosen', async ({ page }) => {
  await open(page, 1280, '?view=live')
  await tab(page, 'Briefing').click()
  await expect(page.locator('.brief')).toBeVisible()
  await bare(page)
  await expect(page.locator('.brief')).toBeVisible()
  await tab(page, 'Live').click()
  await expect(page).toHaveURL(/view=live/)
  expect(await page.evaluate(() => localStorage.getItem('trckable.tab'))).toBe('other')
})

test('on a phone the tabs are the bar at the bottom, and nothing runs off the side', async ({ page }) => {
  await open(page, 390, '?view=briefing&period=7d')
  const bar = page.locator('.tabbar')
  await expect(bar).toBeVisible()
  const box = (await bar.boundingBox())!
  expect(box.y + box.height, 'at the bottom of the screen').toBeGreaterThanOrEqual(899)
  await expect(page.locator('.hero .mk-hl.s')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await bar.getByRole('button', { name: 'Live' }).click()
  await expect(page.locator('.liveview')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('Live shows eight people at most, with no scroll inside the card', async ({ page }) => {
  await open(page, 1280, '?view=live')
  await expect(page.locator('.lon')).toBeVisible()
  expect(await page.locator('.lfeed .lv').count()).toBeLessThanOrEqual(8)
})

test('the page that Google Analytics sends people back to opens the import, and test payments say so with a way out', async ({ page }) => {
  await open(page, 1440, '?view=briefing&import=ga')
  await expect(page.getByRole('dialog').filter({ has: page.locator('.fa-import') })).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('Escape')
  await open(page, 1440, '?view=briefing&payments=test')
  await expect(page.getByText('test payments', { exact: false }).first()).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Back to live revenue' }).click()
  await expect(page).not.toHaveURL(/payments=test/)
})

test('the chart can be cut by week from the period menu, and Refresh is in the palette', async ({ page }) => {
  await open(page, 1440, '?view=briefing')
  await page.locator('#perBtn').click()
  await page.locator('#perMenu .mk-lseg button', { hasText: 'Week' }).click()
  await expect(page).toHaveURL(/bucket=week/)
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+k')
  const refresh = page.waitForRequest(/\/report/)
  await page.locator('.pal.on .palbox input').fill('refresh')
  await page.keyboard.press('Enter')
  await refresh
})

for (const width of [620, 640, 700]) {
  test(`at ${width} px the header holds: nothing passes the edge, the bell stays, Live is one tap away`, async ({ page }) => {
    await open(page, width, '?view=briefing')
    await expect(page.locator('.hero, .brief').first()).toBeVisible({ timeout: 20_000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    const [site, bell, avatar] = await Promise.all([page.locator('#siteBtn').boundingBox(), page.locator('#bellBtn').boundingBox(), page.getByRole('button', { name: 'Account' }).boundingBox()])
    expect({ site: !!site, bell: !!bell && bell.width > 0, avatar: !!avatar }).toEqual({ site: true, bell: true, avatar: true })
    expect(avatar!.x + avatar!.width).toBeLessThanOrEqual(width)
    // A page this narrow has the bar at the bottom; a little wider, the views are a row of the header, under the site.
    const views = await page.locator('#views').boundingBox()
    if (views) expect(views.y).toBeGreaterThan(site!.y + site!.height - 1)
    else await expect(page.locator('.tabbar').getByRole('button', { name: 'Live' })).toBeVisible()
    await (views ? page.locator('#views').getByRole('tab', { name: /^Live/ }) : page.locator('.tabbar').getByRole('button', { name: 'Live' })).click()
    await expect(page).toHaveURL(/view=live/)
  })
}

test('N and 4 pick Now and the last 28 days, and the ? list names them', async ({ page }) => {
  await open(page, 1280, '?view=briefing&period=7d')
  await expect(page.locator('.hero')).toBeVisible()
  await page.keyboard.press('4')
  await expect(page).toHaveURL(/period=28d/)
  await expect(page.locator('.hero')).toBeVisible()
  await page.keyboard.press('n')
  await expect(page).toHaveURL(/period=now/)
  await expect(page.locator('.hero')).toBeVisible()
  await page.keyboard.press('?')
  const list = page.getByRole('dialog')
  await expect(list).toContainText('Now')
  await expect(list).toContainText('Last 28 days')
})
