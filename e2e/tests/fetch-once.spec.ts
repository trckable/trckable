// What an open dashboard asks the server for: on Live and on the Briefing,
// every API read of the first load and of 45 s after it is counted
// (in real time: the live stream's pings and the page's timers keep their own
// pace, which a fake clock would skip). The same address is never asked for twice
// within its interval, /now is the only thing that polls, and a hidden tab
// asks for nothing at all.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the count')
test.setTimeout(150_000)

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    for (const [k, v] of [['hidden', h], ['visibilityState', h ? 'hidden' : 'visible']] as const) Object.defineProperty(document, k, { value: v, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)

const LOAD_MS = 10_000
const WATCH_MS = 45_000

// The most calls a first load may make (Live 19 and the Briefing 31 were measured, with the lazy reads that follow the load and the bell and the setup ring sharing one read of the account's marks).
const BUDGET = { Live: 19, Briefing: 35 } // (reads other than /now, counted apart; Live's was 19 until its Speed & uptime and AI & mentions cards: crawlers, speed and the uptime record, read once the page is quiet; the Briefing's was 31 until a young site opened on Today, which reads the 30 days behind it as well and the day's own hours; 33 until Live is built behind it when the page is idle, so the first switch to it has its numbers: 4 reads)

const tally = (urls: string[]) => {
  const out: Record<string, number> = {}
  for (const u of urls) out[u] = (out[u] ?? 0) + 1
  return out
}
// The route a call is for, without the site and the dates.
const kind = (u: string) => u.replace(/^\/api\/v1/, '').replace(/\/sites\/[^/?]+/, '/sites/S').replace(/\?.*/, '')

for (const [name, query] of [['Live', 'view=live'], ['Briefing', 'view=briefing']] as const) {
  test.describe(name, () => {
    let cookie = ''
    test.beforeAll(async () => {
      cookie = await session('fetch-once')
    })

    async function open(page: Page) {
      const calls: string[] = []
      page.on('request', (r) => {
        const u = new URL(r.url())
        if (r.method() === 'GET' && u.pathname.startsWith('/api/v1/')) calls.push(u.pathname + u.search)
      })
      // The other files of the suite add visits to the same sites while this one counts: the list is answered as it was first, so a site that moves is not what is measured.
      let frozen = ''
      await page.route('**/api/v1/sites', async (route) => {
        if (frozen) return route.fulfill({ status: 200, contentType: 'application/json', body: frozen })
        const res = await route.fetch()
        // The site measured and two others: the bell also reads the account's other sites, as many as the suite has made by now.
        const all = (await res.json()) as { sites: { domain: string }[] }
        const sites = [...all.sites.filter((s) => s.domain === HISTORY_DOMAIN), ...all.sites.filter((s) => s.domain !== HISTORY_DOMAIN).slice(0, 2)]
        frozen = JSON.stringify({ ...all, sites })
        return route.fulfill({ response: res, body: frozen })
      })
      await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
      await page.goto(`${API}/${HISTORY_DOMAIN}?${query}&v=`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(LOAD_MS) // the lazy reads that follow it (the bell at 3 s, the surge line at 8 s)
      return calls
    }

    test(`${name}: the first load and the next 45 s`, async ({ page }) => {
      const calls = await open(page)
      const first = calls.splice(0)
      await page.waitForTimeout(WATCH_MS)
      const minute = [...calls]
      const line = `${name} first load ${first.length}: ${JSON.stringify(tally(first.map(kind)))}; next 45 s ${minute.length}: ${JSON.stringify(tally(minute.map(kind)))}`
      console.log(line)
      test.info().annotations.push({ type: 'requests', description: line })

      // Nothing is asked twice by the load, and the minute after it asks again for none of the numbers (the report, the sites, the mentions, the bell's lists): only /now and the few lines on a longer timer.
      // (/now is Live's pulse: the minute's turn and visits that other files of the suite add to this site make it read again, as many times as a slow runner lets them pile up; it is counted apart below.)
      const isNow = (u: string) => /\/now$/.test(kind(u))
      const twice = Object.entries(tally(first)).filter(([u, n]) => n > 1 && !isNow(u))
      expect(twice, 'asked twice by the load').toEqual([])
      const again = minute.filter((u) => /\/(report|mentions|milestones|incidents|busier)(\?|$)/.test(u.replace(/\/sites\/[^/?]+/, '')))
      expect(again, 'asked again within 45 s').toEqual([])
      for (const [url, n] of Object.entries(tally(minute))) expect(n, `${url} in 45 s`).toBeLessThanOrEqual(/\/now$/.test(url) ? 5 : 1)
      expect(first.filter((u) => !isNow(u)).length).toBeLessThanOrEqual(BUDGET[name])
      expect(first.filter(isNow).length, '/now in the load').toBeLessThanOrEqual(4)
      expect(first.filter((u) => /health$/.test(u))).toEqual([])
    })

    test(`${name}: a hidden tab asks for nothing`, async ({ page }) => {
      const calls = await open(page)
      await setHidden(page, true)
      await page.waitForTimeout(300)
      calls.splice(0)
      await page.waitForTimeout(40_000)
      expect(tally(calls.map(kind))).toEqual({})
    })
  })
}
