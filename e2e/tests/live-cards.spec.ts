// The cards under Live: Analytics (today so far, the pages, the countries and the devices behind one switch),
// then Speed & uptime and AI & mentions.
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
  await page.goto(API + path + (path.includes('?') ? '&v=' : '?v='))
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


const cards = (page: Page) => page.locator('.lcards')

test('the cards show today and the pages people are on', async ({ page }) => {
  // Other files' visits (their own /r/<run>/ pages) land on the same site meanwhile and can push this run out of the top five.
  let run = ''
  await page.route(/\/sites\/[^/]+\/now(\?|$)/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    if (run) body.recent = (body.recent ?? []).filter((r: { path?: string }) => !r.path?.startsWith('/r/') || r.path.includes(run))
    await route.fulfill({ response: res, json: body })
  })
  await signIn(page, '/example.com?view=live')
  await expect(page.locator('.lnow .lfig .lbign').first()).toBeVisible({ timeout: 15_000 })
  run = await visit(page, 'livecards', 4)
  const today = cards(page).locator('.lan')
  await expect(today).toBeVisible({ timeout: 10_000 })
  await expect(today.locator('.lhero')).not.toHaveText(/^0/)
  const pages = cards(page).locator('.lan')
  await expect(pages.locator('.lbar', { hasText: run })).toBeVisible({ timeout: 10_000 })
  // Devices sit behind the same switch, beside the pages and the countries.
  await pages.getByRole('button', { name: 'Devices' }).click()
  await expect(pages.locator('.lbar', { hasText: /Computer|Phone/ }).first()).toBeVisible({ timeout: 10_000 })
})

test('on a phone the cards stack and nothing runs off the side', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/example.com?view=live')
  await expect(page.locator('.lnow .lfig .lbign').first()).toBeVisible({ timeout: 15_000 })
  await visit(page, 'livecards-phone-' + 'long-'.repeat(12))
  // The cards stack under the two panels, and the long path stays inside its row.
  await expect(page.locator('.lcards')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const rows = await page.locator('.lfeed .lv').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right))
  for (const right of rows) expect(right).toBeLessThanOrEqual(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
