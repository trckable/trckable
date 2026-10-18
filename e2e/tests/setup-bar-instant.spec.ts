// The setup ring in the header never leaves an empty place and never moves anything: with its requests held back two
// seconds, a site this browser has seen shows it at once from the last read, a site it has not seen shows nothing
// until it is looked at again, and a site fully set up never shows it. The header's layout shift is zero on Live and the Briefing, at 1440 and 390.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'layout-shift entries are a Chromium feature')

const HELD_MS = 2000
let cookie = ''
test.beforeAll(async () => {
  cookie = await session('setup-bar-instant')
})

async function hold(page: Page) {
  const hold = async (route: { continue: () => Promise<void> }) => {
    await new Promise((r) => setTimeout(r, HELD_MS))
    await route.continue().catch(() => undefined)
  }
  await page.route(/\/api\/v1\/sites\/[^/]+\/setup$/, hold)
  await page.route(/\/api\/v1\/me\/bell-read$/, hold)
}

async function watch(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __why: string[] }
    w.__cls = 0
    w.__why = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources: { node: Element | null }[] }[]) {
        if (e.hadRecentInput) continue
        // What belongs to the header (the ring and what sits beside it); the page below it has its own specs.
        if (!e.sources.some((x) => x.node && (x.node.nodeType === 1 ? (x.node as Element) : x.node.parentElement)?.closest('header.hd'))) continue
        w.__cls += e.value
        w.__why.push(`${e.value.toFixed(4)} ${e.sources.map((x) => (x.node as Element | null)?.className || (x.node as Element | null)?.nodeName).join(',')}`)
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
}

const cls = async (page: Page) => {
  const { value, why } = await page.evaluate(() => ({ value: (window as unknown as { __cls: number }).__cls, why: (window as unknown as { __why: string[] }).__why }))
  if (value) console.log('layout shifts:', why.join(' | '))
  return value
}
// Where the header's controls stand: the same before and after the setup requests answer.
const places = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('.hd #siteBtn, .hd [role="tablist"], .hd .exb, .hd .ib.bell, .hd .account-btn')].map((el) => Math.round(el.getBoundingClientRect().x)))

async function open(page: Page, view: string) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=${view}`)
  await expect(page.locator('.hd #siteBtn')).toBeVisible()
}

for (const width of [1440, 390]) {
  for (const view of ['live', 'briefing']) {
    test(`${view} at ${width}: the ring comes from the last read, moves nothing`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      // A first look in this browser: nothing yet, and nothing in its place either.
      await watch(page)
      await open(page, view)
      await page.waitForTimeout(300)
      const before = await places(page)
      await expect(page.locator('.ringb')).toHaveCount(0)
      await expect(page.locator('.ringw')).toHaveCount(0)
      // The read is kept for the next look, and nothing on this page moved when it answered.
      await page.waitForFunction((k) => Object.keys(localStorage).some((x) => x.startsWith(k)), 'trckable:ring:state:', undefined, { timeout: 15_000 })
      expect(await places(page)).toEqual(before)
      expect(await cls(page)).toBe(0)

      // The next look, with the requests held two seconds: the ring is there at once and the page is still.
      const again = await page.context().newPage()
      await watch(again)
      await hold(again)
      await again.setViewportSize({ width, height: 900 })
      await open(again, view)
      await expect(again.locator('.ringb')).toBeVisible({ timeout: 1500 })
      await again.waitForTimeout(HELD_MS + 1500)
      expect(await cls(again)).toBe(0)
      await again.close()
    })
  }
}

test('a site fully set up never shows the ring while its read is on the way', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const list = await request.get(`${API}/api/v1/sites`, { headers: { Cookie: `trckable_session=${cookie}` } })
  const id = ((await list.json()) as { sites: { id: string; domain: string }[] }).sites.find((s) => s.domain === HISTORY_DOMAIN)!.id
  await watch(page)
  await hold(page)
  // Everything done, seen done nine days ago: the check is over, and the last read says so.
  await page.addInitScript(
    ([site, ago]) => {
      localStorage.setItem(`trckable:ring:state:${site}`, JSON.stringify({ done: 4, counted: 4, all_set: true, items: [] }))
      localStorage.setItem('trckable:ring:done', JSON.stringify({ [site as string]: Date.now() - (ago as number) }))
    },
    [id, 9 * 86_400_000],
  )
  await open(page, 'live')
  await page.waitForTimeout(500)
  await expect(page.locator('.ringw')).toHaveCount(0)
  await page.waitForTimeout(HELD_MS + 1000)
  expect(await cls(page)).toBe(0)
})
