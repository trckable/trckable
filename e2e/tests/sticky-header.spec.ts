// The header stays on top of the window while a page is scrolled, on Live, the Briefing and with Explore open, wide; a phone's bar goes out of the way
// while the page scrolls down and comes back when it scrolls up.
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

for (const width of [1440, 1024, 820, 768, 735, 712]) {
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
      // Its bar shows once the page has moved under it.
      await expect(page.locator('.hd')).toHaveAttribute('data-stuck', 'true')
      const bar = await page.locator('.hd').evaluate((el) => getComputedStyle(el, '::before').backgroundColor)
      expect(bar).not.toBe('rgba(0, 0, 0, 0)')
    })
  }
}

// Once the page has moved, the bar sits inset from the window's sides, as on the landing page, and gets shorter (a phone keeps its compact bar), and the page under it does not move.
async function measure(page: Page) {
  return page.evaluate(() => {
    const hd = document.querySelector('.hd')!
    const chip = hd.querySelector('.mk-chip')!
    const before = getComputedStyle(hd, '::before')
    return {
      bar: hd.getBoundingClientRect().height,
      chip: chip.getBoundingClientRect().height,
      barW: parseFloat(before.width),
      inset: hd.getBoundingClientRect().left + parseFloat(before.left),
      radius: before.borderBottomLeftRadius,
      topRadius: before.borderTopLeftRadius,
      line: before.borderTopWidth,
      blur: before.backdropFilter,
      opacity: before.opacity,
      limeOn: getComputedStyle(hd.querySelector('#views .spill')!, '::after').opacity,
      limeH: getComputedStyle(hd.querySelector('#views .spill')!, '::after').height,
      padLeft: parseFloat(getComputedStyle(hd).paddingLeft),
      content: document.querySelector('#main')!.getBoundingClientRect().top + scrollY,
      across: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      window: document.documentElement.clientWidth,
    }
  })
}

