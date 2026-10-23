// The site switcher, arranged: pin to the top, a named group with a heading
// that folds, Alt + ↑/↓ and drag to reorder, search past six sites, a real
// "right now" dot; saved for the account (a reload keeps it) and the same
// order in All sites. The layout is the whole account's, so the browsers take
// turns (exclusive) instead of rearranging each other's list mid-test.
import { expect, test, type APIRequestContext, type Page } from './fixtures'
import { API } from '../playwright.config'
import { exclusive, session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('switcher')
})

type Site = { id: string; domain: string }
const layout = async (r: APIRequestContext) => (await (await r.get(`${API}/api/v1/site-layout`)).json()) as { order: string[]; pinned: string[]; groups: { name: string; sites: string[] }[] }

async function makeSites(r: APIRequestContext, tag: string, n: number): Promise<Site[]> {
  const out: Site[] = []
  for (let i = 0; i < n; i++) {
    const res = await r.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `sw${i}-${tag}.test` } })
    expect(res.ok()).toBe(true)
    out.push((await res.json()) as Site)
  }
  return out
}

/** The layout goes back to none. The sites stay, like the install suite's:
 *  deleting one purges its analytics, which takes a while under load. */
async function cleanUp(r: APIRequestContext) {
  await r.put(`${API}/api/v1/site-layout`, { headers: H, data: { order: [], pinned: [], groups: [] } })
}

async function open(page: Page) {
  await page.locator('#siteBtn').click()
  const menu = page.locator('#siteMenu.on')
  await expect(menu).toBeVisible()
  return menu
}

const row = (page: Page, s: Site) => page.locator(`[data-site="${s.id}"]`)

test('pin, group, reorder by keyboard and drag, saved for the account, same order in All sites', async ({ page, browserName }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await exclusive('switcher', async () => {
    const tag = `${browserName}-${Date.now()}`
    const sites = await makeSites(page.request, tag, 6)
    try {
      await page.goto(`${API}/example.com`)
      let menu = await open(page)
      // The finder, All sites first, and Add a site last.
      await expect(menu.getByRole('searchbox', { name: 'Find a site...' })).toBeVisible()
      await expect(menu.getByRole('button', { name: /^All sites/ })).toBeVisible()
      await expect(menu.getByRole('button', { name: /Add a site/ })).toBeVisible()

      // Pin the last new site: it goes to the top, under "Pinned".
      const [a, b, c, , , f] = sites
      await row(page, f).getByRole('button', { name: `${f.domain}: options` }).click()
      await page.getByRole('menuitem', { name: 'Pin to top' }).click()
      await expect(menu.getByRole('heading', { name: 'Pinned' })).toBeVisible()
      await expect.poll(async () => (await layout(page.request)).pinned).toEqual([f.id])

      // A new group, with a site in it.
      await row(page, a).getByRole('button', { name: `${a.domain}: options` }).click()
      await page.getByRole('menuitem', { name: 'New group…' }).click()
      const ask = page.getByRole('dialog', { name: 'New group' })
      await ask.getByLabel('Group name').fill(`Clients ${browserName}`)
      await ask.getByRole('button', { name: 'Create' }).click()
      const fold = menu.getByRole('button', { name: `Clients ${browserName}`, exact: true })
      await expect(fold).toHaveAttribute('aria-expanded', 'true')
      await expect.poll(async () => (await layout(page.request)).groups.map((g) => g.name)).toEqual([`Clients ${browserName}`])
      await fold.click()
      await expect(fold).toHaveAttribute('aria-expanded', 'false')
      await expect(row(page, a)).toHaveCount(0)
      await fold.click()
      await expect(row(page, a)).toBeVisible()

      // Keyboard: Alt + ↑ moves c above b, and keeps the focus on it.
      const idx = (l: { order: string[] }, s: Site) => l.order.indexOf(s.id)
      await row(page, c).locator('.site').focus()
      await page.keyboard.press('Alt+ArrowUp')
      await expect.poll(async () => { const l = await layout(page.request); return idx(l, c) < idx(l, b) }).toBe(true)
      await expect(row(page, c).locator('.site')).toBeFocused()
      await expect(page.locator('#siteMenu [aria-live]')).toContainText(/^Moved .+ to position \d+$/)

      // Drag: b dropped on the top of c goes just before it (neighbours, so no
      // list scrolls mid-drag); the rows slide while it moves, and Esc puts
      // it back. Moving into a group is the ⋯ menu's, tested above.
      const grab = (await row(page, b).locator('.site').boundingBox())!
      const over = (await row(page, c).boundingBox())!
      await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2)
      await page.mouse.down()
      await page.mouse.move(grab.x + grab.width / 2, over.y + 4, { steps: 10 })
      await expect(row(page, b)).toHaveClass(/dragging/)
      await expect.poll(async () => (await row(page, b).boundingBox())!.y < (await row(page, c).boundingBox())!.y).toBe(true)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/switcher-drag-${browserName}.png` })
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await expect(row(page, b)).not.toHaveClass(/dragging/)
      await expect(page.locator('#siteMenu.on')).toBeVisible()
      await page.waitForTimeout(300)
      expect(idx(await layout(page.request), b)).toBeGreaterThan(idx(await layout(page.request), c))
      await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2)
      await page.mouse.down()
      await page.mouse.move(grab.x + grab.width / 2, over.y + 4, { steps: 10 })
      await page.mouse.up()
      await expect.poll(async () => { const l = await layout(page.request); return idx(l, b) < idx(l, c) }).toBe(true)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/switcher-${browserName}.png` })

      // Saved on the server: a reload shows the same.
      await page.reload()
      menu = await open(page)
      await expect(menu.locator('.site-section').first().getByRole('heading', { name: 'Pinned' })).toBeVisible()
      await expect(menu.getByRole('button', { name: `Clients ${browserName}`, exact: true })).toBeVisible()
      // Search flattens the sections.
      await menu.getByRole('searchbox', { name: 'Find a site...' }).fill(`sw2-${tag}`)
      await expect(menu.locator('[data-site]')).toHaveCount(1)
      await page.keyboard.press('Escape')

      // All sites: the pinned site has its line.
      await page.goto(`${API}/sites`)
      await expect(page.locator('.tm-row', { hasText: f.domain })).toBeVisible({ timeout: 15_000 })
    } finally {
      await cleanUp(page.request)
    }
  })
})

