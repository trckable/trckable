// The speed budget, like the weight budget: on the demo data, the first
// dashboard load asks for a fixed handful of things, the three start-up reads
// go out together, and the report endpoint answers within its limit when its
// cache cannot help. Server time is read from the Server-Timing header, so a
// slow CI network does not count against it.
//
// It runs against a trckabled with the demo data, so it is skipped unless
// TRCKABLE_A11Y_URL points at one (the same server the a11y suite uses).
import { expect, test } from '@playwright/test'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'

// Requests the dashboard makes before its numbers show: setup, me, sites,
// the person's own account (the avatar's picture and name), then the site's
// report and its four side reads (modules, saved views, notes, milestones).
// The live stream is not a request that ends, so it is not counted.
const FIRST_LOAD_REQUESTS = 9
// 95th percentile server time of an uncached report with its comparison
// period, on 30 days of demo data (about 100 ms on a laptop; CI runners are
// slower and shared). Three rounds of twenty ranges, and the best round counts:
// other workers' browsers take the server's CPU in bursts and slow a round
// down, a slow report slows every round.
const REPORT_P95_MS = 250
const ROUNDS = 3

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')

test('first load stays small and the report stays fast', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'one browser is enough for server time')
  await page.goto(BASE + '/login')
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
  await expect(page.locator('.kpi .value.num').first()).toBeVisible()

  // A cold load of the same dashboard, counted.
  const asked: { path: string; at: number }[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/') && !u.pathname.endsWith('/stream') && !u.pathname.endsWith('/live')) asked.push({ path: u.pathname, at: Date.now() })
  })
  await page.reload()
  await expect(page.locator('.kpi .value.num').first()).toBeVisible()
  await page.waitForLoadState('networkidle', { timeout: 15_000 })
  expect(asked.length, asked.map((a) => a.path).join('\n')).toBeLessThanOrEqual(FIRST_LOAD_REQUESTS)
  // setup, me and sites leave together, not one after another.
  const boot = ['/api/v1/setup', '/api/v1/me', '/api/v1/sites'].map((p) => asked.find((a) => a.path === p)?.at ?? NaN)
  expect(Math.max(...boot) - Math.min(...boot)).toBeLessThan(50)

  // The report, uncached: every range is one the server has not seen, in every
  // round and on every retry (a range asked twice is answered from the cache).
  const site = await page.evaluate(async () => ((await (await fetch('/api/v1/sites')).json()) as { sites: { id: string }[] }).sites[0].id)
  const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)
  const rounds: number[][] = []
  for (let round = 0; round < ROUNDS; round++) {
    const times: number[] = []
    for (let i = 0; i < 20; i++) {
      const to = 1 + (i < 10 ? 0 : 1) + 2 * (round + ROUNDS * info.retry)
      const res = await page.request.get(`${BASE}/api/v1/sites/${site}/report?from=${day(20 + (i % 10))}&to=${day(to)}&compare=previous&daily=1`)
      expect(res.ok()).toBe(true)
      const dur = /dur=([\d.]+)/.exec(res.headers()['server-timing'] ?? '')
      expect(dur, 'Server-Timing header').not.toBeNull()
      times.push(Number(dur?.[1]))
    }
    rounds.push(times.sort((a, b) => a - b))
  }
  const p95s = rounds.map((times) => times[Math.ceil(times.length * 0.95) - 1])
  const p95 = Math.min(...p95s)
  const best = rounds[p95s.indexOf(p95)]
  console.log(`report p95 ${p95.toFixed(1)} ms (budget ${REPORT_P95_MS} ms), median ${best[10].toFixed(1)} ms; rounds ${p95s.map((x) => x.toFixed(1)).join(', ')}`)
  expect(p95).toBeLessThanOrEqual(REPORT_P95_MS)
})
