// The Data view's control row, against a trckabled with the demo data (skipped
// unless TRCKABLE_A11Y_URL points at one, like header):
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test control-row
// A wide screen: one sticky control line (filters on the left, the period on
// the right, one button "Last 30 days"; the site's name joins it once it is
// stuck). A phone: one 56px line (tabs, a filter button, a short period, ⋯)
// whose filter and period buttons open a sheet each.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './fixtures'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')

// One shared session, made by whichever worker gets there first (sign in is rate limited).
async function session(): Promise<string> {
  const file = join(tmpdir(), `trckable-controlrow-${new URL(BASE!).port}-${process.ppid}`)
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const res = await fetch(BASE + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

async function open(page: Page, width: number, query = '?view=data') {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: await session(), url: BASE! }])
  await page.goto(BASE + '/')
  const domain = await page.evaluate(async () => (await (await fetch('/api/v1/sites')).json()).sites[0].domain as string)
  await page.goto(`${BASE}/${domain}${query}`)
  await expect(page.locator('.overview-chart .chart-wrap svg')).toBeVisible({ timeout: 20_000 })
}

const site = (page: Page) => page.evaluate(async () => (await (await fetch('/api/v1/sites')).json()).sites[0].id as string)

const dates = /^[A-Z][a-z]{2} \d{1,2}( – ([A-Z][a-z]{2} )?\d{1,2})?(, \d{4})?/

test('the period is one button, and it opens the choices', async ({ page }) => {
  await open(page, 1280)
  const see = page.locator('.ctl-see')
  await expect(see.locator('.range-label')).toHaveText('Last 30 days')
  await expect(see.getByRole('button', { name: 'Previous period' })).toBeHidden()
  await see.locator('.btn.range').click()
  await expect(page.getByRole('dialog', { name: 'Choose a date range' })).toBeVisible()
  await page.keyboard.press('Escape')
  // The arrow keys still move it.
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('ArrowLeft')
  await expect(see.locator('.range-label')).not.toHaveText('Last 30 days')
})

