// The header is one set of controls, the site menu is the one place for sites, "All sites" opens the overview, and
// Explore fills the window when it is full.
import { expect, test, type Page } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the header')
const SHOTS = process.env.HEADER_SHOTS

async function open(page: Page, width: number, scheme: 'light' | 'dark', query = '?view=briefing&period=7d') {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.context().addCookies([{ name: 'trckable_session', value: await session('header-sets'), url: API }])
  await page.addInitScript(() => localStorage.setItem('trckable.onboarding.skipped', '1'))
  await page.goto(`${API}/${HISTORY_DOMAIN}${query}&v=`)
  await expect(page.locator('.hd')).toBeVisible()
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, scale: 'css' })
}

for (const [width, scheme] of [[1440, 'dark'], [2000, 'light']] as const) {
  test(`${width}px ${scheme}: Explore full fills the window`, async ({ page }) => {
    await open(page, width, scheme, '?view=briefing&period=7d&x=overview')
    await page.locator('#xpFull').click()
    await page.waitForTimeout(700)
    const m = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)?.getBoundingClientRect()
      const xp = r('.xp.full'), body = r('#xpBody')
      const kids = [...document.querySelectorAll('#xpBody > *')].map((e) => Math.round(e.getBoundingClientRect().right))
      return { xp: xp && [xp.left, xp.right], body: body && [body.left, body.right], kids, w: innerWidth }
    })
    // The content reaches the same side padding on the right as on the left.
    expect(m.kids[0], 'content right edge').toBeGreaterThan(m.w - 48)
    await shot(page, `explore-${width}-${scheme}`)
  })
}

for (const [width, scheme] of [[1440, 'dark'], [390, 'light']] as const) {
  test(`${width}px ${scheme}: the page scrolls under a header that keeps a band of its own`, async ({ page }) => {
    await open(page, width, scheme)
    await page.setViewportSize({ width, height: 560 }) // the Briefing is short: a low window leaves room to scroll
    await page.waitForTimeout(800)
    // Down as far as 260 px goes (a short page stops sooner), then a little back up.
    const down = await page.evaluate(() => Math.min(260, document.documentElement.scrollHeight - innerHeight))
    expect(down, 'room to scroll past the header').toBeGreaterThan(120)
    await page.evaluate((y) => window.scrollTo(0, y), down)
    await page.waitForTimeout(600)
    // A phone's bar leaves on the way down: a little back up brings it in.
    await page.evaluate((y) => window.scrollTo(0, y), down - 20)
    await page.waitForTimeout(600)
    const band = await page.evaluate(() => {
      const hd = document.querySelector('.hd')!.getBoundingClientRect()
      const lowest = Math.max(...[...document.querySelectorAll('.hd button, .hd #logo')].map((e) => e.getBoundingClientRect().bottom))
      const glass = getComputedStyle(document.querySelector('.hd')!, '::before')
      return { room: hd.bottom - lowest, solid: glass.backgroundColor, shown: glass.opacity, line: getComputedStyle(document.querySelector('.hd')!).borderBottomWidth }
    })
    expect(band.room, 'room under the controls').toBeGreaterThanOrEqual(10)
    // The bar is a floating layer that shows once the page has moved.
    expect(band.solid).not.toBe('rgba(0, 0, 0, 0)')
    expect(band.shown).toBe('1')
    expect(band.line).toBe('0px')
    await shot(page, `scrolled-${width}-${scheme}`)
  })
}

for (const [width, scheme] of [[1440, 'dark'], [2000, 'light'], [390, 'light']] as const) {
  test(`${width}px ${scheme}: the controls are one set and the person is last`, async ({ page }) => {
    await open(page, width, scheme)
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hd #siteBtn, .hd .exb, .hd .ib.bell, .hd .account-btn')].map((e) => {
        const r = e.getBoundingClientRect()
        return { cls: e.className, h: Math.round(r.height), right: r.right, br: getComputedStyle(e).borderRadius }
      }).filter((b) => b.h > 0),
    )
    expect(boxes.length).toBeGreaterThanOrEqual(3)
    for (const b of boxes) expect(b.h, b.cls).toBe(boxes[0].h)
    const last = await page.evaluate(() => {
      const kids = [...document.querySelectorAll<HTMLElement>('.hd > *')].filter((e) => e.getBoundingClientRect().width > 0 && !e.classList.contains('sr'))
      const right = kids.map((e) => e.getBoundingClientRect().right)
      return { person: kids.findIndex((e) => e.matches('.account-menu')), rightMost: right.indexOf(Math.max(...right)) }
    })
    expect(last.person).toBeGreaterThanOrEqual(0)
    expect(last.rightMost).toBe(last.person)
    await shot(page, `header-${width}-${scheme}`)
  })
}

