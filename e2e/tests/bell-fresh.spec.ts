// The bell stays fresh: a notice that arrives while the page is open reaches the number on the bell without a reload (the
// Live view's /now is the pulse), and the number is the unread rows the menu lists once it opens. The milestones are answered here.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the bell')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'bell fresh e2e password 1'

async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'bell-fresh-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `bellfresh-${Date.now()}@example.com`
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

for (const width of [1440, 390]) {
  test(`at ${width} px a new notice reaches the bell without a reload, and the number is the unread rows`, async ({ page }) => {
    test.setTimeout(150_000)
    const now = Math.floor(Date.now() / 1000)
    const mile = (step: string, value: number, ago: number) => ({ kind: 'visitors', step: `fresh${width}-${step}`, value, day: '2026-01-01', created_at: now - ago, new: false, shared: false })
    const list = [mile('100', 100, 7200)]
    await page.route(/\/api\/v1\/sites\/[^/]+\/milestones(\?|$)/, (route) => route.fulfill({ json: { enabled: true, milestones: [...list], moment: null } }))
    // Only the rows this spec brings: the shared database holds incidents and mentions that other specs made.
    await page.route(/\/api\/v1\/incidents(\?|$)/, (route) => route.fulfill({ json: { incidents: [] } }))
    await page.route(/\/api\/v1\/sites\/[^/]+\/mentions(\?|$)/, (route) => route.fulfill({ json: { mentions: [] } }))
    await page.setViewportSize({ width, height: 844 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=live&v=`)
    const dot = page.locator('#bellDot')
    await expect(dot).toHaveText('1', { timeout: 20_000 })
    // A second notice arrives while the page is open: the next /now (each new minute) brings the bell to it.
    list.unshift(mile('1000', 1000, 60))
    await expect(dot).toHaveText('2', { timeout: 110_000 })
    await page.locator('#bellBtn').click()
    const menu = page.locator('#bellMenu.on, aside.cd.on')
    await expect(menu.locator('.nf')).toHaveCount(2)
    expect(await menu.locator('.nf.unread').count()).toBe(Number(await dot.textContent()))
  })
}
