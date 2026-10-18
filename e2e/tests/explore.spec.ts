// Explore as a panel over the Briefing: opened from the chip and the keyboard (E; a card's "Go deeper" is in briefing.spec.ts); its sections and
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
  // An empty v is the address with no view: the suite would otherwise send it to Explore, which opens the panel.
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
  await expect(page.locator('.brief')).toBeVisible()
}

const panel = (page: Page) => page.locator('#xp.on')
const pick = async (page: Page, name: RegExp) => {
  await page.locator('[data-xm="pick"]').click()
  await page.locator('#xm-pick').getByRole('menuitem', { name }).click()
}

test('the chip opens it over the Briefing, and Escape, the cross and the dim shut it', async ({ page }) => {
  await open(page, 1440)
  await page.locator('.mk-chip.exb').click()
  await expect(panel(page)).toBeVisible()
  await expect(page).toHaveURL(/view=briefing.*x=overview/)
  await expect(page.locator('#xp .kcs .kc')).toHaveCount(4)
  await expect(page.locator('#xpSub')).toContainText(HISTORY_DOMAIN)
  const box = (await page.locator('#xp').boundingBox())!
  expect(Math.round(box.width), 'a side panel 560 px wide').toBe(560)
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/[?&]x=/)
  await page.locator('.mk-chip.exb').click()
  await page.locator('#xpClose').click()
  await expect(panel(page)).toHaveCount(0)
  await page.locator('.mk-chip.exb').click()
  await page.mouse.click(100, 400)
  await expect(panel(page)).toHaveCount(0)
})

test('the picker has eleven sections in four groups, and the tabs of a section stay in it', async ({ page }) => {
  await open(page, 1440)
  await page.locator('.mk-chip.exb').click()
  await page.locator('[data-xm="pick"]').click()
  await expect(page.locator('#xm-pick .xgl')).toHaveText(['Traffic', 'Audience', 'Results', 'Site'])
  await expect(page.locator('#xm-pick .xmi')).toHaveCount(11)
  await page.locator('#xm-pick').getByRole('menuitem', { name: /^Sources/ }).click()
  await expect(page.locator('.xsub').getByRole('tab')).toHaveText(['Channels', 'Referrers', 'UTMs', 'UTM source', 'UTM medium', 'Search', 'Sources that pay'])
  await page.getByRole('tab', { name: 'Referrers' }).click()
  await expect(page.getByRole('tab', { name: 'Referrers' })).toHaveAttribute('aria-selected', 'true')
  // Payments are not connected here: Sales says so and tags itself in the picker.
  await page.locator('[data-xm="pick"]').click()
  await expect(page.locator('#xm-pick .xmi', { hasText: 'Sales' }).locator('.xtag')).toHaveText('Connect')
  await page.locator('#xm-pick').getByRole('menuitem', { name: /^Sales/ }).click()
  await expect(page.locator('#xp .lkc')).toContainText('See what each source earns')
})