for (const width of [1920, 1440, 390]) {
  test(`${width}px: scrolled, the bar ${width > 700 ? 'sits inset on the top edge and gets shorter' : 'keeps its compact bar'}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
    await expect(page.locator('.hd')).toBeVisible()
    await page.waitForTimeout(800)
    await page.evaluate(() => {
      const pad = document.createElement('div')
      pad.style.height = '3000px'
      document.querySelector('#main')?.appendChild(pad)
    })
    const top = await measure(page)
    await page.mouse.move(width / 2, 500)
    await page.evaluate(() => window.scrollTo(0, 1500))
    await expect(page.locator('.hd')).toHaveAttribute('data-stuck', 'true')
    await page.waitForTimeout(500)
    const low = await measure(page)
    expect(low.across, 'no sideways scroll').toBe(true)
    if (width > 700) {
      expect(low.opacity).toBe('1')
      expect(low.inset, 'inset from the window edge').toBeGreaterThanOrEqual(16)
      expect(low.barW, 'narrower than the window').toBeLessThan(low.window - 32)
      expect(low.radius, 'the landing bar radius').toBe('20px')
      expect(low.topRadius, 'square on top, like the landing bar').toBe('0px')
      expect(low.line, 'a hairline all round').toBe('1px')
      expect(low.blur, 'the landing blur').toContain('blur(22px)')
      expect(low.limeOn, 'the active view is underlined').toBe('1')
      expect(low.limeH).toBe('2px')
      expect(low.bar, 'shorter').toBeLessThan(top.bar)
      expect(low.chip, 'smaller controls').toBeLessThan(top.chip)
      expect(low.padLeft, 'the controls stay where they are').toBe(top.padLeft)
      expect(low.content, 'the page under it has not moved').toBeCloseTo(top.content, 0)
    } else {
      expect(low.bar, 'the compact bar keeps its height').toBeCloseTo(top.bar, 0)
      expect(low.chip).toBeCloseTo(top.chip, 0)
      expect(low.radius).toBe('20px')
    }
    // Back at the top, the bar is as it was.
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(page.locator('.hd')).toHaveAttribute('data-stuck', 'false')
    await page.waitForTimeout(500)
    const back = await measure(page)
    expect(back.bar).toBeCloseTo(top.bar, 0)
    expect(back.chip).toBeCloseTo(top.chip, 0)
  })
}

test('1440px: the change is not animated when motion is reduced', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
  await expect(page.locator('.hd')).toBeVisible()
  const t = await page.evaluate(() => {
    const hd = document.querySelector('.hd')!
    return [getComputedStyle(hd).transitionDuration, getComputedStyle(hd, '::before').transitionDuration, getComputedStyle(hd.querySelector('.mk-chip')!).transitionDuration]
  })
  expect(t.every((d) => d.split(',').every((x) => parseFloat(x) === 0))).toBe(true)
})

// A phone (a compact bar, 700 px and under): out of the way on the way down, back after a little scroll up, always there at the top.
async function phone(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
  await expect(page.locator('.hd')).toBeVisible()
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    const pad = document.createElement('div')
    pad.style.height = '3000px'
    document.querySelector('#main')?.appendChild(pad)
  })
}
const scrollTo = async (page: Page, y: number) => {
  await page.evaluate((v) => window.scrollTo(0, v), y)
  await page.waitForTimeout(450)
}
const barBottom = (page: Page) => page.locator('.hd').evaluate((el) => el.getBoundingClientRect().bottom)

for (const width of [390, 360]) {
  test(`${width}px: the top bar hides on the way down, returns on a little scroll up and is there at the top`, async ({ page }) => {
    await phone(page, width)
    expect(await barBottom(page), 'shown at the top').toBeGreaterThan(40)
    await scrollTo(page, 600)
    await scrollTo(page, 1200)
    await expect(page.locator('.hd')).toHaveAttribute('data-hidden', 'true')
    expect(await barBottom(page), 'out of the window').toBeLessThanOrEqual(0)
    // 4 px up is not enough, 12 px is.
    await scrollTo(page, 1196)
    expect(await barBottom(page)).toBeLessThanOrEqual(0)
    await scrollTo(page, 1184)
    await expect(page.locator('.hd')).toHaveAttribute('data-hidden', 'false')
    await page.waitForTimeout(400)
    expect(await barBottom(page), 'back in').toBeGreaterThan(40)
    expect((await page.locator('.hd').boundingBox())!.y).toBeCloseTo(0, 0)
    await scrollTo(page, 1500)
    await expect(page.locator('.hd')).toHaveAttribute('data-hidden', 'true')
    await scrollTo(page, 0)
    await expect(page.locator('.hd')).toHaveAttribute('data-hidden', 'false')
    expect(await barBottom(page), 'always shown at the top').toBeGreaterThan(40)
  })
}

test('390px: no empty pill sits between the site and the bell', async ({ page }) => {
  await phone(page, 390)
  const kids = await page.locator('.hd > *').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0 && !e.classList.contains('sr')).map((e) => ({ w: e.getBoundingClientRect().width, text: e.textContent, box: e.matches('.mk-chip, .pill-x') })))
  expect(kids.some((k) => k.box && k.w > 0 && !k.text?.trim() && k.w !== 44 && k.w !== 40)).toBe(false)
  await expect(page.locator('.hd .pill-x')).toBeHidden()
})

test('390px: motion reduced, the bar goes without a transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await phone(page, 390)
  const t = await page.locator('.hd').evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(t.split(',').every((x) => parseFloat(x) === 0)).toBe(true)
  await scrollTo(page, 1200)
  await expect(page.locator('.hd')).toHaveAttribute('data-hidden', 'true')
})

test('390px: from another period, the in-page period and one tap on Today go back to today', async ({ page }) => {
  await phone(page, 390)
  await expect(page.locator('.tline')).toContainText(/7 days/i)
  await page.locator('.tline').click()
  await page.locator('.pmenu.on .mi', { hasText: /^\s*Today/ }).first().click()
  await expect(page.locator('.tline')).toContainText(/today/i)
  await expect(page).not.toHaveURL(/period=7d/)
})
