// What changed: four cards (Today, What moved, Where they came from, What they looked at), three side by side under Today, one column on a phone.
// Chromium only.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the panel')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'trending e2e password 1'

// One session for every test of the file, made by whichever worker gets there first (signing in is rate limited).
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'trending-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `trending-${Date.now()}@example.com`
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


for (const [width, height, theme] of [
  [1440, 900, 'dark'],
  [1440, 900, 'light'],
  [390, 844, 'dark'],
  [390, 844, 'light'],
] as const) {
  test(`What changed is four cards, no tabs, at ${width} px, ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.setViewportSize({ width, height })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
    await expect(page.locator('#xp.on')).toBeVisible()
    const cards = page.locator('#xp [data-briefing]')
    await expect(cards).toHaveCount(4)
    await expect(page.locator('#xp [data-briefing] .xcp-h')).toHaveText(['Last 7 days', 'What moved', 'Where they came from', 'What they looked at'])
    await expect(page.locator('#xp [data-briefing] [role=tab]')).toHaveCount(0)
    expect(await page.locator('#xp [data-briefing=sources] .xtr-row, #xp [data-briefing=sources] [data-google]').count()).toBeLessThanOrEqual(5)
    expect(await page.locator('#xp [data-briefing=pages] .xtr-row').count()).toBeLessThanOrEqual(5)
    expect(await page.locator('#xp [data-briefing=moved] .xmv-row').count()).toBeLessThanOrEqual(5)
    const tops = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    if (width < 700) expect(new Set(tops).size, 'one column on a phone').toBe(4)
    else {
      expect(new Set(tops.slice(1)).size, 'three side by side under Today').toBe(1)
      expect(tops[1], 'under Today').toBeGreaterThan(tops[0])
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll').toBe(true)
    if (process.env.SHOTS) {
      await cards.nth(1).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${process.env.SHOTS}/changed-${width}-${theme}.png` })
    }
  })
}

test('All pages in Explore opens the pages table', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
  await page.locator('#xp [data-briefing=pages] .mk-more').click()
  await expect(page).toHaveURL(/x=pages/)
})

test('Notes and the daily email are in the ⋯ menu, not on the page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
  await expect(page.locator('#xp [data-briefing=today]')).toBeVisible()
  await expect(page.locator('#xp [data-briefing]').getByRole('button', { name: /^(Notes|Daily email)/ })).toHaveCount(0)
  await page.locator('#xp [data-xm=more]').click()
  await expect(page.locator('#xp [data-daily]')).toBeVisible()
  await page.locator('#xp [data-notes]').click()
  await expect(page.getByText('All notes')).toBeVisible()
})