test('a tapped row filters, the chip takes it off, and Show all lists the rest', async ({ page }) => {
  await open(page, 1440)
  await page.locator('.mk-chip.exb').click()
  await pick(page, /^Pages/)
  const rows = page.locator('#xp .xt .xrw')
  await expect(rows.first()).toBeVisible()
  const first = (await rows.first().locator('.mk-bar span').textContent())!
  await rows.first().click()
  await expect(page.locator('#xp .xchip2')).toContainText(first)
  await expect(page).toHaveURL(/xf=page/)
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
  await page.keyboard.press('e')
  await expect(page.locator('#xp.on .xtb')).toBeVisible()
  await page.keyboard.press('f')
  await expect(page.locator('#xp.full .xrail .xri')).toHaveCount(11)
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

// Nothing of the old Data page is without a home: each of its cards is a tab of a section, and opens without an error.
const HOMES: Record<string, string[]> = {
  overview: ['highlights', 'overtime', 'hours'],
  pages: ['exits', 'groups', 'sells'],
  sources: ['utmsource', 'medium', 'earners'],
  places: ['regions', 'cities', 'languages', 'revmap', 'people'],
  tech: ['bversion', 'screens'],
  results: ['retention', 'vsale', 'toconvert', 'flow'],
  sales: ['buyers'],
  ai: ['ai'],
}

test('every card of the old Data page is a tab of a section', async ({ page }) => {
  await open(page, 1440)
  await page.keyboard.press('e')
  await expect(page.locator('#xp.on .xtb')).toBeVisible()
  await page.keyboard.press('f')
  for (const [section, tabs] of Object.entries(HOMES)) {
    await page.locator(`#xp .xrail [data-xsec="${section}"]`).click()
    for (const t of tabs) {
      const tab = page.locator(`#xp [data-xtab="${t}"]`)
      if ((await tab.count()) > 0) await tab.click()
      await expect(page.locator('#xp')).not.toContainText('We could not load this')
      // The tab is drawn in the panel's own frame, not as the old card.
      await expect(page.locator('#xp .kit-card, #xp .bl, #xp .by-row')).toHaveCount(0)
    }
  }
})

test('an old address with fs= opens the funnel it names', async ({ page }) => {
  await open(page, 1440)
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&x=funnels&fs=page:/&fs=page:/pricing`)
  await expect(panel(page)).toBeVisible()
  await expect(page.locator('#xp')).not.toContainText('We could not load this')
  await expect(page.locator('#xp .xsec').first()).toBeVisible()
})

test('an old address with filters opens Explore with the chip on, and shutting it takes them off', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&f=country%3AUS`)
  await expect(page.locator('#xp.on .xchip2')).toHaveCount(1)
  await expect(page).toHaveURL(/xf=country/)
  await page.keyboard.press('Escape')
  await expect(page.locator('#xp.on')).toHaveCount(0)
  await expect(page).not.toHaveURL(/f=country/)
})

// The AI view: the rows are what the server names as assistants (the answer is held here, so no site has to carry AI visits), the header is what
// they add up to and the bars are drawn in proportion; with none, the empty state.
const aiAnswer = (assistants: { name: string; visitors: number; referrer?: string }[]) => ({
  visitors: assistants.reduce((n, a) => n + a.visitors, 0),
  assistants,
  referrers: [],
  crawled: 0,
  bots: [],
  pages: [],
  google: false,
})

test('the AI view lists the assistants, adds up to its header and draws bars in proportion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const answer = aiAnswer([{ name: 'ChatGPT', visitors: 14, referrer: 'chatgpt.com' }, { name: 'Claude', visitors: 2 }, { name: 'Perplexity', visitors: 1 }])
  await page.route('**/report/ai-search**', (r) => r.fulfill({ json: answer }))
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&f=channel:AI&x=ai`)
  const assistants = page.locator('#xp .xt.xc', { has: page.locator('.xth', { hasText: 'Assistant' }) }).first()
  await expect(assistants.locator('.xrw')).toHaveText([/ChatGPT\s*14/, /Claude\s*2/, /Perplexity\s*1/])
  await expect(page.locator('#xp .xsec', { hasText: 'AI assistants' })).toContainText('17')
  const widths = await assistants.locator('.mk-bar i').evaluateAll((els) => els.map((e) => (e as HTMLElement).getBoundingClientRect().width))
  expect(widths[0]).toBeGreaterThan(widths[1] * 5)
  expect(widths[1]).toBeGreaterThan(widths[2])
})

test('the AI view with no AI visits says so', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.route('**/report/ai-search**', (r) => r.fulfill({ json: aiAnswer([]) }))
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&f=channel:AI&x=ai`)
  await expect(page.locator('#xp .xsec', { hasText: 'AI assistants' })).toContainText('0')
  await expect(page.locator('#xp')).toContainText(/None in this period/)
})
