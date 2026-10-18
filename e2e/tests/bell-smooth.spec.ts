// The bell opens complete and stays still: the list is whole in the first frame it is drawn, the number on the bell is the
// unread rows, and a notice that arrives while it is open slides in without moving what is being read.
import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the bell')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'bell smooth e2e password 1'

async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'bell-smooth-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `bellsmooth-${Date.now()}@example.com`
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

type Probe = { counts: number[]; cls: number; vis: string; skew: number }

for (const width of [1440, 390]) {
  test(`at ${width} px the bell opens complete, the number is the unread rows, and a new notice slides in without a jump`, async ({ page }) => {
    test.setTimeout(90_000)
    const now = Math.floor(Date.now() / 1000)
    const mile = (step: string, ago: number) => ({ kind: 'visitors', step: `smooth${width}-${step}`, value: 100, day: '2026-01-01', created_at: now - ago, new: false, shared: false })
    const siteIds = new Set<string>()
    let arrived = false
    await page.route(/\/api\/v1\/sites\/[^/]+\/milestones(\?|$)/, (route) => {
      siteIds.add(/sites\/([^/]+)\//.exec(route.request().url())![1])
      return route.fulfill({ json: { enabled: true, milestones: [mile('a', 7200), mile('b', 3600), mile('c', 1800)], moment: null } })
    })
    // The account's incidents: none at first, then a site that stopped answering.
    await page.route(/\/api\/v1\/incidents(\?|$)/, (route) => {
      const site = [...siteIds][0]
      const incidents = arrived && site ? [{ id: `smooth${width}`, site, kind: 'down', started_at: now - 30, ended_at: null, cause: 'timeout', expected_visits: null, note: '' }] : []
      return route.fulfill({ json: { incidents } })
    })
    await page.route(/\/api\/v1\/sites\/[^/]+\/mentions(\?|$)/, (route) => route.fulfill({ json: { mentions: [] } }))
    await page.addInitScript(() => {
      const w = window as unknown as { __p: Probe }
      w.__p = { counts: [], cls: 0, vis: 'visible', skew: 0 }
      // A clock and a tab state the test can move: a tab shown after a minute away reads the bell at once.
      const real = Date.now.bind(Date)
      Date.now = () => real() + w.__p.skew
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => w.__p.vis })
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { hadRecentInput: boolean; value: number }[]) if (!e.hadRecentInput) w.__p.cls += e.value
      }).observe({ type: 'layout-shift', buffered: true })
      const tick = () => {
        const n = document.querySelectorAll('#bellMenu.on .nf, aside.cd.on .nf').length
        const open = !!document.querySelector('#bellMenu.on, aside.cd.on')
        if (open && w.__p.counts[w.__p.counts.length - 1] !== n) w.__p.counts.push(n)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.setViewportSize({ width, height: 844 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=live&v=`)
    const dot = page.locator('#bellDot')
    // The list is read once; the number appears with it.
    await expect(dot).toHaveText('3', { timeout: 20_000 })
    const menu = page.locator('#bellMenu.on, aside.cd.on')
    await page.locator('#bellBtn').click()
    // Complete in the first frame it is drawn: the count never changes after the open, and never goes through none.
    await expect(menu.locator('.nf')).toHaveCount(3)
    await page.waitForTimeout(1500)
    const first = await page.evaluate(() => (window as unknown as { __p: Probe }).__p.counts)
    expect(first).toEqual([3])
    expect(await menu.locator('.nf.unread').count()).toBe(Number(await dot.textContent()))
    // Reading one changes its mark, not the list.
    const order = await menu.locator('.nft b').allTextContents()
    await menu.locator('.nf').nth(1).click()
    await page.locator('#bellBtn').click()
    await expect(menu.locator('.nf')).toHaveCount(3)
    expect(await menu.locator('.nft b').allTextContents()).toEqual(order)
    expect(await menu.locator('.nf.unread').count()).toBe(Number(await dot.textContent()))
    // A new notice arrives while it is open: the tab is shown after a minute away, which reads the bell at once.
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-motion')
      ;(window as unknown as { __p: Probe }).__p.cls = 0
    })
    arrived = true
    await page.evaluate(() => {
      const w = window as unknown as { __p: Probe }
      w.__p.vis = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
      w.__p.skew += 70_000
      w.__p.vis = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(menu.locator('.nf')).toHaveCount(4)
    await expect(menu.locator('.nf').first()).toContainText('stopped answering')
    await page.waitForTimeout(600)
    expect((await menu.locator('.nft b').allTextContents()).slice(1)).toEqual(order)
    const cls = await page.evaluate(() => (window as unknown as { __p: Probe }).__p.cls)
    expect(cls).toBeLessThan(0.02)
  })
}
