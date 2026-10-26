// The bell opens at a phone's width and at a desktop's, the number on it is the number of unread rows in the list, and
// a press inside the phone's sheet does its work instead of shutting the sheet. The milestones are answered here.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the bell')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'bell sheet e2e password 1'

async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'bell-sheet-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `bell-${Date.now()}@example.com`
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
  const now = Math.floor(Date.now() / 1000)
  // Read marks belong to the account, which both widths share: each has its own steps.
  const mile = (step: string, value: number, ago: number) => ({ kind: 'visitors', step: `${width}-${step}`, value, day: '2026-01-01', created_at: now - ago, new: false, shared: false })
  await page.route(/\/api\/v1\/sites\/[^/]+\/milestones(\?|$)/, (route) =>
    route.fulfill({ json: { enabled: true, milestones: [mile('100', 100, 7200), mile('1000', 1000, 3600)], moment: null } }),
  )
  await page.setViewportSize({ width, height: 844 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&v=`)
}

for (const width of [390, 1440]) {
  test(`at ${width} px the bell opens, its number is its unread rows, and a press in the list works`, async ({ page }) => {
    await open(page, width)
    const dot = page.locator('#bellDot')
    await expect(dot).toHaveText('2', { timeout: 20_000 })
    await page.locator('#bellBtn').click()
    const list = page.locator('#bellMenu.on, aside.cd.on')
    const rows = list.locator('.nf')
    await expect(rows).toHaveCount(2)
    expect(await list.locator('.nf.unread').count()).toBe(Number(await dot.textContent()))
    await expect(rows.first()).toContainText('1,000 people have visited your site')
    // Pressing inside the list does not shut it (the phone's sheet lives outside the bell's own box).
    await rows.nth(1).hover()
    await list.getByRole('button', { name: 'Mark all read' }).click()
    await expect(dot).toBeHidden()
    await expect(rows).toHaveCount(2)
    await expect(list.locator('.nf.unread')).toHaveCount(0)
  })
}

test('on a phone the list is a dialog named for the bell', async ({ page }) => {
  await open(page, 390)
  await page.locator('#bellBtn').click()
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible()
})

// The bell also tells the busy spells the server recorded (its moments); this spec counts the rows it sets up itself.
test.beforeEach(async ({ page }) => {
  await page.route(/\/moments\?/, (r) => r.fulfill({ json: { moments: [] } }))
})
