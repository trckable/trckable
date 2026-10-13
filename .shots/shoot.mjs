import { chromium } from '/private/tmp/claude-501/-Users-albi-Projects-trckable/15d4064f-b3bc-47c8-b27f-554efec1d2f1/scratchpad/uptimecard/e2e/node_modules/@playwright/test/index.mjs'
import { readFileSync } from 'node:fs'
const D = '/private/tmp/claude-501/-Users-albi-Projects-trckable/15d4064f-b3bc-47c8-b27f-554efec1d2f1/scratchpad'
const cookie = readFileSync(D + '/uptimecard/.shots/cookie', 'utf8').trim()
const base = 'http://127.0.0.1:18650'
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
for (const [name, w, h, scheme] of [['uptimecard-1280-dark', 1280, 800, 'dark'], ['uptimecard-390-dark', 390, 844, 'dark'], ['uptimecard-1280-light', 1280, 800, 'light']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, serviceWorkers: 'block' })
  await ctx.addCookies([{ name: 'trckable_session', value: cookie, url: base }])
  const p = await ctx.newPage()
  await p.addInitScript((s) => { try { localStorage.setItem('theme', s) } catch {} }, scheme)
  await p.goto(`${base}/all?layout=overview&lens=visitors`)
  await p.waitForSelector('.nx-strip .nx-card', { timeout: 20000 })
  await p.waitForTimeout(2000)
  console.log(name, JSON.stringify(await p.locator('.nx-strip').innerText()), 'hscroll', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth))
  await p.screenshot({ path: `${D}/${name}.png`, clip: { x: 0, y: 0, width: w, height: (w < 600 ? 700 : 520) } })
  if (name === 'uptimecard-1280-dark') { await p.locator('.nx-strip .nx-card').last().click(); await p.waitForTimeout(800); console.log(p.url()) }
  await ctx.close()
}
await b.close()
