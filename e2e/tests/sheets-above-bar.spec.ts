// On a phone every sheet (the site list, the period, the bell, the account, Ask or search) sits above the bottom bar, and
// its last button is whole on the screen and is what a finger would land on: nothing is drawn over it. Chromium only.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'sheets e2e password 1'

async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'sheets-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `sheets-${Date.now()}@example.com`
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

// The sheet that is open, and what a finger reaches last in it.
const SHEET = '.mk-menu.on, .pmenu.on, .xm.on, .pal .palbox, .cd.on, .modal.window, .pop.menu, [role=dialog], [aria-modal=true]'

async function lastAction(page: Page) {
  return page.evaluate((sheetSel) => {
    const sheets = [...document.querySelectorAll<HTMLElement>(sheetSel)].filter((s) => {
      const r = s.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(s).visibility !== 'hidden'
    })
    const sheet = sheets[sheets.length - 1]
    if (!sheet) return { error: 'no sheet is open' }
    const acts = [...sheet.querySelectorAll<HTMLElement>('button, a[href], [role=menuitem], [role=option]')].filter((b) => {
      const r = b.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden' && !b.closest('[hidden]')
    })
    const last = acts[acts.length - 1]
    if (!last) return { error: 'the sheet has no button' }
    last.scrollIntoView({ block: 'nearest' })
    const r = last.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const top = document.elementFromPoint(x, y)
    return {
      label: (last.textContent ?? '').trim().slice(0, 30),
      inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      reachable: !!top && (last.contains(top) || top.contains(last)),
      coveredBy: top ? `${top.tagName.toLowerCase()}.${typeof top.className === 'string' ? top.className : ''}` : 'nothing',
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), innerWidth, innerHeight],
    }
  }, SHEET)
}

const OPEN: [string, (page: Page) => Promise<void>][] = [
  ['the site list', (p) => p.locator('#siteBtn').click()],
  ['the period', (p) => p.locator('.hero .tline').click()],
  ['the bell', (p) => p.locator('.bellw .ib.bell').click()],
  ['the account', (p) => p.locator('.account-btn').click()],
  ['Ask or search', (p) => p.keyboard.press('Control+k')],
]

for (const [width, height] of [
  [360, 780],
  [390, 844],
] as const) {
  for (const [name, open] of OPEN) {
    test(`${name}: its last button is whole and reachable at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
      await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
      await expect(page.locator('.brief')).toBeVisible()
      await expect(page.locator('.tabbar')).toBeVisible()
      await open(page)
      await expect.poll(async () => JSON.stringify(await lastAction(page)), { message: name, timeout: 5000 }).toContain('"inside":true,"reachable":true')
    })
  }
}

// A build with a plan or a workspace puts its own sheet in the header (headerExtra): inside the header's stacking box, so
// the header has to sit above the bottom bar for that sheet to.
for (const [width, height] of [
  [360, 780],
  [390, 844],
] as const) {
  test(`a sheet drawn inside the header sits above the bar at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
    await expect(page.locator('.tabbar')).toBeVisible()
    await page.evaluate((undo) => {
      const hd = document.querySelector<HTMLElement>('header.hd')!
      if (undo) hd.style.zIndex = '20'
      const sheet = document.createElement('div')
      sheet.setAttribute('role', 'dialog')
      sheet.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:95;padding:16px 16px 24px;background:#fff'
      sheet.innerHTML = '<p>Plan</p><button type="button">Change plan</button><a href="#plan">Plan and billing</a>'
      hd.appendChild(sheet)
    }, process.env.NO_HEADER_FIX === '1')
    const got = await lastAction(page)
    expect(JSON.stringify(got)).toContain('"inside":true,"reachable":true')
  })
}
