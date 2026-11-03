// Explore as the page itself: its sections in the list beside it, a filter from a tapped row, and the phone's drawer.
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
  await expect(page.locator('#xp.on')).toBeVisible()
}

const panel = (page: Page) => page.locator('#xp.on')
const pick = async (page: Page, name: RegExp) => {
  await page.locator('#xp .xrail').getByRole('button', { name }).click()
}

test('Explore is the page itself, and Escape does not take it away', async ({ page }) => {
  await open(page, 1440)
  await expect(page.locator('#xp.xpage .xrail')).toBeVisible()
  await expect(page.locator('#xpSub')).toContainText(HISTORY_DOMAIN)
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeVisible()
})

test('⌘K opens the palette over the page, and Escape shuts only the palette', async ({ page }) => {
  await open(page, 1440)
  await page.keyboard.press('Control+k')
  await expect(page.locator('.palbox[role="dialog"] input')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.palbox')).toHaveCount(0)
  await expect(panel(page)).toBeVisible()
})

test('the section list has its four groups, and a section shows its tables as cards', async ({ page }) => {
  await open(page, 1440)
  await expect(page.locator('#xp .xrail .xgl')).toContainText(['Traffic', 'Audience', 'Results', 'Site'])
  await pick(page, /^Sources/)
  await expect(page.locator('#xp [data-xcard="referrers"]')).toBeVisible()
  await expect(page.locator('#xp .xsub')).toHaveCount(0)
  // Payments are not connected here: Sales says so and tags itself in the list.
  await expect(page.locator('#xp .xrail [data-xsec="sales"] .xtag')).toHaveText('Connect')
  await pick(page, /^Sales/)
  await expect(page.locator('#xp .lkc').first()).toContainText('See what each source earns')
})

test('a tapped row filters, and the chip takes it off', async ({ page }) => {
  await open(page, 1440)
  await pick(page, /^Pages/)
  const rows = page.locator('#xp .xt .xrw')
  await expect(rows.first()).toBeVisible()
  await rows.first().click()
  await expect(page.locator('#xp .xchip2')).toContainText('Page:')
  await expect(page).toHaveURL(/xf=page/)
  await page.locator('#xp .xchip2 button').click()
  await expect(page.locator('#xp .xchip2')).toHaveCount(0)
  // No filter menu: a row is how a filter goes on.
  await expect(page.locator('[data-xm=\"filt\"]')).toHaveCount(0)
  await expect(panel(page)).toBeVisible()
})

test('full width has the section list beside it, with no control to fold it', async ({ page }) => {
  await open(page, 1440)
  await expect(page.locator('#xp.full .xrail .xri').first()).toBeVisible()
  await page.locator('#xp .xrail').getByRole('button', { name: /^Speed/ }).click()
  await expect(page.locator('#xp [data-xcard="speed"]')).toBeVisible()
  await expect(page.locator('#xp .xrail .nm').first()).toBeVisible()
  await expect(page.locator('#xp .xrail').getByRole('button', { name: /section list/i })).toHaveCount(0)
})

test('on a phone the sections are a drawer, and nothing scrolls sideways', async ({ page }) => {
  await open(page, 390)
  await expect(page.locator('#xp.full')).toHaveCount(0)
  await page.locator('.xdrawer-open').click()
  await page.locator('.xdrawer-box').getByRole('button', { name: /^Pages/ }).click()
  await expect(page.locator('.xdrawer-box')).toHaveCount(0)
  await expect(page.locator('#xp [data-xcard="pages"]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

// Nothing of the old Data page is without a home: each of its cards is a tab of a section, and opens without an error.
const HOMES: Record<string, string[]> = {
  overview: ['overtime', 'hours'],
  pages: ['exits', 'groups', 'sells'],
  sources: ['earners'],
  places: ['places', 'revmap', 'people'],
  tech: ['bversion', 'screens'],
  results: ['retention', 'vsale', 'toconvert', 'flow'],
  sales: ['buyers'],
  ai: ['ai'],
}

test('every card of the old Data page has a place in a section', async ({ page }) => {
  await open(page, 1440)
  for (const [section, tabs] of Object.entries(HOMES)) {
    await page.locator(`#xp .xrail [data-xsec="${section}"]`).click()
    for (const t of tabs) {
      const card = page.locator(`#xp [data-xcard="${t}"]`)
      await card.evaluate((el) => el.scrollIntoView())
      await expect(card).toBeVisible()
      await expect(card).not.toContainText('We could not load this')
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

test('an old address with filters opens Explore with the chip on', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&f=country%3AUS`)
  await expect(page.locator('#xp.on .xchip2')).toHaveCount(1)
  await expect(page).toHaveURL(/xf=country/)
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

test('the AI view lists the assistants and draws bars in proportion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const answer = aiAnswer([{ name: 'ChatGPT', visitors: 14, referrer: 'chatgpt.com' }, { name: 'Claude', visitors: 2 }, { name: 'Perplexity', visitors: 1 }])
  await page.route('**/report/ai-search**', (r) => r.fulfill({ json: answer }))
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&f=channel:AI&x=ai`)
  await expect(page.locator('#xp .xai-tile')).toHaveText([/ChatGPT\s*14/, /Claude\s*2/, /Perplexity\s*1/])
  const widths = await page.locator('#xp .xai-tile u').evaluateAll((els) => els.map((e) => (e as HTMLElement).getBoundingClientRect().width))
  expect(widths[0]).toBeGreaterThan(widths[1] * 5)
  expect(widths[1]).toBeGreaterThan(widths[2])
})

test('the AI view with no AI visits says so', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.route('**/report/ai-search**', (r) => r.fulfill({ json: aiAnswer([]) }))
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&f=channel:AI&x=ai`)
  await expect(page.locator('#xp')).toContainText(/None in this period/)
})

// Explore and Live stay in step: what Live opens is what Explore shows, Back returns to Live, and Explore's own place is kept otherwise.
test('a click on Live opens that table of Explore, and Back returns to Live', async ({ page }) => {
  await open(page, 1440)
  await pick(page, /^Pages/)
  await page.locator('#xp [data-xcard="pages"] .xt .xrw').first().click()
  await expect(page).toHaveURL(/x=pages.*xf=page|xf=page.*x=pages/)
  await page.keyboard.press('l')
  await expect(page).toHaveURL(/view=live/)
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible()
  await page.keyboard.press('b')
  await expect(page).toHaveURL(/xf=page/)
  await expect(page.locator('#xp .xchip2')).toHaveCount(1)
  await page.keyboard.press('l')
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible()
  await page.evaluate(() => { const u = new URL(location.href); u.searchParams.set('x', 'speed'); history.pushState(null, '', u); dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.locator('#xp [data-xcard="speed"]')).toBeVisible()
  await expect(page).toHaveURL(/x=speed/)
  await expect(page.locator('#xp .xchip2')).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(/view=live/)
  await expect(page).not.toHaveURL(/x=speed/)
})

test('a source on Live opens Sources narrowed to it, and Back returns to Live', async ({ page }) => {
  await page.route('**/api/v1/sites/*/now*', async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, json: { ...(await res.json()), sources: [{ channel: 'Direct', visitors: 5 }] } })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=live`)
  await page.locator('.lsn-go').first().click()
  await expect(page.locator('#xp .xchip2')).toContainText('Direct')
  await expect(page.locator('#xp [data-xcard="sources"]')).toBeVisible()
  await expect(page).toHaveURL(/x=sources/)
  await page.goBack()
  await expect(page).toHaveURL(/view=live/)
  await expect(page).not.toHaveURL(/x=sources/)
})

test('the grid in the header lists every section, and a tile opens its page from Live', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=live`)
  await page.locator('#sectionsBtn').click()
  await expect(page.locator('.xtile').first()).toBeVisible()
  await page.locator('[data-xtile="speed"]').click()
  await expect(page.locator('.xtile')).toHaveCount(0)
  await expect(page.locator('#xp [data-xcard="speed"]')).toBeVisible()
  await expect(page).toHaveURL(/x=speed/)
})
