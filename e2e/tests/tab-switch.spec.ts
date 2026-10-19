// Switching between Live and the Briefing: no frame without a screen (blank or
// the loading ghost), and nothing that moves under the reader (layout shift).
// Chromium only, with the CPU slowed 4x, as on a modest phone.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the switch')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'switch e2e password 1'

// One session for every test of the file, made by whichever worker gets there first (signing in is rate limited).
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'switch-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `switch-${Date.now()}@example.com`
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


const tab = (page: Page, name: string) => page.getByRole('tab', { name })

// Every frame while a switch runs: what the main area holds, and the layout shifts the browser scores.
async function watch(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __f: string[]; __h: number[]; __cls: number; __why: string[]; __stop: () => void }
    w.__f = []
    w.__h = []
    w.__why = []
    w.__cls = 0
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[]) if (!e.hadRecentInput) {
          w.__cls += e.value
          const src = (e as unknown as { sources: { node?: Element }[] }).sources.map((x) => (x.node ? `${x.node.nodeName}.${(x.node as HTMLElement).className}` : '?'))
          w.__why.push(`${e.value.toFixed(3)} ${src.join(',')}`)
        }
    }).observe({ type: 'layout-shift', buffered: false })
    let on = true
    const tick = () => {
      const m = (document.querySelector('#main .view-pane:not([hidden])') ?? document.querySelector('#main')) as HTMLElement | null
      const kind = !m || !m.children.length ? 'blank' : m.querySelector('.sk, .skl') ? 'skeleton' : m.querySelector('.liveview > .mk-quiet') ? 'loading' : m.querySelector('.liveview') ? 'live' : m.querySelector('.brief') ? 'brief' : 'other'
      w.__f.push(kind)
      w.__h.push(Math.round(m?.getBoundingClientRect().height ?? 0))
      if (on) requestAnimationFrame(tick)
    }
    w.__stop = () => (on = false)
    requestAnimationFrame(tick)
  })
}

async function report(page: Page) {
  await page.waitForFunction(() => !document.querySelector('#main .skl'), undefined, { timeout: 20_000 })
  await page.waitForTimeout(900)
  return page.evaluate(() => {
    const w = window as unknown as { __f: string[]; __h: number[]; __cls: number; __why: string[]; __stop: () => void }
    w.__stop()
    return { frames: w.__f, heights: w.__h, cls: w.__cls, why: w.__why }
  })
}

async function slow(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
}

