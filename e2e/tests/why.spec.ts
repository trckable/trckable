// Every kind of "Why?" in Live, the Briefing and Explore, at a desktop width and at a phone's: each opens an answer
// in words (about the card it sits on), and a second press closes it again. Chromium only.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the answers')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'why e2e password 1'

// One session for every test of the file, made by whichever worker gets there first (signing in is rate limited).
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'why-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `why-${Date.now()}@example.com`
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

// The kinds of "Why?": the number's own note on a card of four, the sentence's button, a story's, and the inline one (Live's outage).
const KINDS: Record<string, string> = {
  number: 'button.kn[title="Why?"]',
  sentence: 'button.whyb',
  story: 'button[data-hw]:text-is("Why?")',
  inline: 'button.lk3:text-is("Why?")',
}

/** The history site is made to look down for twenty minutes, with the check's own words for why. */
async function markDown(page: Page) {
  const since = Math.floor(Date.now() / 1000) - 20 * 60
  const down = <T extends { domain?: string }>(s: T) => (s.domain === HISTORY_DOMAIN ? { ...s, down_since: since, down_cause: 'connection refused' } : s)
  await page.route(/\/api\/v1\/sites(\/[^/?]+)?(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const res = await route.fetch()
    const body = await res.json()
    await route.fulfill({ response: res, json: Array.isArray(body.sites) ? { ...body, sites: body.sites.map(down) } : down(body) })
  })
}

async function sweep(page: Page, width: number, query: string, seen: Set<string>) {
  await page.setViewportSize({ width, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}${query}${query ? '&' : '?'}v=`)
  await page.waitForTimeout(1500)
  for (const [kind, sel] of Object.entries(KINDS)) {
    const all = page.locator(sel)
    const n = await all.count()
    for (let i = 0; i < n; i++) {
      const btn = all.nth(i)
      if (!(await btn.isVisible())) continue
      seen.add(kind)
      await btn.scrollIntoViewIfNeeded()
      await btn.click()
      await expect(btn).toHaveAttribute('aria-expanded', 'true')
      const answer = page.locator('.hw.show, .icard.open .hw').first()
      await expect(answer, `${kind} #${i} @${width} ${query}`).toContainText(/\S{3,}/)
      // About this site and what its check said, not some other card's claim.
      await expect(answer).toContainText(HISTORY_DOMAIN)
      await expect(answer).toContainText('connection refused')
      await btn.click()
      await expect(btn).toHaveAttribute('aria-expanded', 'false')
      await expect(answer).toHaveCount(0)
    }
  }
}

for (const width of [1440, 390]) {
  test(`every Why? opens with an answer and closes again at ${width}px`, async ({ page }) => {
    const seen = new Set<string>()
    await markDown(page)
    for (const q of ['?view=live', '?view=briefing&period=7d', '?view=briefing&period=today', '?view=briefing&period=30d']) await sweep(page, width, q, seen)
    // The number's own Why? needs a normal to compare with (a site in its first week has none): KpiCard.test.tsx.
    // On a phone a card has no Why? button: it opens a sheet that always holds the cause (below).
    expect([...seen].sort(), 'the kinds a down site shows').toEqual(width > 600 ? ['inline', 'sentence', 'story'] : ['inline', 'sentence'])
  })
}

test('on a phone a card opens a sheet that tells the cause, about this site', async ({ page }) => {
  await markDown(page)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=today&v=`)
  // The card about the outage, once the cards have settled (a card that is still moving is not tapped).
  await expect(page.locator('article.icard.sk')).toHaveCount(0) // the loading shapes are not cards: a tap on one opens nothing
  const card = page.locator('article.icard:not(.sk)[data-topic="uptime"] .ic-h').first()
  await expect(card).toBeVisible()
  await card.scrollIntoViewIfNeeded()
  await card.click()
  const sheet = page.locator('aside.cd')
  await expect(sheet.locator('.hw.show')).toContainText(HISTORY_DOMAIN)
  await expect(sheet.locator('.hw.show')).toContainText('connection refused')
  await sheet.locator('button[title="Close"]').click()
  await expect(sheet).toHaveCount(0)
})

// The kinds that need the site to be down: the check's answer is made up here, so they can be asked on any day.
test('the outage Why? in Live and in the Briefing names the site and what the check said', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await markDown(page)
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=live&v=`)
  const live = page.locator('.downbox')
  await expect(live).toBeVisible()
  const btn = live.getByRole('button', { name: 'Why?' })
  await btn.click()
  await expect(btn).toHaveAttribute('aria-expanded', 'true')
  await expect(live).toContainText(HISTORY_DOMAIN)
  await expect(live).toContainText('connection refused')
  await btn.click()
  await expect(btn).toHaveAttribute('aria-expanded', 'false')
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=today&v=`)
  const hero = page.locator('.hero').first()
  await hero.getByRole('button', { name: 'Why?' }).click()
  await expect(hero).toContainText(HISTORY_DOMAIN)
  await expect(hero).toContainText('connection refused')
})

// A tap on any card of the Briefing on a phone opens that card's sheet, whichever card it is and in whatever order they come.
for (const q of ['?view=briefing&period=today', '?view=briefing&period=7d', '?view=briefing&period=30d']) {
  test(`on a phone every card opens its sheet (${q})`, async ({ page }) => {
    await markDown(page)
    await page.setViewportSize({ width: 390, height: 900 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${HISTORY_DOMAIN}${q}&v=`)
    // The loading shapes are not cards: a tap on one opens nothing, so wait until the real ones are here.
    await expect(page.locator('article.icard.sk')).toHaveCount(0)
    const cards = page.locator('article.icard:not(.sk)')
    await expect(cards.first()).toBeVisible()
    const n = await cards.count()
    expect(n).toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      const head = cards.nth(i).locator('.ic-h, .kt[role="button"]').first()
      const topic = await cards.nth(i).getAttribute('data-topic')
      await head.scrollIntoViewIfNeeded()
      await head.click()
      const sheet = page.locator('aside.cd')
      await expect(sheet, `card ${i} (${topic})`).toBeVisible()
      await sheet.locator('button[title="Close"]').click()
      await expect(sheet).toHaveCount(0)
    }
  })
}
