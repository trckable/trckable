// The Briefing's chart for today runs along the site's own day: at 12:12 on the site's clock the now-dot sits at the middle of the
// day, not at 00:00, and the axis goes on to the evening, on a phone and on a tablet. Chromium only.
import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a chart')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'today clock e2e password 1'

async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'today-clock-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `today-clock-${Date.now()}@example.com`
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

// The instant at which a clock in `tz` reads 12:12 on today's date there.
function noonIn(tz: string): Date {
  const parts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map((p) => [p.type, p.value]))
  const now = parts(new Date())
  const guess = Date.UTC(Number(now.year), Number(now.month) - 1, Number(now.day), 12, 12)
  const got = parts(new Date(guess))
  const shown = Date.UTC(Number(got.year), Number(got.month) - 1, Number(got.day), Number(got.hour), Number(got.minute))
  return new Date(guess - (shown - guess))
}

for (const [width, height] of [
  [390, 844],
  [820, 1000],
] as const) {
  test(`today at 12:12 on the site's clock: the dot is at midday and the axis runs on, at ${width} px`, async ({ page }) => {
    const sites = (await (await fetch(`${API}/api/v1/sites`, { headers: { Cookie: `trckable_session=${cookie}` } })).json()) as { domain: string; timezone: string }[] | { sites: { domain: string; timezone: string }[] }
    const list = Array.isArray(sites) ? sites : sites.sites
    const tz = list.find((s) => s.domain === HISTORY_DOMAIN)?.timezone || 'UTC'
    await page.clock.setFixedTime(noonIn(tz))
    await page.setViewportSize({ width, height })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=today&v=`)
    await expect(page.locator('svg#chart')).toBeVisible()
    await page.waitForTimeout(800)
    const where = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('svg#chart')!
      const W = svg.viewBox.baseVal.width
      const dot = svg.querySelector('circle[r="4.5"]')
      const ticks = [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '')
      return { share: dot ? Number(dot.getAttribute('cx')) / W : -1, ticks }
    })
    expect(where.share).toBeGreaterThan(0.4)
    expect(where.share).toBeLessThan(0.65)
    // The axis names hours after midday too (the evening is there, shaded, to be filled).
    expect(where.ticks.some((t) => /^(1[5-9]|2[0-3]):00$/.test(t)), where.ticks.join(' ')).toBe(true)
  })
}
