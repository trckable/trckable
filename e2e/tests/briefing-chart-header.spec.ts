// The Briefing's chart header: the line of words, the Notes button, the moments' labels and Replay beside Why?
// are each their own box, none on top of another, on a quiet site and a busy one, on a wide screen and a phone.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, BUSY_DOMAIN, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'chart header e2e password 1'

async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'chart-header-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `chart-header-${Date.now()}@example.com`
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

type Box = { name: string; x: number; y: number; w: number; h: number }

// Every box that should stand alone: the words, Notes, the buttons under the headline, and each label inside the chart.
async function boxes(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const out: Box[] = []
    const add = (name: string, el: Element) => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) out.push({ name, x: r.x, y: r.y, w: r.width, h: r.height })
    }
    const note = document.querySelector('#chNote')
    if (note) add('note', note)
    document.querySelectorAll('.chwrap .nbtn').forEach((el) => add('notes', el))
    document.querySelectorAll('.hl-col .rpb').forEach((el) => add(`button: ${el.textContent?.trim()}`, el))
    document.querySelectorAll('svg#chart text').forEach((el) => add(`label: ${el.textContent?.trim()}`, el))
    document.querySelectorAll('.chwrap .moment-mark').forEach((el, i) => add(`mark ${i}`, el))
    return out
  })
}

const cases = [
  ['quiet', HISTORY_DOMAIN, 1440, 'dark'],
  ['quiet', HISTORY_DOMAIN, 390, 'dark'],
  ['quiet', HISTORY_DOMAIN, 900, 'light'],
  ['busy', BUSY_DOMAIN, 1440, 'dark'],
  ['busy', BUSY_DOMAIN, 390, 'light'],
] as const

for (const [kind, domain, width, scheme] of cases) {
  test(`the chart header's boxes do not overlap: ${kind} site, ${width}px, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width, height: 900 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${domain}?view=briefing&period=7d&v=`)
    await expect(page.locator('.chwrap .nbtn')).toBeVisible()
    await expect(page.locator('svg#chart')).toBeVisible()
    // Why? beside Replay is there only while a change has a cause to tell; the pair is checked whenever it is.
    await page.evaluate(() => {
      const replay = document.querySelector('.hl-col .rpb')
      if (!replay || document.querySelector('.hl-col .whyb')) return
      const why = replay.cloneNode(false) as HTMLElement
      why.classList.add('whyb')
      why.textContent = 'Why?'
      replay.after(why)
    })
    const list = await boxes(page)
    expect(list.length).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        const apart = a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5
        expect(apart, `${a.name} and ${b.name} overlap`).toBe(true)
      }
    }
    // Replay and Why? are two buttons with room between them, where both are on one line.
    const replay = list.find((b) => b.name === 'button: Replay')!
    const why = list.find((b) => b.name === 'button: Why?')!
    if (Math.abs(replay.y - why.y) < 4) expect(why.x - (replay.x + replay.w)).toBeGreaterThanOrEqual(6)
  })
}