test('comparison, the period and Filter open their popovers, Share and More are named icons', async ({ page }) => {
  await open(page, 1280)
  const see = page.locator('.ctl-see')
  // The comparison has no button while there is none; the C key sets one, and then its words follow the period.
  await expect(see).not.toContainText(/no comparison/i)
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('c')
  const set = see.getByRole('button', { name: /^vs / })
  await expect(set).toBeVisible()
  await set.click()
  const menu = page.getByRole('menu', { name: 'Compare with' })
  await expect(menu.getByRole('menuitemradio', { name: 'Period before' })).toHaveAttribute('aria-checked', 'true')
  await menu.getByRole('menuitemradio', { name: 'No comparison' }).click()
  await expect(set).toHaveCount(0)

  const picker = page.getByRole('dialog', { name: 'Choose a date range' })
  await see.locator('.btn.range').click()
  await expect(picker).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  await expect(see.locator('.btn.range')).toBeFocused()

  await page.locator('.ctl-inline').getByRole('button', { name: 'Filter' }).click()
  await expect(page.locator('.filter-pop')).toBeVisible()
  await expect(page.locator('.filter-pop').getByRole('button', { name: 'Done' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.filter-pop')).toBeHidden()
  await expect(page.locator('.ctl-inline').getByRole('button', { name: 'Filter' })).toBeFocused()

  const doing = page.locator('.ctl-do')
  for (const name of ['Share', 'More']) {
    const b = doing.getByRole('button', { name, exact: true })
    await expect(b).toBeVisible()
    await expect(b).toHaveText('')
    await expect(b).toHaveClass(/icon/)
  }
  await expect(page.locator('.subbar .btn.primary')).toHaveCount(0)
})

test('the period opens as six choices; More opens the rest in place; compare and Detail apply at once', async ({ page }) => {
  await open(page, 1280)
  const see = page.locator('.ctl-see')
  await see.locator('.btn.range').click()
  const picker = page.getByRole('dialog', { name: 'Choose a date range' })
  await expect(picker).toBeVisible()
  // Six rows and More: no section heads, no clock, none of the rest yet.
  for (const name of [/^Now/, /^Today/, /^Yesterday/, /^Last 7 days/, /^Last 30 days/, /^Last 90 days/]) await expect(picker.getByRole('button', { name })).toBeVisible()
  await expect(picker).not.toContainText(/rolling|calendar|\d:\d\d/i)
  await expect(picker.getByRole('button', { name: /^Last 12 months/ })).toHaveCount(0)
  // A key shows only when the row is pointed at.
  const today = picker.getByRole('button', { name: /^Today/ })
  await expect(today.locator('.k')).toHaveCSS('opacity', '0')
  await today.hover()
  await expect(today.locator('.k')).toHaveCSS('opacity', '1')
  await expect(today.locator('.k')).toHaveText('T')
  // More: the other periods, Compare, Detail and Custom dates, in place.
  await picker.getByRole('button', { name: 'More' }).click()
  for (const name of [/^Last 12 months/, /^This week/, /^This month/, /^Last month/, /^This year/, /^Custom dates/]) await expect(picker.getByRole('button', { name })).toBeVisible()
  await expect(picker.getByRole('group', { name: 'Detail' })).toBeVisible()
  // Compare applies at once and the popover stays open; pressing it again clears it.
  await picker.getByRole('group', { name: 'Compare' }).getByRole('button', { name: 'Last year' }).click()
  await expect(picker).toBeVisible()
  await expect(see.getByRole('button', { name: /^vs / })).toBeVisible()
  await picker.getByRole('group', { name: 'Compare' }).getByRole('button', { name: 'Last year' }).click()
  await expect(see.getByRole('button', { name: /^vs / })).toHaveCount(0)
  await picker.getByRole('group', { name: 'Detail' }).getByRole('button', { name: 'Daily', exact: true }).click()
  await expect(picker.getByRole('group', { name: 'Detail' }).getByRole('button', { name: 'Daily', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(picker).toBeVisible()
  // Custom dates: the calendar, and back.
  await picker.getByRole('button', { name: /^Custom dates/ }).click()
  await expect(picker.getByLabel('Start date')).toBeVisible()
  await picker.getByRole('button', { name: 'Periods' }).click()
  await expect(today).toBeVisible()
  // Choosing a period closes it.
  await picker.getByRole('button', { name: /^Last 7 days/ }).click()
  await expect(picker).toBeHidden()
  await expect(see.locator('.range-label')).toHaveText('Last 7 days')
})

for (const width of [1280, 390]) {
  test(`at ${width}px the site is plain text with its cog beside it`, async ({ page }) => {
    await open(page, width)
    const zone = page.locator('.site-zone')
    const card = (await zone.boundingBox())!
    // A phone's capsules are 46 px (a finger wide), and its cog is in the site list, not beside the name.
    expect(card.height, 'one control tall').toBe(width > 640 ? 36 : 46)
    const gear = zone.getByRole('button', { name: /^Settings for/ })
    if (width <= 640) {
      await expect(gear).toBeHidden()
      await zone.locator('button.site-btn').click()
      await expect(page.locator('.pop.sites .foot-settings')).toBeVisible()
      return
    }
    await expect(gear).toBeVisible()
    const g = (await gear.boundingBox())!
    expect(g.x, 'the cog is inside the card').toBeGreaterThanOrEqual(card.x)
    expect(g.x + g.width).toBeLessThanOrEqual(card.x + card.width)
    // At rest it has no box of its own: a soft fill only on hover.
    const look = await zone.evaluate((n) => ({ border: getComputedStyle(n).borderTopColor, fill: getComputedStyle(n).backgroundColor }))
    expect(look.border).toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    expect(look.fill).toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
  })
}

test('the period and ⋯ sit at the right edge of the line', async ({ page }) => {
  await open(page, 1280)
  const row = (await page.locator('.subbar').boundingBox())!
  const doing = (await page.locator('.ctl-do').boundingBox())!
  const see = (await page.locator('.ctl-see').boundingBox())!
  expect(row.x + row.width - (doing.x + doing.width), 'the right edge').toBeLessThanOrEqual(40)
  expect(doing.x, 'what you do is after what you see').toBeGreaterThan(see.x + see.width)
  // A desktop has Live/Data in the header's right group, not in this row.
  await expect(page.locator('.subbar .view-switch')).toHaveCount(0)
  const view = (await page.locator('.header-tools .view-switch').boundingBox())!
  const head = (await page.locator('.header-tools').boundingBox())!
  expect(head.x + head.width - (view.x + view.width), 'in the right group, before Peek and the avatar').toBeGreaterThan(40)
})

test('an active filter is a chip on the left of the line, on a desktop', async ({ page }) => {
  await open(page, 1280, '?f=channel:Direct')
  const chips = page.locator('.subbar .ctl-inline [role=group]')
  await expect(chips).toBeVisible()
  await expect(page.locator('.ctl-under')).toHaveCount(0)
  // Chips, then Save view, then Views, icons only and packed at the left; the capsules keep the right.
  const chip = (await chips.boundingBox())!
  const save = (await page.locator('.ctl-inline').getByRole('button', { name: 'Save view' }).boundingBox())!
  const views = (await page.locator('.ctl-inline').getByRole('button', { name: /^Views/ }).boundingBox())!
  const capsule = (await page.locator('.ctl-see').boundingBox())!
  expect(chip.x, 'the chips first').toBeLessThan(save.x)
  expect(save.x, 'then Save view').toBeLessThan(views.x)
  expect(views.x + views.width, 'Views ends before the capsules').toBeLessThan(capsule.x)
  expect(views.x - (save.x + save.width), 'Views follows Save view closely').toBeLessThan(24)
  expect(save.height, 'as tall as a chip').toBe(36)
  expect(views.height, 'as tall as a chip').toBe(36)
  expect(Math.abs(chip.y + chip.height / 2 - (capsule.y + capsule.height / 2)), 'on the capsules\' line').toBeLessThan(6)
})

// Five filters on a 1280 screen: the header is still two rows, and what does not fit is "+N more".
test('five filters at 1280 are one "5 filters" chip on one line', async ({ page }) => {
  const q = ['channel:Direct', 'device:Desktop', 'country:DE', 'browser:Chrome', 'os:macOS'].map((f) => 'f=' + f).join('&')
  await open(page, 1280, '?' + q)
  const row = page.locator('.subbar')
  await expect(page.locator('.subbar .ctl-inline [role=group]')).toBeVisible()
  const more = page.getByRole('button', { name: /^5 filters$/ })
  await expect(more).toBeVisible()
  const box = (await row.boundingBox())!
  expect(box.height, 'one line').toBeLessThanOrEqual(60)
  const capsule = (await page.locator('.ctl-see').boundingBox())!
  const views = page.locator('.ctl-inline').getByRole('button', { name: 'Save view' })
  const save = (await views.boundingBox())!
  expect(save.x + save.width, 'nothing runs under the capsules').toBeLessThan(capsule.x)
  expect(Math.abs(save.y + save.height / 2 - (capsule.y + capsule.height / 2)), 'on the capsules\' line').toBeLessThan(6)
  await more.click()
  await expect(page.getByRole('menu').locator('.menu-row')).toHaveCount(5)
})

test('a tablet keeps the chips in their own row under the line', async ({ page }) => {
  await open(page, 900, '?f=channel:Direct')
  await expect(page.locator('.ctl-under [role=group]')).toBeVisible()
  await expect(page.locator('.ctl-inline [role=group]')).toHaveCount(0)
})

for (const width of [390, 360]) {
  test(`at ${width}px the line is one 56px row, and the sheets apply period and filter`, async ({ page }) => {
    await open(page, width, '?f=channel:Direct')
    const box = (await page.locator('.subbar').boundingBox())!
    expect(box.height, 'one line, 56 px').toBeLessThanOrEqual(58)
    for (const b of await page.locator('.subbar button:visible').all()) {
      const r = (await b.boundingBox())!
      expect(r.height, 'controls 44 px').toBeGreaterThanOrEqual(44)
      expect(r.height, 'controls fit the line').toBeLessThanOrEqual(46)
    }
    for (const b of await page.locator('.pr-btn, .phone-row .ctl-do .btn').all()) {
      const r = (await b.boundingBox())!
      expect(r.x + r.width, 'inside the screen').toBeLessThanOrEqual(width)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    // No chips in the line; the filter button carries the count; the period is short.
    await expect(page.locator('.ctl-under')).toHaveCount(0)
    const filter = page.locator('.pr-filter')
    const date = page.locator('.pr-date')
    await expect(filter.locator('.pr-badge')).toHaveText('1')
    await expect(date).toContainText('30d')
    await expect(page.locator('.subbar').getByRole('group', { name: 'View' })).toBeVisible()
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await expect(page.getByRole('menu', { name: 'More' }).getByRole('menuitem').first()).toHaveText(/Share/)
    await page.keyboard.press('Escape')

    // The date sheet: quick periods, custom range, compare.
    await date.click()
    const sheet = page.getByRole('dialog', { name: 'View options' })
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('.sheet-quick button')).toHaveCount(5)
    await expect(sheet.getByRole('switch', { name: /Compare/ })).toHaveAttribute('aria-checked', 'false')
    await sheet.getByRole('button', { name: '7d' }).click()
    await expect(sheet.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true')
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toBeHidden()
    await expect(date).toBeFocused()
    await expect(date).toContainText('7d')
    await date.click()
    await sheet.getByRole('button', { name: 'Custom range' }).click()
    const picker = page.getByRole('dialog', { name: 'Choose a date range' })
    await expect(picker).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(picker).toBeHidden()

    // The filter sheet: the filters in force with their x, Add, Clear all.
    await filter.click()
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('.chip')).toContainText('Channel is')
    await expect(sheet.getByRole('button', { name: '+ Add a filter' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Clear all' })).toBeVisible()
    await sheet.getByRole('button', { name: /Remove filter Channel is Direct/ }).click()
    await expect(sheet.getByRole('button', { name: /Remove filter Channel is Direct/ })).toHaveCount(0)
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(filter.locator('.pr-badge')).toHaveCount(0)
    await filter.click()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(filter).toBeFocused()
  })
}

test('on a phone the header scrolls away and the control line stays, at the same size', async ({ page }) => {
  await open(page, 390)
  const line = page.locator('.subbar')
  const before = (await line.boundingBox())!
  await page.evaluate(() => window.scrollTo(0, 700))
  await expect(line).toHaveAttribute('data-stuck', 'true')
  const after = (await line.boundingBox())!
  expect(after.y, 'at the top').toBeLessThanOrEqual(1)
  expect(after.height, 'the same height').toBe(before.height)
  expect(await page.locator('.header').boundingBox().then((b) => b!.y + b!.height), 'the header is above the screen').toBeLessThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})

test('on a desktop the line sticks as glass at the same size, with the site name', async ({ page }) => {
  await open(page, 1280)
  const line = page.locator('.subbar')
  const before = (await line.boundingBox())!
  await expect(page.locator('.ctl-site')).toBeHidden()
  await page.evaluate(() => window.scrollTo(0, 700))
  await expect(line).toHaveAttribute('data-stuck', 'true')
  await expect(page.locator('.ctl-site')).toBeVisible()
  const after = (await line.boundingBox())!
  expect(after.height, 'the same height').toBe(before.height)
  expect(after.height).toBeGreaterThanOrEqual(56)
  // Nothing in it is taller than 36 px, and all of it is on one centre line.
  const mids: number[] = []
  for (const b of await line.locator('button:visible').all()) {
    const r = (await b.boundingBox())!
    expect(r.height).toBeLessThanOrEqual(36)
    mids.push(Math.round(r.y + r.height / 2))
  }
  expect(Math.max(...mids) - Math.min(...mids), 'one centre line').toBeLessThanOrEqual(2)
  // The header is not sticky.
  expect(await page.locator('.header').boundingBox().then((b) => b!.y + b!.height)).toBeLessThan(0)
})

// WCAG 2.1 AA for the row and the phone's sheet, both themes.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme })
    test('the row and the sheet meet WCAG 2.1 AA', async ({ page }) => {
      const scan = async (where: string, include: string) => {
        await page.waitForTimeout(400)
        const { violations } = await new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
        const found = violations.flatMap((v) => v.nodes.map((n) => `${where}: ${v.id} — ${n.any?.[0]?.message ?? v.help}\n    ${n.html.slice(0, 160)}`))
        expect(found, where).toEqual([])
      }
      await open(page, 1280, '?f=channel:Direct')
      await scan('row, expanded', '.subbar')
      await open(page, 390, '?f=channel:Direct')
      await scan('phone row', '.subbar')
      await page.locator('.pr-filter').click()
      await scan('phone sheet', '[role=dialog]')
    })
  })
}

test('a phone: Add in the sheet opens the filter menu on screen, and Views in ⋯ works by keyboard', async ({ page }) => {
  await open(page, 390)
  const id = await site(page)
  const name = `Direct only ${Date.now()}`
  const made = await page.evaluate(async ([i, n]) => {
    const r = await fetch(`/api/v1/sites/${i}/segments`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Trckable-Request': '1' }, body: JSON.stringify({ name: n, query: 'f=channel:Direct' }) })
    return r.ok ? ((await r.json()) as { id: string }).id : ''
  }, [id, name])
  try {
    await page.reload()
    await expect(page.locator('.overview-chart .chart-wrap svg')).toBeVisible({ timeout: 20_000 })
    // Add: the sheet closes, the filter menu opens, inside the screen.
    await page.locator('.pr-filter').click()
    await page.getByRole('dialog', { name: 'View options' }).getByRole('button', { name: '+ Add a filter' }).click()
    await expect(page.getByRole('dialog', { name: 'View options' })).toBeHidden()
    const menu = page.locator('.filter-pop')
    await expect(menu).toBeVisible()
    const r = (await menu.boundingBox())!
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.x + r.width).toBeLessThanOrEqual(390)
    expect(r.y).toBeGreaterThanOrEqual(0)
    await expect(menu.locator(':focus')).toHaveCount(1) // focus moved into it
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(page.locator('.pr-filter')).toBeFocused()
    // Views: a real menu item, reached with the arrows; it closes ⋯ and opens the list; a pick closes it.
    const more = page.getByRole('button', { name: 'More', exact: true })
    await more.focus()
    await page.keyboard.press('Enter')
    const items = page.getByRole('menu', { name: 'More' }).getByRole('menuitem')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(items.nth(1)).toHaveText(/Views/)
    await expect(items.nth(1)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu', { name: 'More' })).toBeHidden()
    const pick = page.locator('.sv-name', { hasText: name })
    await expect(pick).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(pick).toBeHidden()
    await expect(more).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await pick.click()
    await expect(pick).toBeHidden()
    await expect(more).toBeFocused()
    await expect(page.locator('.pr-filter .pr-badge')).toHaveText('1')
  } finally {
    if (made) await page.evaluate(async ([i, m]) => void (await fetch(`/api/v1/sites/${i}/segments/${m}`, { method: 'DELETE', headers: { 'X-Trckable-Request': '1' } })), [id, made])
  }
})
