// The header stays on top of the window while a page is scrolled, on Live, the Briefing and with Explore open, wide and on a phone.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the header')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'sticky e2e password 1'

// One session for every test of the file, made by whichever worker gets there first (signing in is rate limited).
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'sticky-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `sticky-${Date.now()}@example.com`
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

async function open(page: Page, width: number, query: string) {
  await page.setViewportSize({ width, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  // An empty v is the address with no view: the suite would otherwise send it to Explore, which opens the panel.
  await page.goto(`${API}/${HISTORY_DOMAIN}${query}${query ? '&' : '?'}v=`)
}



const PAGES = [
  ['Live', '?view=live'],
  ['the Briefing', '?view=briefing&period=7d'],
  ['Explore open', '?view=briefing&period=7d&xp=overview'],
] as const

for (const width of [1440, 390]) {
  for (const [name, query] of PAGES) {
    test(`${width}px: the header stays at the top of ${name} after a scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
      await page.goto(`${API}/${HISTORY_DOMAIN}${query}&v=`)
      await expect(page.locator('.hd')).toBeVisible()
      await page.waitForTimeout(800)
      // Long enough to scroll: the page is given room if the site's own content is short.
      await page.evaluate(() => {
        const pad = document.createElement('div')
        pad.id = 'e2e-pad'
        pad.style.height = '3000px'
        document.querySelector('#main')?.appendChild(pad)
      })
      await page.mouse.move(width / 2, 500)
      await page.evaluate(() => window.scrollTo(0, 1500))
      await page.waitForTimeout(300)
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(1000)
      const hd = await page.locator('.hd').boundingBox()
      expect(hd!.y, 'header top').toBeCloseTo(0, 0)
      const hit = await page.evaluate(() => document.elementFromPoint(40, 20)?.closest('.hd') !== null)
      expect(hit, 'header is what is at the top of the window').toBe(true)
      // Its bottom edge shows once the page has moved under it.
      await expect(page.locator('.hd')).toHaveAttribute('data-stuck', 'true')
      const border = await page.locator('.hd').evaluate((el) => getComputedStyle(el).borderBottomColor)
      expect(border).not.toBe('rgba(0, 0, 0, 0)')
    })
  }
}