test('the dot is real (in the list, none on the avatar): a visit in the last five minutes, from the sites list', async ({ page, browserName }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const ctx = await page.context().browser()!.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/switcher-${browserName}-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
  await page.goto(`${API}/example.com`)
  await expect(page.locator('#siteBtn .mk-dot.now')).toHaveCount(0) // the chip carries no "now" mark; the list says the state
  const menu = await open(page)
  await expect(menu.locator('.site .mk-dot.now').first()).toBeVisible({ timeout: 15_000 })
  // In the list the dot says it alone: no line of text under the name.
  await expect(menu.locator('.now-note')).toHaveCount(0)
})

test('the chosen site\'s mark sits on the middle of its row, with its dot on the mark', async ({ page, browserName }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    await page.setViewportSize({ width, height })
    await page.goto(`${API}/example.com`)
    const menu = await open(page)
    const on = menu.locator('.site.on').first()
    // The sheet slides in: measure once it has stopped. The mark is level with the row's middle, and the dot sits on its corner.
    const gap = () =>
      on.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const m = el.querySelector('.mkwrap')!.getBoundingClientRect()
        return Math.abs(r.top + r.height / 2 - (m.top + m.height / 2))
      })
    await expect.poll(gap).toBeLessThanOrEqual(1)
    const onMark = await on.evaluate((el) => {
      const m = el.querySelector('.mkwrap')!.getBoundingClientRect()
      const d = el.querySelector('.mk-dot')!.getBoundingClientRect()
      return d.right <= m.right + 4 && d.bottom <= m.bottom + 4 && d.right >= m.right - 8 && d.bottom >= m.bottom - 8
    })
    expect(onMark).toBe(true)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/switcher-dot-${width}-${browserName}.png` })
  }
})

test('on a phone the switcher fits the screen', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/example.com`)
  const menu = await open(page)
  const box = await menu.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/switcher-phone-${browserName}.png` })
})

test('the first open is final: the popup does not move or resize afterwards', async ({ page, browserName }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await exclusive('switcher', async () => {
    await makeSites(page.request, `still-${browserName}-${Date.now()}`, 3)
    await page.goto(`${API}/example.com`)
    // A cold page: nothing of the switcher is warmed by the pointer.
    const menu = await open(page)
    // The layout box, not the painted one: the popup's short rise-in moves the
    // painted box on purpose; what must not change is where and how big it is.
    const box = () => menu.evaluate((e: HTMLElement) => ({ x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight }))
    const first = await box()
    await page.waitForTimeout(500)
    expect(await box()).toEqual(first)
    await cleanUp(page.request)
  })
})

test('the keys work in the list: ↑/↓ move, a number opens that site, and the numbers show without blocking', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/example.com`)
  const menu = await open(page)
  // Today's numbers arrive after the list is open.
  await expect(menu.locator('.site .now b').first()).toBeVisible({ timeout: 15_000 })
  const rows = menu.locator('.site')
  await rows.first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(rows.first()).toBeFocused()
  const second = await rows.nth(1).locator('.nm').textContent()
  await page.keyboard.press('2')
  await expect(page).toHaveURL(new RegExp('/' + encodeURIComponent(second!).replace(/\./g, '\\.')))
})

for (const [name, width, height, scheme] of [['desktop', 1440, 900, 'light'], ['desktop-dark', 1440, 900, 'dark'], ['phone', 390, 844, 'dark']] as const) {
  test(`a site with a state says it in words where its number would be, and no key hints crowd the foot (${name})`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ colorScheme: scheme })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    // The first site stopped answering two days ago.
    await page.route(/\/api\/v1\/sites(\?.*)?$/, async (route) => {
      const res = await route.fetch()
      const body = (await res.json()) as { sites: { last_event_at?: number; check?: unknown }[] }
      const at = Math.floor(Date.now() / 1000)
      if (body.sites[0]) {
        body.sites[0].last_event_at = at - 2 * 86400 - 600
        body.sites[0].check = { at, error: 'unreachable' }
      }
      await route.fulfill({ response: res, json: body })
    })
    await page.goto(`${API}/example.com`)
    const menu = await open(page)
    const word = menu.locator('.state-word').first()
    await expect(word).toHaveText('down 2d')
    await expect(word).toHaveAttribute('title', /Not reachable for 2d/)
    await expect(menu.locator('.foot-keys')).toHaveCount(0)
    await expect(menu.getByRole('button', { name: /Add a site/ })).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/switcher-state-${name}-${browserName}.png` })
  })
}
