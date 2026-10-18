// One responsive system, one test: the key pages at the widths of real devices (a small phone to a wide desktop) have
// no sideways scroll, nothing past the screen's edge, no label narrower than its longest word, no card row with an empty
// end, and a hero chart whose height stays in its step's range (dashboard/src/kit/breakpoints.ts). Chromium only.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHART_H, stepOf } from '../../dashboard/src/kit/breakpoints'
import { API, HISTORY_DOMAIN, LABELS_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'matrix e2e password 1'

export const DEVICES: [number, number][] = [
  [360, 780],
  [390, 844],
  [600, 960],
  [768, 1024],
  [820, 1000],
  [900, 1100],
  [1024, 1366],
  [1280, 800],
  [1920, 1080],
]

async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'matrix-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `matrix-${Date.now()}@example.com`
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
let waiting = ''
let siteId = ''
test.beforeAll(async ({ request }) => {
  cookie = await session()
  const sites = (await (await fetch(`${API}/api/v1/sites`, { headers: { Cookie: `trckable_session=${cookie}` } })).json()) as { id: string; domain: string }[] | { sites: { id: string; domain: string }[] }
  siteId = (Array.isArray(sites) ? sites : sites.sites).find((x) => x.domain === HISTORY_DOMAIN)?.id ?? ''
  // A site nobody has installed yet: its page is the setup screen.
  const made = await request.post(`${API}/api/v1/sites`, { headers: { 'X-Trckable-Request': '1', 'Content-Type': 'application/json', Cookie: `trckable_session=${cookie}` }, data: { domain: `matrix-${Date.now()}.example.org` } })
  expect(made.ok()).toBe(true)
  waiting = ((await made.json()) as { domain: string }).domain
})

// Everything the page's layout owes the person, read in the page. A problem is a line of words.
async function audit(page: Page, chart: { min: number; max: number } | null): Promise<string[]> {
  return page.evaluate((chartRange) => {
    const out: string[] = []
    const vw = document.documentElement.clientWidth
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`
    if (document.documentElement.scrollWidth > vw + 1) out.push(`sideways scroll: the page is ${document.documentElement.scrollWidth} px wide on a ${vw} px screen`)

    const shown = (el: Element) => {
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false
      const closed = el.closest('details:not([open])')
      if (closed && !el.closest('summary')) return false
      for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) if (p.hasAttribute('hidden') || p.getAttribute('aria-hidden') === 'true' || getComputedStyle(p).display === 'none') return false
      return true
    }
    // Clipped by a box that scrolls or hides its overflow, and that box is on the screen: not past the edge.
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (s.overflowX !== 'visible') {
          const r = p.getBoundingClientRect()
          if (r.right <= vw + 1 && r.left >= -1) return true
        }
      }
      return false
    }
    let n = 0
    for (const el of document.body.querySelectorAll('*')) {
      if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) continue
      if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(el.tagName)) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right <= vw + 1 && r.left >= -1) continue
      if (!shown(el) || clipped(el)) continue
      if (n++ < 6) out.push(`past the screen's edge (${Math.round(r.left)} to ${Math.round(r.right)} of ${vw}): ${describe(el.parentElement!)} > ${describe(el)} "${(el.textContent ?? '').trim().slice(0, 30)}"`)
    }

    // A label is at least as wide as its longest word, unless it is one line cut off with an ellipsis on purpose.
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'
    document.body.appendChild(probe)
    let m = 0
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      const own = [...el.childNodes].filter((c) => c.nodeType === 3 && c.textContent?.trim()).map((c) => c.textContent!.trim()).join(' ')
      if (!own || !shown(el)) continue
      const s = getComputedStyle(el)
      if (s.display === 'inline' || s.whiteSpace === 'nowrap' || s.whiteSpace === 'pre' || el.closest('svg,button,a,select,input,textarea,code,pre,kbd,[role=tab]')) continue
      if (el.getBoundingClientRect().width === 0) continue
      // A name cut off with an ellipsis by the box around it is cut on purpose.
      let cut = false
      for (let p: Element | null = el, k = 0; p && k < 4; p = p.parentElement, k++) if (getComputedStyle(p).textOverflow === 'ellipsis') cut = true
      if (cut) continue
      // (`font as a whole is empty when a longhand like tabular figures cannot be said in it: the parts are copied.)
      probe.style.fontFamily = s.fontFamily
      probe.style.fontSize = s.fontSize
      probe.style.fontWeight = s.fontWeight
      probe.style.fontStyle = s.fontStyle
      probe.style.fontVariantNumeric = s.fontVariantNumeric
      probe.style.letterSpacing = s.letterSpacing
      probe.style.textTransform = s.textTransform
      const room = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
      const longest = Math.max(0, ...own.split(/\s+/).map((w) => ((probe.textContent = w), probe.getBoundingClientRect().width)))
      if (room + 3 < longest && m++ < 6) out.push(`label narrower than its longest word (${Math.round(room)} px for ${Math.round(longest)}): ${describe(el.parentElement!)} > ${describe(el)} [${s.overflow} ${s.textOverflow} ${s.display}] "${own.slice(0, 40)}"`)
    }
    probe.remove()

    // A row of cards fills its row: from the first card's edge to the last one's, on every row.
    for (const grid of document.querySelectorAll<HTMLElement>('.kcs, .lcards, .mk-fit')) {
      if (!shown(grid)) continue
      const kids = [...grid.children].filter((c) => shown(c) && getComputedStyle(c).position !== 'absolute' && c.getBoundingClientRect().width > 0)
      if (kids.length < 2) continue
      const g = grid.getBoundingClientRect()
      const s = getComputedStyle(grid)
      const left = g.left + parseFloat(s.paddingLeft)
      const right = g.right - parseFloat(s.paddingRight)
      const rows = new Map<number, DOMRect[]>()
      for (const k of kids) {
        const r = k.getBoundingClientRect()
        const key = Math.round(r.top / 8)
        rows.set(key, [...(rows.get(key) ?? []), r])
      }
      for (const row of rows.values()) {
        const a = Math.min(...row.map((r) => r.left))
        const b = Math.max(...row.map((r) => r.right))
        if (a > left + 2 || b < right - 2) out.push(`a row of ${row.length} of ${kids.length} cards does not fill its width (${Math.round(a)} to ${Math.round(b)}, room ${Math.round(left)} to ${Math.round(right)}): ${describe(grid)}`)
      }
    }

    if (chartRange) {
      const c = document.querySelector<SVGElement>('.chwrap #chart')
      if (c) {
        const h = c.getBoundingClientRect().height
        if (h < chartRange.min - 1 || h > chartRange.max + 1) out.push(`the chart is ${Math.round(h)} px tall, its step allows ${chartRange.min} to ${chartRange.max}`)
      }
    }
    return out
  }, chart)
}

