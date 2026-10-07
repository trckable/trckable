// The three cards under Live: today so far, top pages right now, and where
// the people are from. Each opens Data on today; a row narrows it to one page.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'live cards e2e password 1'

// Signing in is limited to ten tries in ten minutes from one address, and the
// other suites need theirs: every browser here shares one session, made once
// by whichever worker gets there first.
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'livecards-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `livecards-${Date.now()}@example.com`
  // Other suites add their people at the same moment: a busy database is
  // tried again.
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

async function signIn(page: Page, path = '/example.com') {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + path)
}

/** A new visitor on the test site, from a browser context of its own. */
async function visit(page: Page, name: string, people = 1) {
  const run = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  // The other suites keep people on the same site: several people put this
  // page among the top three.
  for (let i = 0; i < people; i++) {
    const ctx = await page.context().browser()!.newContext()
    const p = await ctx.newPage()
    await p.goto(`/r/${run}/index.html`)
    await p.waitForTimeout(1500) // the pageview leaves
    await ctx.close()
  }
  return run
}


const cards = (page: Page) => page.locator('.lv-cards')

test('the cards show today and the page someone is on, and open Data on today', async ({ page }) => {
  await signIn(page, '/example.com?view=live')
  const live = page.getByRole('region', { name: 'Live', exact: true })
  await expect(live.locator('.live-online')).toBeVisible({ timeout: 15_000 })
  const run = await visit(page, 'livecards', 4)
  const today = cards(page).locator('.lv-card', { hasText: 'Today so far' })
  await expect(today).toBeVisible({ timeout: 10_000 })
  await expect(today.locator('.kit-val b')).not.toHaveText('0')
  const pages = cards(page).locator('.lv-card', { hasText: 'Top pages right now' })
  const row = pages.getByRole('button', { name: new RegExp(run) })
  await expect(row).toBeVisible({ timeout: 10_000 })
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44)

  // A row narrows Data to that page, for today.
  await row.click()
  await expect(page).toHaveURL(/period=today/)
  await expect(page).toHaveURL(new RegExp('f=.*' + run))
  await expect(page).not.toHaveURL(/view=live/)

  // The whole card opens today's numbers.
  await signIn(page, '/example.com?view=live')
  await expect(today).toBeVisible({ timeout: 15_000 })
  await today.getByRole('button', { name: /Today so far/ }).click()
  await expect(page).toHaveURL(/period=today/)
  await expect(page).not.toHaveURL(/[?&]f=/)
})

test('on a phone the cards stack and nothing runs off the side', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/example.com?view=live')
  await expect(page.getByRole('region', { name: 'Live', exact: true }).locator('.live-online')).toBeVisible({ timeout: 15_000 })
  await visit(page, 'livecards-phone-' + 'long-'.repeat(12))
  const all = cards(page).locator('.lv-card')
  await expect(all.first()).toBeVisible({ timeout: 10_000 })
  const boxes = await all.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width })))
  for (const [i, b] of boxes.entries()) {
    expect(b.w).toBeLessThanOrEqual(390)
    if (i > 0) expect(b.y).toBeGreaterThan(boxes[i - 1].y)
  }
  const rows = await cards(page).locator('.kit-rowbtn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right))
  for (const right of rows) expect(right).toBeLessThanOrEqual(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
