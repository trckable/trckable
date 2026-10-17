// How many requests an open page makes: the tracker's "still here" and the
// dashboard's refreshes, counted over a simulated half hour with a fake clock.
// The numbers are printed (and kept as annotations); the asserts are the limits
// that must hold: a hidden tab asks for nothing, a shown one says "still here"
// every 3 minutes.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'requests e2e password 1'
const MIN = 60_000

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    for (const [k, v] of [['hidden', h], ['visibilityState', h ? 'hidden' : 'visible']] as const) Object.defineProperty(document, k, { value: v, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)

/** Runs the fake clock a minute at a time, so timers that start timers keep their turn. */
async function run(page: Page, minutes: number) {
  for (let i = 0; i < minutes; i++) {
    await page.clock.runFor(MIN)
    await page.waitForTimeout(15) // let a request that was started leave
  }
}

const report = (name: string, counts: Record<string, number>) => {
  const line = `${name}: ${JSON.stringify(counts)}`
  console.log(line)
  test.info().annotations.push({ type: 'requests', description: line })
}

test.describe('the tracker', () => {
  const open = async (page: Page, name: string) => {
    const sent: string[] = []
    page.on('request', (r) => r.url().includes('/api/e') && r.method() == 'POST' && sent.push(r.postData() ?? ''))
    await page.clock.install()
    await page.goto(`/r/${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/index.html`)
    await expect.poll(() => sent.length).toBe(1)
    return sent
  }

  test('a page left shown for 30 minutes: one report every 3 minutes', async ({ page }) => {
    const sent = await open(page, 'req-shown')
    await run(page, 30)
    report('tracker, shown 30 min', { after_30_min: sent.length })
    expect(sent.length).toBe(11) // the view, then minutes 1, 4, 7 … 28 (was 31: one a minute)
  })

  test('a page in a hidden tab for 30 minutes', async ({ page }) => {
    const sent = await open(page, 'req-hidden')
    await setHidden(page, true)
    await page.waitForTimeout(100)
    const atHide = sent.length
    await run(page, 30)
    report('tracker, hidden 30 min', { after_30_min: sent.length })
    expect(sent.length).toBe(atHide)
  })
})

test.describe('the dashboard', () => {
  let cookie = ''
  test.beforeAll(async () => {
    const file = join(process.env.TRCKABLE_DATA_DIR!, 'requests-session')
    try {
      openSync(file + '.lock', 'wx')
    } catch {
      for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
      cookie = readFileSync(file, 'utf8')
      return
    }
    const email = `requests-${Date.now()}@example.com`
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
    cookie = value
  })

  for (const view of ['live', 'data']) {
    test(`the ${view} view open: shown 10 minutes, then hidden 20`, async ({ page }) => {
      test.setTimeout(300_000)
      await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
      let calls = 0
      page.on('request', (r) => {
        const u = new URL(r.url())
        if (u.pathname.startsWith('/api/v1/') && !u.pathname.endsWith('/live')) calls++
      })
      // The fake clock runs far ahead of the real stream's pings, which would read as a stuck stream
      // over and over: the stream is refused instead, so the dashboard polls, as it does when stuck.
      await page.route('**/api/v1/sites/*/live', (route) => route.abort())
      await page.clock.install()
      await page.goto(`${API}/example.com?view=${view}`)
      await expect(page.locator(view == 'live' ? '.liveview .lbign' : '.range-picker').first()).toBeVisible({ timeout: 15_000 })
      await page.waitForTimeout(500)
      const loaded = calls
      await run(page, 10)
      const shown = calls - loaded
      await setHidden(page, true)
      await page.waitForTimeout(200)
      const hiddenFrom = calls
      await run(page, 20)
      const whileHidden = calls - hiddenFrom
      report(`dashboard ${view}`, { first_load: loaded, shown_10_min: shown, hidden_20_min: whileHidden })
      expect(whileHidden).toBeLessThanOrEqual(1) // at most a timer that was already set when the tab was hidden
      await setHidden(page, false) // and it reads once on return
      await expect.poll(() => calls - hiddenFrom, { timeout: 5000 }).toBeGreaterThan(0)
    })
  }
})
