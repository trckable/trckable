// The Data view's control row, against a trckabled with the demo data (skipped
// unless TRCKABLE_A11Y_URL points at one, like header):
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test control-row
// A wide screen: two capsules on the right; the first shows the real dates,
// steps with ‹ ›, has the comparison (an icon and a small menu) and Filter, and
// folds (» at its right end, « once folded) to a pill that is remembered; the
// period opens as five choices with More. The site and its cog are one card.
// A phone: one short line, a pill that opens a sheet.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
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

async function open(page: Page, width: number, query = '') {
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

test('the capsule shows the real dates and ‹ › move the period', async ({ page }) => {
  await open(page, 1280)
  const see = page.locator('.ctl-see')
  await expect(see.locator('.range-label')).toHaveText('Last 30 days')
  const shown = (await see.locator('.range-dates').textContent()) ?? ''
  expect(shown).toMatch(dates)
  // At today › is off; ‹ steps back (the period is then its dates), and › steps forward again.
  const next = see.getByRole('button', { name: 'Next period' })
  await expect(next).toBeDisabled()
  await see.getByRole('button', { name: 'Previous period' }).click()
  await expect(next).toBeEnabled()
  await expect(see.locator('.range-label')).not.toHaveText(shown)
  await expect(see.locator('.range-label')).toHaveText(dates)
  await next.click()
  await expect(see.locator('.range-label')).toHaveText(shown)
})

test('comparison, the period and Filter open their popovers, Share and More are named icons', async ({ page }) => {
  await open(page, 1280)
  const see = page.locator('.ctl-see')
  // The comparison is an icon while there is none: no "no comparison" text. Its small menu sets one.
  const compare = see.getByRole('button', { name: 'Compare' })
  await expect(see).not.toContainText(/no comparison/i)
  await compare.click()
  const menu = page.getByRole('menu', { name: 'Compare with' })
  await expect(menu.getByRole('menuitemradio')).toHaveText([/^Period before/, 'Last year', 'Custom'])
  await expect(menu.getByRole('menuitem', { name: 'No comparison' })).toHaveCount(0)
  // Escape closes it and focus goes back to the button that opened it.
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(compare).toBeFocused()
  await compare.click()
  await menu.getByRole('menuitemradio', { name: 'Last year' }).click()
  const set = see.getByRole('button', { name: /^vs / })
  await expect(set).toBeVisible()
  await expect(set).toBeFocused()
  await set.click()
  await menu.getByRole('menuitem', { name: 'No comparison' }).click()
  await expect(see.getByRole('button', { name: 'Compare' })).toBeVisible()
  // The C key still toggles it without the menu.
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('c')
  await expect(see.getByRole('button', { name: /^vs / })).toBeVisible()
  await page.keyboard.press('c')
  await expect(see.getByRole('button', { name: 'Compare' })).toBeVisible()

  const picker = page.getByRole('dialog', { name: 'Choose a date range' })
  await see.locator('.btn.range').click()
  await expect(picker).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  await expect(see.locator('.btn.range')).toBeFocused()

  await see.getByRole('button', { name: 'Filter' }).click()
  await expect(page.locator('.filter-pop')).toBeVisible()
  await expect(page.locator('.filter-pop').getByRole('button', { name: 'Done' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.filter-pop')).toBeHidden()
  await expect(see.getByRole('button', { name: 'Filter' })).toBeFocused()

  const doing = page.locator('.ctl-do')
  for (const name of ['Share', 'More']) {
    const b = doing.getByRole('button', { name, exact: true })
    await expect(b).toBeVisible()
    await expect(b).toHaveText('')
    await expect(b).toHaveClass(/icon/)
  }
  await expect(page.locator('.subbar .btn.primary')).toHaveCount(0)
})

test('the period opens as five choices; More opens the rest in place; compare and Detail apply at once', async ({ page }) => {
  await open(page, 1280)
  const see = page.locator('.ctl-see')
  await see.locator('.btn.range').click()
  const picker = page.getByRole('dialog', { name: 'Choose a date range' })
  await expect(picker).toBeVisible()
  // Five rows and More: no section heads, no clock, none of the rest yet.
  for (const name of [/^Now/, /^Today/, /^Last 7 days/, /^Last 30 days/, /^Last 90 days/]) await expect(picker.getByRole('button', { name })).toBeVisible()
  await expect(picker).not.toContainText(/rolling|calendar|\d:\d\d/i)
  await expect(picker.getByRole('button', { name: /^Yesterday/ })).toHaveCount(0)
  // A key shows only when the row is pointed at.
  const today = picker.getByRole('button', { name: /^Today/ })
  await expect(today.locator('.k')).toHaveCSS('opacity', '0')
  await today.hover()
  await expect(today.locator('.k')).toHaveCSS('opacity', '1')
  await expect(today.locator('.k')).toHaveText('T')
  // More: the other periods, Compare, Detail and Custom dates, in place.
  await picker.getByRole('button', { name: 'More' }).click()
  for (const name of [/^Yesterday/, /^Last 12 months/, /^This week/, /^This month/, /^Last month/, /^This year/, /^Custom dates/]) await expect(picker.getByRole('button', { name })).toBeVisible()
  await expect(picker.getByRole('group', { name: 'Detail' })).toBeVisible()
  // Compare applies at once and the popover stays open; pressing it again clears it.
  await picker.getByRole('group', { name: 'Compare' }).getByRole('button', { name: 'Last year' }).click()
  await expect(picker).toBeVisible()
  await expect(see.getByRole('button', { name: /^vs / })).toBeVisible()
  await picker.getByRole('group', { name: 'Compare' }).getByRole('button', { name: 'Last year' }).click()
  await expect(see.getByRole('button', { name: 'Compare' })).toBeVisible()
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

test('a custom comparison opens the calendar on the comparison\'s own dates', async ({ page }) => {
  await open(page, 1280)
  const see = page.locator('.ctl-see')
  await see.getByRole('button', { name: 'Compare' }).click()
  await page.getByRole('menuitemradio', { name: 'Custom' }).click()
  const picker = page.getByRole('dialog', { name: 'Choose a date range' })
  await expect(picker.getByText('Picking the comparison range')).toBeVisible()
  await picker.getByRole('button', { name: 'Apply' }).click()
  await expect(picker).toBeHidden()
  await expect(see.getByRole('button', { name: /^vs / })).toBeVisible()
})

for (const width of [1280, 390]) {
  test(`at ${width}px the site and its cog are one card`, async ({ page }) => {
    await open(page, width)
    const zone = page.locator('.site-zone')
    const card = (await zone.boundingBox())!
    // A phone's capsules are 46 px (a finger wide), and its cog is in the site list, not beside the name.
    expect(card.height, 'the same height as the capsules under it').toBe(width > 640 ? 38 : 46)
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
    // Always drawn (not only on hover): a border and a fill, with a divider between the two.
    const look = await zone.evaluate((n) => ({ border: getComputedStyle(n).borderTopWidth, fill: getComputedStyle(n).backgroundColor }))
    expect(look.border).toBe('1px')
    expect(look.fill).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    await expect(zone.locator('.site-sep')).toBeVisible()
  })
}

test('both capsules sit at the right edge of the row', async ({ page }) => {
  await open(page, 1280)
  const row = (await page.locator('.subbar').boundingBox())!
  const doing = (await page.locator('.ctl-do').boundingBox())!
  const see = (await page.locator('.ctl-see').boundingBox())!
  expect(row.x + row.width - (doing.x + doing.width), 'the right edge').toBeLessThanOrEqual(24)
  expect(doing.x, 'what you do is after what you see').toBeGreaterThan(see.x + see.width)
  const view = (await page.locator('.subbar .view-switch').boundingBox())!
  expect(see.x - (view.x + view.width), 'flexible space between').toBeGreaterThan(100)
})

test('the first capsule folds to a pill, and the choice is remembered', async ({ page }) => {
  await open(page, 1280, '?f=channel:Direct')
  const toggle = page.locator('.ctl-see .fold-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle).toHaveAccessibleName('Collapse')
  await expect(toggle).toHaveAttribute('title', 'Collapse')
  // At the capsule's right end, after Filter and a divider; its icon is a fold, not a chevron.
  const see = page.locator('.ctl-see')
  const filter = (await see.getByRole('button', { name: 'Filter' }).boundingBox())!
  const at = (await toggle.boundingBox())!
  const capsule = (await see.boundingBox())!
  expect(at.x, 'right of Filter').toBeGreaterThanOrEqual(filter.x + filter.width)
  expect(capsule.x + capsule.width - (at.x + at.width), 'at the capsule end').toBeLessThanOrEqual(4)
  await expect(see.locator('button:visible').last()).toHaveAttribute('aria-expanded', 'true')
  // » while open (its summary is there but hidden), « once folded.
  const turned = () => toggle.locator('.fold-icon').evaluate((n) => getComputedStyle(n).transform)
  await expect(toggle.locator('.fold-icon')).toHaveClass(/chevrons-right/)
  expect(await turned()).toBe('none')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toHaveAccessibleName('Last 30 days, Expand')
  await expect(toggle).toContainText('Last 30 days')
  await expect(toggle.locator('.sum-count')).toHaveText('1')
  expect(await turned()).toMatch(/^matrix\(-1/)
  await expect(page.getByRole('button', { name: 'Previous period' })).toBeHidden()
  // ← still moves the period while folded.
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(/from=/)
  await page.reload()
  await expect(page.locator('.ctl-see .fold-toggle')).toHaveAttribute('aria-expanded', 'false')
  await page.locator('.ctl-see .fold-toggle').click()
  await expect(page.locator('.ctl-see .fold-toggle')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Previous period' })).toBeVisible()
})

test('an active filter shows a count and its chip under the row', async ({ page }) => {
  await open(page, 1280, '?f=channel:Direct')
  await expect(page.locator('.ctl-see .filter-root .filter-count')).toHaveText('1')
  await expect(page.locator('.ctl-under [role=group]')).toBeVisible()
})

for (const width of [390, 360]) {
  test(`at ${width}px the row is one line, and the sheet applies period and filter`, async ({ page }) => {
    await open(page, width, '?f=channel:Direct')
    const box = (await page.locator('.subbar').boundingBox())!
    expect(box.height, 'one line, at most 46 px').toBeLessThanOrEqual(46)
    for (const b of await page.locator('.subbar button:visible').all()) {
      const r = (await b.boundingBox())!
      expect(r.height, 'controls 44 to 46 px').toBeLessThanOrEqual(46)
      expect(r.height, 'controls 44 to 46 px').toBeGreaterThanOrEqual(44)
      expect(r.x + r.width, 'inside the screen').toBeLessThanOrEqual(width)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    // The chips and Views are not in the page row; Views and Share are in ⋯.
    await expect(page.locator('.ctl-under')).toHaveCount(0)
    const pill = page.locator('.phone-pill')
    await expect(pill).toContainText('30 days')
    await expect(pill).toContainText('1 filter')
    // Live/Data sits in the row itself, not only in the sheet.
    await expect(page.locator('.subbar').getByRole('group', { name: 'View' })).toBeVisible()
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await expect(page.getByRole('menu', { name: 'More' }).getByRole('menuitem').first()).toHaveText(/Share/)
    await page.keyboard.press('Escape')

    // The sheet: quick periods, comparison, filters, Done.
    await pill.click()
    const sheet = page.getByRole('dialog', { name: 'View options' })
    await expect(sheet).toBeVisible()
    // Five quick periods; the Compare row says nothing while there is no comparison.
    await expect(sheet.locator('.sheet-quick button')).toHaveCount(5)
    await expect(sheet).not.toContainText(/no comparison/i)
    await sheet.getByRole('button', { name: '7d' }).click()
    await expect(sheet.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet.locator('.chip')).toContainText('Channel is')
    await sheet.getByRole('button', { name: /Remove filter Channel is Direct/ }).click()
    await expect(sheet.getByRole('button', { name: /Remove filter Channel is Direct/ })).toHaveCount(0)
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toBeHidden()
    await expect(pill).toBeFocused()
    await expect(pill).toContainText('7 days')
    await expect(pill).not.toContainText('filter')

    // Escape closes it and returns focus; More hands over to the date-range picker.
    await pill.click()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(pill).toBeFocused()
    await pill.click()
    await sheet.getByRole('button', { name: 'More', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Choose a date range' })
    await expect(picker).toBeVisible()
    await expect(picker.locator(':focus')).toHaveCount(1) // focus moved into it
    await page.keyboard.press('Escape')
    await expect(picker).toBeHidden()
    await expect(pill).toBeFocused()
  })
}

// WCAG 2.1 AA for the row (expanded and folded) and the phone's sheet, both themes.
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
      await page.locator('.ctl-see .fold-toggle').click()
      await scan('row, folded', '.subbar')
      await page.locator('.ctl-see .fold-toggle').click()
      await open(page, 390, '?f=channel:Direct')
      await scan('phone row', '.subbar')
      await page.locator('.phone-pill').click()
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
    await page.locator('.phone-pill').click()
    await page.getByRole('dialog', { name: 'View options' }).getByRole('button', { name: 'Add' }).click()
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
    await expect(page.locator('.phone-pill')).toBeFocused()
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
    await expect(page.locator('.phone-pill')).toContainText('1 filter')
  } finally {
    if (made) await page.evaluate(async ([i, m]) => void (await fetch(`/api/v1/sites/${i}/segments/${m}`, { method: 'DELETE', headers: { 'X-Trckable-Request': '1' } })), [id, made])
  }
})