type Go = (page: Page) => Promise<void>

const settle = (page: Page) => page.waitForTimeout(700)
const briefing = (domain: string, period = '30d'): Go => async (page) => {
  await page.goto(`${API}/${domain}?view=briefing&period=${period}&v=`)
  await expect(page.locator('.brief')).toBeVisible()
  await expect(page.locator('svg#chart')).toBeVisible()
  await settle(page)
}
const at = (url: () => string, ready: string): Go => async (page) => {
  await page.goto(url())
  await expect(page.locator(ready).first()).toBeVisible()
  await settle(page)
}

// The Explore panel at full width, on one section of its list.
const explore = (n: number): Go => async (page) => {
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
  await expect(page.locator('.brief')).toBeVisible()
  await page.keyboard.press('e')
  await expect(page.locator('#xp.on .xtb')).toBeVisible()
  await page.keyboard.press('f')
  const items = page.locator('#xp.full .xrail .xri')
  if ((await items.count()) > n) await items.nth(n).click()
  await settle(page)
}
// A menu or a sheet the header opens.
const opened = (click: string): Go => async (page) => {
  await briefing(HISTORY_DOMAIN, '7d')(page)
  await page.locator(click).first().click()
  await settle(page)
}

const PAGES: [string, Go, boolean][] = [
  ['Briefing, a steady site', briefing(LABELS_DOMAIN), true],
  ['Briefing, today', briefing(HISTORY_DOMAIN, 'today'), true],
  ['Briefing, 7 days (still learning)', briefing(HISTORY_DOMAIN, '7d'), true],
  ['Live', at(() => `${API}/${LABELS_DOMAIN}?view=live`, '.liveview'), false],
  ['Setup, not verified', at(() => `${API}/${waiting}`, '.mk'), false],
  ['Answers', at(() => `${API}/${HISTORY_DOMAIN}?x=answers`, '.mk'), false],
  ['Mentions', at(() => `${API}/${HISTORY_DOMAIN}/mentions`, '.mk'), false],
  ['Team', at(() => `${API}/${HISTORY_DOMAIN}?account=people`, '.modal.window, .window'), false],
  ['Settings', at(() => `${API}/settings?site=${siteId}&tab=site`, '[role=dialog] >> visible=true'), false],
  ['The site list', opened('#siteBtn'), false],
  ['The bell', opened('.bellw .ib.bell'), false],
  ['The account menu', opened('.account-btn'), false],
  ['The palette', async (page) => { await briefing(HISTORY_DOMAIN, '7d')(page); await page.keyboard.press('Control+k'); await expect(page.locator('.pal .palbox')).toBeVisible(); await settle(page) }, false],
  ...Array.from({ length: 11 }, (_, i): [string, Go, boolean] => [`Explore, section ${i + 1}`, explore(i), false]),
  ['404', at(() => `${API}/no-such-page-here`, 'body'), false],
]

for (const [name, go, hasChart] of PAGES) {
  for (const [width, height] of DEVICES) {
    test(`${name} at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
      await go(page)
      expect(await audit(page, hasChart ? CHART_H[stepOf(width)] : null)).toEqual([])
    })
  }
}
