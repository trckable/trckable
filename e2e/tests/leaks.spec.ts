// What the dashboard leaves behind: kept open in Live for five simulated minutes of visits, and switched
// between sites twenty times, its JS heap, its DOM nodes and its event listeners stay where they were.
// And a refresh asks for each thing once; leaving a site or period cancels the read still on its way.
// Chromium only (the numbers come from its debugger: collect garbage, then read the heap and the counters).
import { expect, test, type CDPSession, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.describe.configure({ mode: 'serial' }) // memory is read on a quiet page: one at a time

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the heap and listener counts come from Chromium’s debugger')
  await page.context().addCookies([{ name: 'trckable_session', value: await session('leaks'), url: API }])
})

async function counters(cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  const heap = await cdp.send('Runtime.getHeapUsage')
  const dom = await cdp.send('Memory.getDOMCounters')
  return { heapMB: heap.usedSize / 1048576, nodes: dom.nodes, listeners: dom.jsEventListeners }
}

const note = (name: string, first: object, last: object) => {
  const line = `${name}: ${JSON.stringify(first)} -> ${JSON.stringify(last)}`
  console.log(line)
  test.info().annotations.push({ type: 'memory', description: line })
}

const go = (page: Page, path: string) =>
  page.evaluate((to) => {
    history.pushState(null, '', to)
    window.dispatchEvent(new Event('trckable:navigate')) // what the app's own navigate() does
  }, path)

test('switching sites twenty times grows neither the heap nor the DOM nor the listeners', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data&v=story`)
  await expect(page.locator('.sv-chart')).toBeVisible({ timeout: 30_000 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  const sites = ['example.com', HISTORY_DOMAIN]
  const visit = async (i: number) => {
    const domain = sites[i % 2]
    await go(page, `/${domain}?view=data&v=story`)
    await expect(page.locator('.sv-head')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.site-btn .name')).toHaveText(domain)
    await page.waitForTimeout(250)
  }
  // Four rounds first: the caches, the lazy chunks and the fonts are in.
  for (let i = 0; i < 4; i++) await visit(i)
  const before = await counters(cdp)
  for (let i = 0; i < 20; i++) await visit(i)
  const after = await counters(cdp)
  note('20 site switches', before, after)
  expect(after.heapMB - before.heapMB, 'JS heap grew').toBeLessThan(8)
  expect(after.nodes - before.nodes, 'DOM nodes grew').toBeLessThan(Math.max(300, before.nodes * 0.1))
  expect(after.listeners - before.listeners, 'event listeners grew').toBeLessThan(60)
})

test('Live kept open for five minutes of visits keeps the heap and the DOM flat', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  // The stream is a page of ours that fires what the test says, so five minutes of visits take seconds.
  await page.addInitScript(() => {
    type Handler = (e: { data: string }) => void
    class Stream {
      static OPEN = 1
      static CLOSED = 2
      static all: Stream[] = []
      readyState = 1
      onerror: (() => void) | null = null
      on: Record<string, Handler[]> = {}
      constructor() {
        Stream.all.push(this)
      }
      addEventListener(type: string, fn: Handler) {
        ;(this.on[type] ??= []).push(fn)
      }
      close() {
        this.readyState = 2
      }
    }
    const w = window as unknown as { EventSource: unknown; fire: (type: string, data: unknown) => void }
    w.EventSource = Stream
    w.fire = (type, data) => {
      for (const s of Stream.all) if (s.readyState === 1) for (const f of s.on[type] ?? []) f({ data: JSON.stringify(data) })
    }
  })
  await page.clock.install()
  await page.goto(`${API}/example.com?view=live`)
  await expect(page.locator('.live-view')).toBeVisible({ timeout: 30_000 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  let n = 0
  // One simulated second at a time: three visits, a ping now and then, the clock moved on.
  const minute = async (m: number) => {
    for (let s = 0; s < 60; s++) {
      await page.evaluate(
        ([base, t]) => {
          const w = window as unknown as { fire: (type: string, data: unknown) => void }
          for (let i = 0; i < 3; i++) {
            const id = base + i
            w.fire('visit', { kind: 'pageview', ts: Math.floor(Date.now() / 1000), visitor: `v${id}`, path: `/p${id % 40}`, channel: ['Direct', 'Search', 'Social', 'Referral'][id % 4], country: 'DE', device: 'Desktop', browser: 'Chrome' })
          }
          if (t % 10 === 0) w.fire('ping', {})
          if (t % 15 === 0) w.fire('online', { online: 3 + (t % 7) })
        },
        [n, s],
      )
      n += 3
      await page.clock.runFor(1000)
    }
    return m
  }
  await minute(0)
  await minute(1)
  const first = await counters(cdp)
  for (let m = 2; m < 5; m++) await minute(m)
  const last = await counters(cdp)
  note(`Live, ${n} visits over 5 simulated minutes`, first, last)
  expect(last.heapMB - first.heapMB, 'JS heap grew').toBeLessThan(10)
  expect(last.nodes - first.nodes, 'DOM nodes climbed').toBeLessThan(Math.max(200, first.nodes * 0.05))
  expect(last.listeners - first.listeners, 'event listeners climbed').toBeLessThan(40)
  // The feed is capped: a thousand visits later it still lists a handful of rows.
  expect(await page.locator('.live-row').count()).toBeLessThanOrEqual(40)
})

test('a refresh asks for each thing once', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data&v=story`)
  await expect(page.locator('.sv-chart')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2500) // the first page's own late reads (the cards that wait for a quiet moment) are done
  const asked: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/') && !u.pathname.endsWith('/live') && !u.pathname.endsWith('/stream')) asked.push(u.pathname + u.search)
  })
  await page.reload()
  await expect(page.locator('.sv-chart')).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(4000) // the cards that wait for a quiet page ask too
  const twice = asked.filter((u, i) => asked.indexOf(u) !== i)
  expect(twice, `asked twice:\n${twice.join('\n')}`).toEqual([])
  // The first load's own reads: the lazy cards (links, mentions) are not part of it.
  const first = asked.filter((u) => !/\/report\/links|\/mentions/.test(u))
  console.log(`first load: ${first.length} requests\n${first.join('\n')}`)
})

test('leaving a site cancels the report still on its way', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data&v=story`)
  await expect(page.locator('.sv-chart')).toBeVisible({ timeout: 30_000 })
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  const stopped: string[] = []
  page.on('requestfailed', (r) => r.failure()?.errorText.includes('ABORTED') && stopped.push(new URL(r.url()).pathname))
  // example.com's report hangs; the page moves on to the history site before it answers.
  await page.route('**/api/v1/sites/*/report?*', async (route) => {
    if (!route.request().url().includes('example')) return route.continue()
    await held
    await route.continue().catch(() => undefined)
  })
  const sites = await page.evaluate(async () => ((await (await fetch('/api/v1/sites')).json()) as { sites: { id: string; domain: string }[] }).sites)
  const example = sites.find((s) => s.domain === 'example.com')!
  await go(page, `/example.com?view=data&v=story&period=7d`)
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/report?')).length)).toBeGreaterThan(0)
  await go(page, `/${HISTORY_DOMAIN}?view=data&v=story&period=7d`)
  await expect(page.locator('.sv-head')).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => stopped.some((p) => p.includes(example.id) && p.endsWith('/report')), { timeout: 10_000 }).toBe(true)
  release()
})
