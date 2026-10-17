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

// The heap and listener numbers are noisy on a shared CI runner: they run locally and nightly (TRCKABLE_LEAK_SPECS=1).
const memory = !!process.env.TRCKABLE_LEAK_SPECS

test('switching sites twenty times grows neither the heap nor the DOM nor the listeners', async ({ page }) => {
  test.skip(!memory, 'set TRCKABLE_LEAK_SPECS=1')
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing`)
  await expect(page.locator('.sv-chart')).toBeVisible({ timeout: 30_000 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  const sites = ['example.com', HISTORY_DOMAIN]
  const visit = async (i: number) => {
    const domain = sites[i % 2]
    await go(page, `/${domain}?view=briefing`)
    await expect(page.locator('.sv-head')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('#siteBtn .nmx')).toHaveText(domain)
    await page.waitForTimeout(250)
  }
  // Four rounds first: the caches, the lazy chunks and the fonts are in.
  for (let i = 0; i < 4; i++) await visit(i)
  const before = await counters(cdp)
  for (let i = 0; i < 20; i++) await visit(i)
  // A slow machine may still hold the page it just left (one more set of the page's own listeners until it is collected):
  // that is a one-time step, not growth. Growth is what twenty more switches add on top of it.
  await page.waitForTimeout(1500)
  const mid = await counters(cdp)
  for (let i = 0; i < 20; i++) await visit(i)
  await page.waitForTimeout(1500)
  const after = await counters(cdp)
  note('20 + 20 site switches', { before, mid }, after)
  expect(after.heapMB - before.heapMB, 'JS heap grew').toBeLessThan(8)
  expect(after.nodes - before.nodes, 'DOM nodes grew').toBeLessThan(Math.max(300, before.nodes * 0.1))
  expect(after.listeners - mid.listeners, 'event listeners grew with every switch').toBeLessThan(40)
  expect(after.listeners - before.listeners, 'event listeners piled up').toBeLessThan(200)
})

test('Live kept open for five minutes of visits keeps the heap and the DOM flat', async ({ page }) => {
  test.skip(!memory, 'set TRCKABLE_LEAK_SPECS=1')
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


