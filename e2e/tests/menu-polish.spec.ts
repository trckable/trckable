// The v2 menus and lists share one row look: one active row at a time (the mouse moves it, the arrow keys move it) and a small gap
// between neighbours, so no two fills merge. Chromium only. Pictures for the review: MP_SHOTS=<folder> MP_SCHEME=light|dark MP_WIDTH=1440|390.
import { expect, test, type Locator, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the rows')

const SHOTS = process.env.MP_SHOTS
const SCHEME = process.env.MP_SCHEME === 'light' ? 'light' : 'dark'
const WIDTH = Number(process.env.MP_WIDTH ?? 1440)
const ROW = '.mi, .xmi, .xri, .pi, button[role="menuitem"]'

test.use({ colorScheme: SCHEME })

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('menu-polish')
})

async function open(page: Page) {
  await page.setViewportSize({ width: WIDTH, height: WIDTH < 600 ? 800 : 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
  await expect(page.locator('.brief')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: '*{transition:none!important}' }) // a fill is read at once, not while it fades
}

const menus: Record<string, { open: (p: Page) => Promise<Locator> }> = {
  palette: {
    open: async (p) => {
      await p.keyboard.press('ControlOrMeta+k')
      const box = p.locator('.palbox')
      await expect(box).toBeVisible()
      return box
    },
  },
  sites: {
    open: async (p) => {
      await p.locator('#siteBtn').click()
      const box = p.locator('.mk-menu.sites.on')
      await expect(box).toBeVisible()
      return box
    },
  },
  period: {
    open: async (p) => {
      await p.locator('#perBtn').click()
      const box = p.locator('#perMenu.on')
      await expect(box).toBeVisible()
      return box
    },
  },
  account: {
    open: async (p) => {
      await p.locator('.hd .account-btn').click()
      const box = p.locator('.pop.more-menu')
      await expect(box).toBeVisible()
      return box
    },
  },
  explore: {
    open: async (p) => {
      await p.keyboard.press('e')
      await p.locator('[data-xm="pick"]').click()
      const box = p.locator('#xm-pick.on')
      await expect(box).toBeVisible()
      return box
    },
  },
}

for (const [name, m] of Object.entries(menus)) {
  test(`${name}: one active row, and the rows do not touch`, async ({ page }) => {
    test.skip(name === 'period' && WIDTH < 600, 'the period pill is not in the phone header')
    await open(page)
    const box = await m.open(page)
    await page.waitForTimeout(300)
    if (SHOTS) await box.screenshot({ path: `${SHOTS}/${name}-${WIDTH}-${SCHEME}.png` })
    const rows = box.locator(ROW).filter({ visible: true })
    const n = await rows.count()
    expect(n).toBeGreaterThan(2)

    // Adjacent rows: a gap between the boxes (no merged fills).
    const boxes = (await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect())))
      .filter((b) => b.height > 0)
      .sort((a, b) => a.top - b.top)
    for (let i = 1; i < boxes.length; i++) {
      const gap = boxes[i].top - boxes[i - 1].bottom
      if (gap > -1 && boxes[i].left < boxes[i - 1].right && boxes[i].right > boxes[i - 1].left) expect(gap, `rows ${i - 1} and ${i}`).toBeGreaterThanOrEqual(2)
    }

    // One active row: the fill of a row that is not the pointer's or the key's own is clear. The row of the page in view (aria-current) keeps its own soft fill, apart from that count.
    // Selected means the accent bar (and aria-current / .on), which wears the hover's fill on purpose (#539): it is not counted.
    const idle = name === 'sites' ? rows.and(page.locator(':not([aria-current]):not(.on)')) : rows.and(page.locator(':not([aria-current])'))
    const sites = name === 'sites'
    // In the site menu the fill sits on the whole row (a site with its buttons), so that is what is read.
    const fills = () =>
      rows.evaluateAll((els, sites) => {
        const whole = new Set(els.map((e) => (sites ? (e.closest('.site-row, .site-head') ?? e) : e)))
        return [...whole]
          .filter((e) => !e.hasAttribute('aria-current') && !(sites && (e.classList.contains('on') || e.querySelector('.mi.on'))))
          .map((e) => getComputedStyle(e).backgroundColor)
          .map((c) => (c === 'rgba(0, 0, 0, 0)' || c === 'transparent' ? 0 : 1))
      }, sites)
    const painted = async () => {
      await page.waitForTimeout(100)
      return (await fills()).reduce<number>((a, b) => a + b, 0)
    }
    if (WIDTH < 600) return // no pointer on a phone
    await idle.nth(1).hover()
    expect(await painted(), 'after hover').toBe(1)
    // The keys walk to a row (the account menu's theme switch comes first, and is not a row).
    for (let i = 0; i < 6 && !(await page.evaluate((sel) => !!document.activeElement?.matches(sel), ROW)); i++) await page.keyboard.press('ArrowDown')
    expect(await painted(), 'after hover and arrow keys').toBe(1)
    await idle.nth(Math.min(3, (await idle.count()) - 1)).hover()
    expect(await painted(), 'after hovering another row').toBe(1)
    if (SHOTS) await box.screenshot({ path: `${SHOTS}/${name}-${WIDTH}-${SCHEME}-active.png` })
  })
}