test('All sites in the site menu opens the overview', async ({ page }) => {
  await open(page, 1440, 'dark')
  await page.locator('#siteBtn').click()
  await page.locator('#siteMenu .mi.all').click()
  await expect(page).toHaveURL(/\/sites(\?|$)/)
  await expect(page.locator('.tm-head')).toBeVisible()
})

for (const [width, scheme, full] of [[1440, 'dark', false], [390, 'dark', false], [2000, 'light', true]] as const) {
  test(`${width}px ${scheme}${full ? ' full' : ''}: every Explore tab bar keeps its labels whole`, async ({ page }) => {
    await open(page, width, scheme, '?view=briefing&period=7d&x=funnels')
    let checked = 0
    for (const section of ['funnels', 'overview', 'pages', 'sources', 'countries', 'devices', 'sales', 'ai']) {
      await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&x=${section}&v=`)
      await page.locator('#xpBody').waitFor({ timeout: 4000 }).catch(() => undefined)
      if (!(await page.locator('#xpBody').count())) continue // a table this build does not offer
      if (full) {
        await page.locator('#xpFull').click()
      }
      await page.waitForTimeout(500)
      if (!(await page.locator('.xp .xsub').count())) continue
      checked++
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.xp .xsub')].flatMap((bar) => {
          const rects = [...bar.querySelectorAll<HTMLElement>('button')].map((b) => ({ b, r: b.getBoundingClientRect() }))
          const out: string[] = []
          rects.forEach(({ b, r }, i) => {
            if (b.scrollWidth > b.clientWidth + 1) out.push(`clipped: ${b.textContent}`)
            const next = rects[i + 1]
            if (next && r.right > next.r.left + 0.5) out.push(`overlap: ${b.textContent}`)
            const dot = b.querySelector('i.xdot')?.getBoundingClientRect()
            if (dot && (dot.right > r.right - 4 || dot.left < r.left)) out.push(`dot outside: ${b.textContent}`)
            if (b.getAttribute('aria-selected') === 'true') {
              const box = bar.getBoundingClientRect()
              if (r.left < box.left - 1 || r.right > box.right + 1) out.push(`active out of view: ${b.textContent}`)
            }
          })
          return out
        }),
      )
      expect(bad, section).toEqual([])
      if (section === 'funnels') await shot(page, `tabs-${width}-${scheme}${full ? '-full' : ''}`)
    }
    expect(checked).toBeGreaterThanOrEqual(5)
  })
}

// Nothing in the header lies over anything else, at any width from a folded phone's outer screen to a big monitor.
const SIZES: [number, number, boolean][] = [
  ...Array.from({ length: 56 }, (_, i): [number, number, boolean] => [360 + i * 40, 900, false]),
  [344, 882, true],
  [884, 1104, true],
  [948, 1000, true],
]

test('no control of the header overlaps another, every 40 px from 360 to 2560 and on a foldable', async ({ page }) => {
  await open(page, 1440, 'dark')
  await page.waitForTimeout(3000) // the setup ring arrives
  const bad: string[] = []
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(60)
    const found = await page.evaluate(() => {
      const els = [...document.querySelectorAll<HTMLElement>('.hd #logo, .hd #siteBtn, .hd .ringb, .hd #views, .hd #perBtn, .hd .exb, .hd .ib.bell, .hd .account-btn, .hd .update-pill, .hd .planw')]
      const boxes = els.map((e) => ({ n: e.id || e.className.split(' ')[0], r: e.getBoundingClientRect() })).filter((b) => b.r.width > 0 && b.r.height > 0)
      const out: string[] = []
      boxes.forEach((a, i) => {
        if (a.r.right > innerWidth + 0.5 || a.r.left < -0.5) out.push(`${a.n} off screen`)
        for (const b of boxes.slice(i + 1)) {
          const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
          const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
          if (x > 0.5 && y > 0.5) out.push(`${a.n} over ${b.n}`)
        }
      })
      return out
    })
    for (const f of found) bad.push(`${w}x${h}: ${f}`)
  }
  expect(bad).toEqual([])
})

test('at tablet width the header is compact: no key hint, a short period, a square search, the person last', async ({ page }) => {
  await open(page, 948, 'dark')
  await page.setViewportSize({ width: 948, height: 1000 })
  await page.waitForTimeout(300)
  await expect(page.locator('.hd .sitechip .mk-kbd')).toBeHidden()
  await expect(page.locator('.hd .exb .t2')).toBeHidden()
  const search = await page.locator('.hd .exb').boundingBox()
  const bell = await page.locator('.hd .ib.bell').boundingBox()
  expect(Math.round(search!.width)).toBe(Math.round(bell!.width))
  await expect(page.locator('.hd #perBtn')).toHaveAttribute('title', /.+/)
  await shot(page, 'header-948-dark')
})
