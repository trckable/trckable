// Changing the period keeps what is on screen: the chart, the cards and the
// page's height stay while the new numbers load, with no skeleton and no blank
// frame, and the markers on the chart do not blink out and back.
import { expect, test, type Locator, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'probe smooth e2e password 1'

// Signing in is rate limited per address: every browser here shares one
// session, made once by whichever worker gets there first.
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'probe-sm-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `probe-sm-${Date.now()}@example.com`
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

test('switching the period never shows a blank frame', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?mode=full`)
  const chart = page.locator('.overview .chart-wrap svg[role="img"]')
  await expect(chart).toBeVisible({ timeout: 30_000 })
  // Wait until the page has finished filling in (lazy cards arrive on their own
  // time, slower on a busy machine): the height is the same for a full second.
  let height = 0
  let since = Date.now()
  await expect
    .poll(async () => {
      const h = await page.evaluate(() => document.documentElement.scrollHeight)
      if (h !== height) {
        height = h
        since = Date.now()
      }
      return Date.now() - since
    }, { timeout: 30_000, intervals: [250] })
    .toBeGreaterThanOrEqual(1000)
  // Every frame from here: the chart is there, nothing is a placeholder, the page holds its height.
  await page.evaluate(() => {
    const w = window as unknown as { bad: string[] }
    w.bad = []
    const tick = () => {
      if (!document.querySelector('.overview .chart-wrap svg[role="img"]')) w.bad.push('chart gone')
      if (document.querySelector('.skel, .ld')) w.bad.push('placeholder')
      if (document.querySelector('.overview .chart-nodata')) w.bad.push('empty chart')
      requestAnimationFrame(tick)
    }
    tick()
  })
  for (const name of [/^Last 7 days/, /^Last 90 days/, /^Last 30 days/]) {
    await page.locator('.ctl-see .btn.range').click()
    await page.getByRole('dialog', { name: 'Choose a date range' }).getByRole('button', { name }).click()
    await page.waitForTimeout(1500)
  }
  expect(await page.evaluate(() => (window as unknown as { bad: string[] }).bad)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height)
  await expect(page.locator('.pending')).toHaveCount(0) // back to full strength
})

test('while a new period loads, the numbers stay on screen, dimmed', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}`)
  await expect(page.locator('.overview .chart-wrap svg[role="img"]')).toBeVisible({ timeout: 30_000 })
  await page.route('**/api/v1/sites/*/report*', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.continue()
  })
  await page.locator('.ctl-see .btn.range').click()
  await page.getByRole('dialog', { name: 'Choose a date range' }).getByRole('button', { name: /^Last 90 days/ }).click()
  await expect(page.locator('.view-stage.pending')).toHaveCount(1)
  await expect(page.locator('.overview .chart-wrap svg[role="img"]')).toBeVisible()
  await expect(page.locator('.view-stage.pending')).toHaveCount(0, { timeout: 10_000 })
})
