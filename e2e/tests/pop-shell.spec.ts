// The header's menus (bell, apps, account) are one shell: the same frame, padding, radius and shadow, computed.
// POP_SHOTS=<prefix> also saves each open menu as /private/tmp/shots/pop-<prefix>-<theme>-<width>-<menu>.png.
import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { mockFeed, siteIdOf } from './bell-feed-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the shell')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'pop shell e2e password 1'
const SHOTS = process.env.POP_SHOTS

async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'pop-shell-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `popshell-${Date.now()}@example.com`
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

const MENUS = [
  { name: 'bell', button: '#bellBtn', box: '#bellMenu.on' },
  { name: 'account', button: '[data-key="user"]', box: '.pop.more-menu' },
  { name: 'apps', button: '#sectionsBtn', box: '.xtiles-pop' },
  { name: 'sites', button: '#siteBtn', box: '#siteMenu.on' },
  { name: 'period', button: '.pwrap .pill', box: '.pmenu.on', view: 'briefing' },
]

for (const theme of ['dark', 'light'] as const) {
  for (const width of [1280, 390]) {
    test(`${theme}, ${width} px: the bell, the account menu and the apps share one frame`, async ({ page }) => {
      test.setTimeout(120_000)
      const cookie = await session()
      await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
      const siteId = await siteIdOf(page, HISTORY_DOMAIN)
      const now = Math.floor(Date.now() / 1000)
      await mockFeed(page, () => [{ id: `down:shell${width}`, site: siteId, kind: 'down', at: now - 1500, ended: now - 900 }])
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height: 844 })
      await page.addInitScript((t) => localStorage.setItem('trckable:theme', t), theme)
      const frames: Record<string, Record<string, string>> = {}
      for (const m of MENUS) {
        await page.goto(`${API}/${HISTORY_DOMAIN}?view=${m.view ?? 'live'}&v=`)
        await expect(page.locator('#bellDot')).toBeVisible({ timeout: 20_000 })
        await page.locator(m.button).click()
        const box = page.locator(`${m.box}, aside.cd.on`).first()
        await expect(box).toBeVisible()
        await page.waitForTimeout(500)
        if (SHOTS) await page.screenshot({ path: `/private/tmp/shots/pop-${SHOTS}-${theme}-${width}-${m.name}.png` })
        frames[m.name] = await box.evaluate((el) => {
          const s = getComputedStyle(el)
          return { radius: s.borderTopLeftRadius, border: s.borderTopWidth + ' ' + s.borderTopColor, padding: s.paddingTop + ' ' + s.paddingLeft, shadow: s.boxShadow, background: s.backgroundColor, width: s.width }
        })
        if (width <= 600) {
          // A sheet: the colours and the top corners are the shell's; its placement and padding are the sheet's.
          const { background, radius } = frames[m.name];
          frames[m.name] = { background, radius }
        }
        await page.keyboard.press('Escape')
        await page.mouse.click(5, 5)
        await expect(box).toBeHidden()
      }
      for (const [name, f] of Object.entries(frames)) {
        expect(f, name).toEqual(width <= 600 ? frames.account : frames.bell)
      }
    })
  }
}