async function ready(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=live&v=`)
  await expect(page.locator('.liveview')).toBeVisible()
  await slow(page)
}

for (const width of [1280, 390]) {
  test(`${width}px: Live and the Briefing, both ways, with no blank frame and no shift`, async ({ page }) => {
    await ready(page, width)
    const go = (name: string) => (width < 600 ? page.locator('.tabbar').getByRole('button', { name }) : tab(page, name))
    const seen = new Set<string>(['Live'])
    for (const [to, shown] of [['Briefing', '.brief'], ['Live', '.liveview'], ['Briefing', '.brief'], ['Live', '.liveview']] as const) {
      await watch(page)
      await go(to).click()
      await expect(page.locator(shown)).toBeVisible()
      const r = await report(page)
      // The loading shape is for a tab with nothing read yet (its first visit); a tab seen before comes straight back.
      const first = !seen.has(to)
      seen.add(to)
      const bad = r.frames.filter((k) => (k !== 'live' && k !== 'brief' && k !== 'skeleton') || (k === 'skeleton' && !first))
      const line = r.frames.filter((k, i) => k !== r.frames[i - 1]).join('>')
      console.log(`SWITCH ${width} -> ${to}: ${line} cls=${r.cls.toFixed(4)} ${r.why.join(' | ')}`)
      expect(bad, `${to}: frames without a screen; ${line}`).toHaveLength(0)
      expect(r.cls, `${to}: layout shift`).toBeLessThan(0.02)
    }
  })
}

// Both screens stay built once shown (and Live is built behind the Briefing when the page is idle): going back and forth
// has no loading shape, no card that arrives late (the screen's height is the same from its first frame to its last), no shift.
for (const width of [1280, 390]) {
  test(`${width}px: from the Briefing, both ways twice: one screen at a time, its height settled from the first frame, no shift`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
    await expect(page.locator('.brief')).toBeVisible({ timeout: 20_000 })
    await page.waitForFunction(() => !document.querySelector('#main .skl'), undefined, { timeout: 20_000 })
    // Live is built when the page is idle, out of sight.
    await expect(page.locator('.liveview')).toBeAttached({ timeout: 20_000 })
    await expect(page.locator('.liveview')).toBeHidden()
    // And its cards have their answers: on a slow machine the click would otherwise land on Live's loading shape.
    await page.waitForFunction(() => !document.querySelector('.liveview .sk, .liveview .skl'), undefined, { timeout: 20_000 })
    await page.waitForTimeout(2800) // the Briefing's reading is done
    await slow(page)
    const go = (name: string) => (width < 600 ? page.locator('.tabbar').getByRole('button', { name }) : tab(page, name))
    // A Replay that is playing ends when Live is shown, and is not playing when the Briefing is back.
    const replay = page.locator('.brief [data-replay]').first()
    if (await replay.isVisible()) {
      await replay.click()
      await expect(replay).toHaveAttribute('aria-label', 'Stop')
      await go('Live').click()
      await expect(page.locator('.liveview')).toBeVisible()
      await go('Briefing').click()
      await expect(page.locator('.brief')).toBeVisible()
      await expect(replay).toHaveAttribute('aria-label', 'Replay')
    }
    for (const [to, shown, other] of [['Live', '.liveview', '.brief'], ['Briefing', '.brief', '.liveview'], ['Live', '.liveview', '.brief'], ['Briefing', '.brief', '.liveview']] as const) {
      await watch(page)
      await go(to).click()
      await expect(page.locator(shown)).toBeVisible()
      await expect(page.locator(other)).toBeHidden()
      const r = await report(page)
      const line = r.frames.filter((k, i) => k !== r.frames[i - 1]).join('>')
      console.log(`BACK-AND-FORTH ${width} -> ${to}: ${line} cls=${r.cls.toFixed(4)} ${r.why.join(' | ')}`)
      expect(r.frames.filter((k) => k !== 'live' && k !== 'brief'), `${to}: frames without a screen; ${line}`).toHaveLength(0)
      // From the first frame the new screen is as tall as it will be (the old one's last frame is the one before the switch).
      const mine = r.heights.filter((_, i) => r.frames[i] === (to === 'Live' ? 'live' : 'brief'))
      expect(Math.max(...mine) - Math.min(...mine), `${to}: the screen's height changed after it was shown`).toBeLessThanOrEqual(1)
      expect(r.cls, `${to}: layout shift`).toBeLessThan(0.02)
    }
  })
}

test('Explore closes after its exit animation and leaves no overlay behind', async ({ page }) => {
  await ready(page, 1280)
  await tab(page, 'Briefing').click()
  await expect(page.locator('.brief')).toBeVisible()
  await page.getByRole('button', { name: /^Explore all data/ }).last().click()
  await expect(page.locator('#xp.on')).toBeVisible()
  await expect(page.locator('#xscrim')).toHaveCSS('opacity', '1')
  // When Escape lands and when the panel's content is taken out, on the page's own clock.
  await page.evaluate(() => {
    const w = window as unknown as { __esc: number; __gone: number }
    w.__esc = 0
    w.__gone = 0
    window.addEventListener('keydown', (e) => e.key === 'Escape' && !w.__esc && (w.__esc = performance.now()), true)
    new MutationObserver(() => {
      if (!document.querySelector('#xp #xpBody') && !w.__gone) w.__gone = performance.now()
    }).observe(document.querySelector('#xp')!, { childList: true, subtree: true })
  })
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __gone: number }).__gone)).toBeGreaterThan(0)
  // The panel stays built while it slides out (at least the exit glide), and is taken out after.
  const wait = await page.evaluate(() => {
    const w = window as unknown as { __esc: number; __gone: number }
    return w.__gone - w.__esc
  })
  expect(wait).toBeGreaterThanOrEqual(180)
  await expect(page.locator('#xscrim')).toHaveCSS('opacity', '0')
  await expect(page.locator('#xscrim')).toHaveCSS('pointer-events', 'none')
  await expect(page).not.toHaveURL(/xp=/)
  // Nothing is left over the page: a click in the middle reaches the page, not an overlay.
  const top = await page.evaluate(() => document.elementFromPoint(640, 450)?.closest('#xscrim, #xp') !== null)
  expect(top).toBe(false)
})
